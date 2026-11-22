import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PersonalMoneyKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

const SESSION_START = '__SESSION_START__';
const ASSISTANT_NAME = 'Aura';

type MemoryMsg = { role: 'user' | 'assistant'; content: string };

type LifeContext = {
  today: string;
  firstName: string;
  money: {
    incomeCOP: number;
    expenseCOP: number;
    balanceCOP: number;
    recent: {
      kind: string;
      amount: number;
      category: string;
      note: string | null;
      day: string;
    }[];
    budgets: { category: string; limitCOP: number; spentCOP: number }[];
  };
  ideas: { title: string; starred: boolean; tags: string[] }[];
  notes: { title: string | null; preview: string; tags: string[] }[];
  wellness: {
    day: string;
    mood: number;
    health: number;
    love: number;
    friendships: number;
    family: number;
    note: string | null;
  }[];
  tasksToday: { id: string; title: string; completed: boolean }[];
  upcomingEvents: { title: string; startsAt: string }[];
};

type AuraAction =
  | {
      type: 'add_money';
      kind: PersonalMoneyKind;
      amountCOP: number;
      category: string;
      note?: string;
    }
  | { type: 'add_task'; title: string }
  | { type: 'complete_task'; title: string }
  | { type: 'add_idea'; title: string; body?: string; starred?: boolean }
  | { type: 'add_note'; title?: string; body: string }
  | {
      type: 'set_wellness';
      mood?: number;
      health?: number;
      love?: number;
      friendships?: number;
      family?: number;
      note?: string;
    }
  | {
      type: 'add_event';
      title: string;
      startsAt: Date;
      endsAt: Date;
      allDay?: boolean;
    }
  | { type: 'set_budget'; category: string; limitCOP: number };

@Injectable()
export class AuraService {
  private readonly logger = new Logger(AuraService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async history(tenant: TenantContext) {
    const rows = await this.prisma.personalAssistantMessage.findMany({
      where: { companyId: tenant.companyId, userId: tenant.userId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return {
      messages: rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
      })),
      assistantName: ASSISTANT_NAME,
    };
  }

  async ask(tenant: TenantContext, questionRaw: string, userName?: string) {
    const question = questionRaw.trim();
    if (!question) {
      return {
        answer: 'Contame un poco más y seguimos.',
        assistantName: ASSISTANT_NAME,
      };
    }

    const isStart = question === SESSION_START;
    if (!isStart) {
      await this.prisma.personalAssistantMessage.create({
        data: {
          companyId: tenant.companyId,
          userId: tenant.userId,
          role: 'user',
          content: question,
        },
      });
    }

    const first = userName?.trim().split(/\s+/)[0] || 'amigo';
    let life = await this.buildLifeContext(tenant, first);
    const memory = await this.loadMemory(tenant);

    let actionsDone: string[] = [];
    let engine = 'aura-local';

    if (!isStart) {
      const parsed = this.parseActions(question, life);
      if (parsed.length) {
        actionsDone = await this.executeActions(tenant, parsed, life);
        life = await this.buildLifeContext(tenant, first);
      }
    }

    let answer: string | null = null;

    if (isStart) {
      const aiGreeting = await this.askOpenAi({
        question: `Saludá a ${first} como Aura al abrir el chat. Presentate breve y mencioná que podés actuar (gastos, tareas, ideas, bienestar).`,
        first,
        memory,
        life,
        allowTools: false,
      });
      if (aiGreeting) {
        answer = aiGreeting.answer;
        engine = aiGreeting.engine;
      } else {
        answer = this.localGreeting(life);
        engine = 'aura-local';
      }
    } else if (actionsDone.length) {
      answer = this.actionReply(life, actionsDone, question);
      engine = 'aura-actions';
    } else {
      const fromAi = await this.askOpenAi({
        question,
        first,
        memory,
        life,
        allowTools: true,
        tenant,
      });
      if (fromAi) {
        answer = fromAi.answer;
        engine = fromAi.engine;
        if (fromAi.actionsDone?.length) {
          actionsDone = fromAi.actionsDone;
          life = await this.buildLifeContext(tenant, first);
        }
      } else {
        answer = this.localReply(question, life, memory);
        engine = 'aura-local';
      }
    }

    await this.prisma.personalAssistantMessage.create({
      data: {
        companyId: tenant.companyId,
        userId: tenant.userId,
        role: 'assistant',
        content: answer!,
      },
    });

    return {
      answer: answer!,
      assistantName: ASSISTANT_NAME,
      engine,
      actions: actionsDone,
    };
  }

  async clear(tenant: TenantContext) {
    await this.prisma.personalAssistantMessage.deleteMany({
      where: { companyId: tenant.companyId, userId: tenant.userId },
    });
    return { ok: true, assistantName: ASSISTANT_NAME };
  }

  private async loadMemory(tenant: TenantContext): Promise<MemoryMsg[]> {
    const rows = await this.prisma.personalAssistantMessage.findMany({
      where: { companyId: tenant.companyId, userId: tenant.userId },
      orderBy: { createdAt: 'desc' },
      take: 28,
    });
    return rows.reverse().map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
  }

  private async buildLifeContext(
    tenant: TenantContext,
    firstName: string,
  ): Promise<LifeContext> {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      monthMoney,
      recentMoney,
      ideas,
      notes,
      wellness,
      tasksToday,
      events,
      budgets,
    ] = await Promise.all([
      this.prisma.personalMoneyEntry.findMany({
        where: {
          companyId: tenant.companyId,
          occurredOn: { gte: monthStart },
        },
      }),
      this.prisma.personalMoneyEntry.findMany({
        where: { companyId: tenant.companyId },
        orderBy: { occurredOn: 'desc' },
        take: 10,
      }),
      this.prisma.personalIdea.findMany({
        where: { companyId: tenant.companyId },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      this.prisma.companyJournalEntry.findMany({
        where: { companyId: tenant.companyId },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      this.prisma.personalWellnessCheckIn.findMany({
        where: { companyId: tenant.companyId, authorId: tenant.userId },
        orderBy: { checkedOn: 'desc' },
        take: 14,
      }),
      this.prisma.companyTask.findMany({
        where: { companyId: tenant.companyId, taskDate: today },
        take: 20,
      }),
      this.prisma.personalCalendarEvent.findMany({
        where: {
          companyId: tenant.companyId,
          startsAt: { gte: now, lte: weekAhead },
        },
        orderBy: { startsAt: 'asc' },
        take: 8,
      }),
      this.prisma.personalMoneyBudget.findMany({
        where: { companyId: tenant.companyId, month: monthStart },
      }),
    ]);

    const incomeCOP = monthMoney
      .filter((m) => m.kind === 'INCOME')
      .reduce((s, m) => s + Number(m.amountCOP), 0);
    const expenseCOP = monthMoney
      .filter((m) => m.kind === 'EXPENSE')
      .reduce((s, m) => s + Number(m.amountCOP), 0);

    const spentByCat = new Map<string, number>();
    for (const m of monthMoney) {
      if (m.kind !== 'EXPENSE') continue;
      spentByCat.set(
        m.category,
        (spentByCat.get(m.category) ?? 0) + Number(m.amountCOP),
      );
    }

    return {
      today,
      firstName,
      money: {
        incomeCOP,
        expenseCOP,
        balanceCOP: incomeCOP - expenseCOP,
        recent: recentMoney.map((m) => ({
          kind: m.kind,
          amount: Number(m.amountCOP),
          category: m.category,
          note: m.note,
          day: m.occurredOn.toISOString().slice(0, 10),
        })),
        budgets: budgets.map((b) => ({
          category: b.category,
          limitCOP: Number(b.limitCOP),
          spentCOP: spentByCat.get(b.category) ?? 0,
        })),
      },
      ideas: ideas.map((i) => ({
        title: i.title,
        starred: i.starred,
        tags: i.tags,
      })),
      notes: notes.map((n) => ({
        title: n.title,
        preview: n.body.slice(0, 160),
        tags: n.tags,
      })),
      wellness: wellness.map((w) => ({
        day: w.checkedOn.toISOString().slice(0, 10),
        mood: w.mood,
        health: w.health,
        love: w.love,
        friendships: w.friendships,
        family: w.family,
        note: w.note,
      })),
      tasksToday: tasksToday.map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
      })),
      upcomingEvents: events.map((e) => ({
        title: e.title,
        startsAt: e.startsAt.toISOString(),
      })),
    };
  }

  private moneyFmt(n: number) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(n);
  }

  private parseAmount(raw: string): number | null {
    const cleaned = raw
      .toLowerCase()
      .replace(/\$/g, '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '');
    const mil = cleaned.match(/^(\d+(?:\.\d+)?)mil$/);
    if (mil) return Math.round(Number(mil[1]) * 1000);
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private parseActions(question: string, life: LifeContext): AuraAction[] {
    const q = question.trim();
    const lower = q.toLowerCase();
    const actions: AuraAction[] = [];

    // Dinero: "gasté 50000 en comida", "ingreso 150000 salario"
    const moneyMatch = lower.match(
      /(?:gast[eé]|gaste|pagu[eé]|pague|salida|egreso|compr[eé])\s+(?:de\s+)?(\$?[\d.\s]+(?:mil)?)\s*(?:en|de|por)?\s*(.*)?$/i,
    ) ||
      lower.match(
        /(?:ingres[oé]|recib[ií]|cobr[eé]|entrada)\s+(?:de\s+)?(\$?[\d.\s]+(?:mil)?)\s*(?:de|por|en)?\s*(.*)?$/i,
      ) ||
      lower.match(
        /(?:anot[aá]|registr[aá]|sum[aá])\s+(?:un\s+)?(gasto|ingreso)\s+(?:de\s+)?(\$?[\d.\s]+(?:mil)?)\s*(?:en|de|por)?\s*(.*)?$/i,
      );

    if (moneyMatch) {
      const isExplicit =
        moneyMatch[1] === 'gasto' || moneyMatch[1] === 'ingreso';
      const amountRaw = isExplicit ? moneyMatch[2]! : moneyMatch[1]!;
      const rest = (isExplicit ? moneyMatch[3] : moneyMatch[2]) || '';
      const amount = this.parseAmount(amountRaw);
      if (amount) {
        const isIncome =
          (isExplicit && moneyMatch[1] === 'ingreso') ||
          /ingres|recib|cobr|entrada|salario|sueldo/.test(lower);
        const category =
          rest
            .replace(/^(en|de|por)\s+/i, '')
            .trim()
            .slice(0, 80) || (isIncome ? 'ingreso' : 'general');
        actions.push({
          type: 'add_money',
          kind: isIncome ? PersonalMoneyKind.INCOME : PersonalMoneyKind.EXPENSE,
          amountCOP: amount,
          category: category || (isIncome ? 'ingreso' : 'general'),
          note: q.slice(0, 200),
        });
      }
    }

    // Tarea
    const taskMatch =
      lower.match(
        /(?:agreg[aá]|cre[aá]|anot[aá]|sum[aá]|nueva)\s+(?:una\s+)?tarea\s*[:\-]?\s*(.+)$/i,
      ) ||
      lower.match(/recu[eé]rdame\s+(.+)$/i) ||
      lower.match(/^tarea\s*[:\-]\s*(.+)$/i);
    if (taskMatch?.[1]) {
      actions.push({ type: 'add_task', title: taskMatch[1].trim().slice(0, 200) });
    }

    const completeMatch = lower.match(
      /(?:complet[eé]|termin[eé]|listo|hecha?)\s+(?:la\s+)?tarea\s*[:\-]?\s*(.+)$/i,
    );
    if (completeMatch?.[1]) {
      actions.push({
        type: 'complete_task',
        title: completeMatch[1].trim().slice(0, 200),
      });
    }

    // Idea
    const ideaMatch =
      lower.match(
        /(?:guard[aá]|anot[aá]|sum[aá]|cre[aá])\s+(?:esta\s+)?idea\s*[:\-]?\s*(.+)$/i,
      ) || lower.match(/^idea\s*[:\-]\s*(.+)$/i);
    if (ideaMatch?.[1]) {
      const title = ideaMatch[1].trim().slice(0, 200);
      actions.push({
        type: 'add_idea',
        title,
        body: title,
        starred: /importante|destac|★|\*/.test(lower),
      });
    }

    // Nota / diario
    const noteMatch =
      lower.match(
        /(?:anot[aá]|escrib[ií]|guard[aá])\s+(?:en\s+)?(?:el\s+)?(?:diario|notas?)\s*[:\-]?\s*(.+)$/i,
      ) || lower.match(/^nota\s*[:\-]\s*(.+)$/i);
    if (noteMatch?.[1] && !taskMatch && !ideaMatch) {
      const body = noteMatch[1].trim().slice(0, 4000);
      actions.push({
        type: 'add_note',
        title: body.slice(0, 60),
        body,
      });
    }

    // Bienestar: "ánimo 7 salud 6 amor 5 amistades 8 familia 9"
    const scores: Record<string, number> = {};
    const dimRe =
      /(ánimo|animo|mood|salud|health|amor|love|amistades|amigos|familia|family)\s*[:=\-]?\s*(\d{1,2})/gi;
    let m: RegExpExecArray | null;
    while ((m = dimRe.exec(lower))) {
      const key = m[1]!.toLowerCase();
      const val = Math.min(10, Math.max(1, Number(m[2])));
      if (/ánimo|animo|mood/.test(key)) scores.mood = val;
      else if (/salud|health/.test(key)) scores.health = val;
      else if (/amor|love/.test(key)) scores.love = val;
      else if (/amist|amigo/.test(key)) scores.friendships = val;
      else if (/familia|family/.test(key)) scores.family = val;
    }
    if (
      Object.keys(scores).length >= 1 &&
      /(bienestar|check|ánimo|animo|salud|amor|amist|familia|me siento)/.test(
        lower,
      )
    ) {
      const latest = life.wellness[0];
      actions.push({
        type: 'set_wellness',
        mood: scores.mood ?? latest?.mood ?? 5,
        health: scores.health ?? latest?.health ?? 5,
        love: scores.love ?? latest?.love ?? 5,
        friendships: scores.friendships ?? latest?.friendships ?? 5,
        family: scores.family ?? latest?.family ?? 5,
        note: /me siento/.test(lower) ? q.slice(0, 200) : undefined,
      });
    }

    // Presupuesto
    const budgetMatch = lower.match(
      /presupuesto\s+(?:de\s+)?([\wáéíóúñ\s]+?)\s+(?:de\s+)?(\$?[\d.\s]+(?:mil)?)/i,
    );
    if (budgetMatch) {
      const amount = this.parseAmount(budgetMatch[2]!);
      if (amount) {
        actions.push({
          type: 'set_budget',
          category: budgetMatch[1]!.trim().slice(0, 80),
          limitCOP: amount,
        });
      }
    }

    // Evento simple: "agenda mañana dentista" / "evento hoy 15:00 reunión"
    const eventMatch =
      lower.match(
        /(?:agend[aá]|evento|cita)\s+(hoy|mañana|manana)?\s*(?:a\s+las?\s+(\d{1,2})(?::(\d{2}))?)?\s*[:\-]?\s*(.+)$/i,
      );
    if (eventMatch?.[4]) {
      const base = new Date();
      if (/mañana|manana/.test(eventMatch[1] || '')) {
        base.setDate(base.getDate() + 1);
      }
      const hour = eventMatch[2] ? Number(eventMatch[2]) : 9;
      const minute = eventMatch[3] ? Number(eventMatch[3]) : 0;
      base.setHours(hour, minute, 0, 0);
      const end = new Date(base.getTime() + 60 * 60 * 1000);
      actions.push({
        type: 'add_event',
        title: eventMatch[4].trim().slice(0, 200),
        startsAt: base,
        endsAt: end,
        allDay: !eventMatch[2],
      });
    }

    return actions;
  }

  private async executeActions(
    tenant: TenantContext,
    actions: AuraAction[],
    life: LifeContext,
  ): Promise<string[]> {
    const done: string[] = [];
    const today = life.today;
    const month = `${today.slice(0, 7)}-01`;

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'add_money': {
            await this.prisma.personalMoneyEntry.create({
              data: {
                companyId: tenant.companyId,
                authorId: tenant.userId,
                kind: action.kind,
                amountCOP: new Prisma.Decimal(action.amountCOP),
                category: action.category,
                note: action.note ?? null,
                occurredOn: new Date(`${today}T00:00:00.000Z`),
              },
            });
            done.push(
              `${action.kind === 'INCOME' ? 'Ingreso' : 'Gasto'} ${this.moneyFmt(action.amountCOP)} en ${action.category}`,
            );
            break;
          }
          case 'add_task': {
            await this.prisma.companyTask.create({
              data: {
                companyId: tenant.companyId,
                taskDate: today,
                title: action.title,
                createdById: tenant.userId,
              },
            });
            done.push(`Tarea creada: ${action.title}`);
            break;
          }
          case 'complete_task': {
            const needle = action.title.toLowerCase();
            const task = life.tasksToday.find(
              (t) =>
                !t.completed &&
                (t.title.toLowerCase().includes(needle) ||
                  needle.includes(t.title.toLowerCase())),
            );
            if (task) {
              await this.prisma.companyTask.update({
                where: { id: task.id },
                data: { completed: true },
              });
              done.push(`Tarea completada: ${task.title}`);
            } else {
              done.push(`No encontré la tarea “${action.title}” para marcar`);
            }
            break;
          }
          case 'add_idea': {
            await this.prisma.personalIdea.create({
              data: {
                companyId: tenant.companyId,
                authorId: tenant.userId,
                title: action.title,
                body: action.body || action.title,
                tags: [],
                starred: Boolean(action.starred),
              },
            });
            done.push(`Idea guardada: ${action.title}`);
            break;
          }
          case 'add_note': {
            await this.prisma.companyJournalEntry.create({
              data: {
                companyId: tenant.companyId,
                authorId: tenant.userId,
                title: action.title ?? null,
                body: action.body,
                tags: ['aura'],
              },
            });
            done.push(`Nota guardada en el diario`);
            break;
          }
          case 'set_wellness': {
            const checkedOn = new Date(`${today}T00:00:00.000Z`);
            await this.prisma.personalWellnessCheckIn.upsert({
              where: {
                companyId_authorId_checkedOn: {
                  companyId: tenant.companyId,
                  authorId: tenant.userId,
                  checkedOn,
                },
              },
              create: {
                companyId: tenant.companyId,
                authorId: tenant.userId,
                checkedOn,
                mood: action.mood ?? 5,
                health: action.health ?? 5,
                love: action.love ?? 5,
                friendships: action.friendships ?? 5,
                family: action.family ?? 5,
                note: action.note ?? null,
              },
              update: {
                mood: action.mood ?? 5,
                health: action.health ?? 5,
                love: action.love ?? 5,
                friendships: action.friendships ?? 5,
                family: action.family ?? 5,
                note: action.note ?? null,
              },
            });
            done.push(
              `Bienestar actualizado (ánimo ${action.mood}/10 · salud ${action.health}/10)`,
            );
            break;
          }
          case 'add_event': {
            await this.prisma.personalCalendarEvent.create({
              data: {
                companyId: tenant.companyId,
                authorId: tenant.userId,
                title: action.title,
                startsAt: action.startsAt,
                endsAt: action.endsAt,
                allDay: Boolean(action.allDay),
              },
            });
            done.push(`Evento agendado: ${action.title}`);
            break;
          }
          case 'set_budget': {
            const monthDate = new Date(`${month}T00:00:00.000Z`);
            await this.prisma.personalMoneyBudget.upsert({
              where: {
                companyId_category_month: {
                  companyId: tenant.companyId,
                  category: action.category,
                  month: monthDate,
                },
              },
              create: {
                companyId: tenant.companyId,
                authorId: tenant.userId,
                category: action.category,
                month: monthDate,
                limitCOP: new Prisma.Decimal(action.limitCOP),
              },
              update: {
                limitCOP: new Prisma.Decimal(action.limitCOP),
              },
            });
            done.push(
              `Presupuesto ${action.category}: ${this.moneyFmt(action.limitCOP)}`,
            );
            break;
          }
        }
      } catch (err) {
        this.logger.warn(
          `Aura action ${action.type} failed: ${(err as Error).message}`,
        );
        done.push(`No pude completar: ${action.type}`);
      }
    }
    return done;
  }

  private actionReply(
    life: LifeContext,
    actionsDone: string[],
    question: string,
  ): string {
    const lines = [
      `Listo, **${life.firstName}**. Ya quedó registrado:`,
      ...actionsDone.map((a) => `• ${a}`),
      '',
      `Balance del mes: **${this.moneyFmt(life.money.balanceCOP)}** · pendientes hoy: ${life.tasksToday.filter((t) => !t.completed).length}`,
      '',
      '¿Seguimos con otra cosa o miramos el panorama?',
    ];
    if (/gracias|listo|ok|dale/.test(question.toLowerCase())) {
      lines[0] = `De una, ${life.firstName}. Quedó así:`;
    }
    return lines.join('\n');
  }

  private localGreeting(life: LifeContext): string {
    const pending = life.tasksToday.filter((t) => !t.completed).length;
    const latest = life.wellness[0];
    const lines = [
      `Hola **${life.firstName}**. Soy **Aura**, tu asistente personal en Main.`,
      '',
      'Puedo conversar y también actuar: anotar gastos, tareas, ideas, notas, bienestar y eventos.',
    ];
    const pulses: string[] = [];
    if (life.money.incomeCOP || life.money.expenseCOP) {
      pulses.push(
        `• Este mes: balance ${this.moneyFmt(life.money.balanceCOP)}`,
      );
    }
    if (pending > 0) pulses.push(`• Hoy: **${pending}** pendiente${pending === 1 ? '' : 's'}`);
    if (latest) {
      pulses.push(
        `• Bienestar: ánimo ${latest.mood}/10 · salud ${latest.health}/10`,
      );
    }
    if (life.ideas.length) pulses.push(`• Ideas en vault: ${life.ideas.length}`);
    if (pulses.length) lines.push('', 'Pulso:', ...pulses);
    lines.push(
      '',
      'Probá: “gasté 20000 en café”, “tarea: llamar a mamá”, “idea: app de hábitos”, “ánimo 7 salud 6”.',
      '',
      '¿Cómo venís hoy?',
    );
    return lines.join('\n');
  }

  private localReply(
    question: string,
    life: LifeContext,
    memory: MemoryMsg[],
  ): string {
    const q = question.toLowerCase();
    const name = life.firstName;

    if (/(hola|buenas|hey|qué tal|que tal)/.test(q)) {
      return this.localGreeting(life);
    }

    if (/(quién sos|quien sos|cómo te llamás|como te llamas|tu nombre|qué podés|que podes|qué puedes)/.test(q)) {
      return [
        `Soy **Aura**, tu compañera de vida en Main.`,
        '',
        'Personalidad: cercana, clara, sin humo. Te acompaño a ordenar la vida.',
        '',
        'Puedo:',
        '• Registrar gastos/ingresos y presupuestos',
        '• Crear y completar tareas',
        '• Guardar ideas y notas del diario',
        '• Actualizar bienestar (ánimo, salud, amor, amistades, familia)',
        '• Agendar eventos',
        '• Contarte el panorama con tus datos reales',
        '',
        'Decime qué querés hacer y lo hacemos.',
      ].join('\n');
    }

    if (/(dinero|finanzas|plata|gasto|ingreso|balance|presupuesto)/.test(q)) {
      const lines = [
        `**${name}**, tu plata este mes:`,
        `• Ingresos: ${this.moneyFmt(life.money.incomeCOP)}`,
        `• Gastos: ${this.moneyFmt(life.money.expenseCOP)}`,
        `• Balance: **${this.moneyFmt(life.money.balanceCOP)}**`,
      ];
      if (life.money.budgets.length) {
        lines.push('', 'Presupuestos:');
        for (const b of life.money.budgets.slice(0, 5)) {
          lines.push(
            `• ${b.category}: ${this.moneyFmt(b.spentCOP)} / ${this.moneyFmt(b.limitCOP)}`,
          );
        }
      }
      if (life.money.recent.length) {
        lines.push('', 'Últimos movimientos:');
        for (const m of life.money.recent.slice(0, 4)) {
          const sign = m.kind === 'INCOME' ? '+' : '−';
          lines.push(
            `• ${m.day} ${sign}${this.moneyFmt(m.amount)} · ${m.category}`,
          );
        }
      }
      lines.push(
        '',
        'Para registrar: “gasté 35000 en almuerzo” o “ingreso 500000 salario”.',
      );
      return lines.join('\n');
    }

    if (/(tarea|tiempo|pendiente|hacer hoy)/.test(q)) {
      const pending = life.tasksToday.filter((t) => !t.completed);
      if (!life.tasksToday.length) {
        return `Hoy no hay tareas, ${name}. Decime “tarea: …” y la creo al toque.`;
      }
      const lines = [`**Hoy (${life.today})**`];
      if (pending.length) {
        lines.push('Pendientes:');
        for (const t of pending.slice(0, 8)) lines.push(`• ${t.title}`);
      } else lines.push('Nada pendiente. Bien.');
      lines.push('', 'Para agregar: “tarea: comprar mercado”. Para cerrar: “completé la tarea comprar mercado”.');
      return lines.join('\n');
    }

    if (/(ánimo|animo|bienestar|salud|amor|amistad|familia|me siento)/.test(q)) {
      const latest = life.wellness[0];
      if (!latest) {
        return `Sin check-ins aún. Probá: “ánimo 7 salud 6 amor 8 amistades 7 familia 9”.`;
      }
      return [
        `Último bienestar (${latest.day}):`,
        `• Ánimo ${latest.mood}/10 · Salud ${latest.health}/10`,
        `• Amor ${latest.love}/10 · Amistades ${latest.friendships}/10 · Familia ${latest.family}/10`,
        '',
        latest.mood <= 4 || latest.health <= 4
          ? 'Hay zona baja. Un paso chico hoy: agua, aire o escribir una nota. ¿Qué te pesa más?'
          : 'Se ve estable. ¿Querés actualizar algún número?',
      ].join('\n');
    }

    if (/(idea|vault)/.test(q)) {
      if (!life.ideas.length) {
        return `Vault vacío. Decime “idea: …” y la guardo.`;
      }
      const lines = [`Ideas (${life.ideas.length}):`];
      for (const i of life.ideas.slice(0, 5)) {
        lines.push(`• ${i.starred ? '★ ' : ''}${i.title}`);
      }
      lines.push('', 'Para guardar otra: “idea: …”');
      return lines.join('\n');
    }

    if (/(nota|diario|journal)/.test(q)) {
      if (!life.notes.length) {
        return `Sin notas todavía. Decime “nota: hoy pensé que…” y la dejo en el diario.`;
      }
      const lines = ['Notas recientes:'];
      for (const n of life.notes.slice(0, 4)) {
        lines.push(`• ${n.title || 'Sin título'}: ${n.preview}`);
      }
      return lines.join('\n');
    }

    if (/(calendario|agenda|evento|cita)/.test(q)) {
      if (!life.upcomingEvents.length) {
        return `Sin eventos próximos. Probá: “agenda mañana 10:00 dentista”.`;
      }
      const lines = ['Próximos eventos:'];
      for (const e of life.upcomingEvents) {
        lines.push(`• ${e.title} · ${e.startsAt.slice(0, 16).replace('T', ' ')}`);
      }
      return lines.join('\n');
    }

    const pending = life.tasksToday.filter((t) => !t.completed).length;
    const prior = memory
      .filter((m) => m.role === 'user' && m.content !== SESSION_START)
      .at(-1)?.content;
    return [
      `Te leo, ${name}.`,
      '',
      `Panorama: balance ${this.moneyFmt(life.money.balanceCOP)} · ${pending} pendientes · ${life.ideas.length} ideas.`,
      prior ? `Lo último que me dijiste: “${prior.slice(0, 100)}”.` : '',
      '',
      'Puedo actuar ya. Ejemplos:',
      '• “gasté 12000 en transporte”',
      '• “tarea: revisar presupuesto”',
      '• “idea: viaje a la costa”',
      '• “ánimo 8 salud 7”',
      '',
      '¿Qué hacemos?',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private personalitySystem(first: string): string {
    return `Eres **Aura**, asistente personal de vida en Main (VOS IA) para ${first}.

IDENTIDAD:
- Mujer asistente cálida, inteligente, directa. Español colombiano (tutear).
- No sos bot de empresa. Acompañás orden, conciencia y bienestar.
- Humor suave, sin sarcasmo hiriente. Nunca digas que sos GPT/OpenAI.

CAPACIDADES (y las usás de verdad con herramientas cuando el usuario pide actuar):
1. Finanzas: registrar gastos/ingresos, ver balance, presupuestos
2. Tiempo: crear/completar tareas del día
3. Ideas: guardar en el vault
4. Notas: escribir en el diario
5. Bienestar: ánimo, salud, amor, amistades, familia (1-10)
6. Calendario: agendar eventos
7. Conversar con memoria usando CONTEXTO_VIDA

REGLAS:
- Hechos solo del CONTEXTO_VIDA + historial. No inventes cifras.
- Si el usuario pide registrar algo y tenés datos suficientes, USÁ la herramienta.
- Si falta un dato clave (monto, título), preguntá UNA cosa.
- Respuestas humanas, máx ~12 líneas. Cierre con micro-acción o pregunta.`;
  }

  private async askOpenAi(opts: {
    question: string;
    first: string;
    memory: MemoryMsg[];
    life: LifeContext;
    allowTools: boolean;
    tenant?: TenantContext;
  }): Promise<{ answer: string; engine: string; actionsDone?: string[] } | null> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) return null;
    const model =
      this.config.get<string>('OPENAI_CHAT_MODEL')?.trim() || 'gpt-4o';

    const tools = opts.allowTools
      ? [
          {
            type: 'function',
            function: {
              name: 'add_money',
              description: 'Registrar gasto o ingreso personal en COP',
              parameters: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
                  amountCOP: { type: 'number' },
                  category: { type: 'string' },
                  note: { type: 'string' },
                },
                required: ['kind', 'amountCOP', 'category'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'add_task',
              description: 'Crear tarea para hoy',
              parameters: {
                type: 'object',
                properties: { title: { type: 'string' } },
                required: ['title'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'complete_task',
              description: 'Marcar tarea de hoy como hecha',
              parameters: {
                type: 'object',
                properties: { title: { type: 'string' } },
                required: ['title'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'add_idea',
              description: 'Guardar idea en el vault',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  body: { type: 'string' },
                  starred: { type: 'boolean' },
                },
                required: ['title'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'add_note',
              description: 'Guardar nota en el diario',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  body: { type: 'string' },
                },
                required: ['body'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'set_wellness',
              description: 'Actualizar check-in de bienestar (1-10)',
              parameters: {
                type: 'object',
                properties: {
                  mood: { type: 'integer' },
                  health: { type: 'integer' },
                  love: { type: 'integer' },
                  friendships: { type: 'integer' },
                  family: { type: 'integer' },
                  note: { type: 'string' },
                },
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'set_budget',
              description: 'Definir presupuesto mensual por categoría',
              parameters: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  limitCOP: { type: 'number' },
                },
                required: ['category', 'limitCOP'],
              },
            },
          },
        ]
      : undefined;

    const messages: { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }[] = [
      { role: 'system', content: this.personalitySystem(opts.first) },
      ...opts.memory
        .filter((m) => m.content?.trim() && m.content !== SESSION_START)
        .slice(-16)
        .map((m) => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content: `CONTEXTO_VIDA:\n${JSON.stringify(opts.life, null, 2)}\n\nMENSAJE:\n${opts.question}`,
      },
    ];

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 900,
          messages,
          ...(tools ? { tools, tool_choice: 'auto' } : {}),
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.warn(`Aura OpenAI ${res.status}: ${detail.slice(0, 200)}`);
        return null;
      }
      const data = (await res.json()) as {
        choices?: {
          message?: {
            content?: string | null;
            tool_calls?: {
              id: string;
              function: { name: string; arguments: string };
            }[];
          };
        }[];
      };
      const msg = data.choices?.[0]?.message;
      if (!msg) return null;

      if (msg.tool_calls?.length && opts.tenant) {
        const mapped: AuraAction[] = [];
        for (const call of msg.tool_calls) {
          const args = JSON.parse(call.function.arguments || '{}') as Record<
            string,
            unknown
          >;
          const name = call.function.name;
          if (name === 'add_money') {
            mapped.push({
              type: 'add_money',
              kind:
                args.kind === 'INCOME'
                  ? PersonalMoneyKind.INCOME
                  : PersonalMoneyKind.EXPENSE,
              amountCOP: Number(args.amountCOP),
              category: String(args.category || 'general'),
              note: args.note ? String(args.note) : undefined,
            });
          } else if (name === 'add_task') {
            mapped.push({ type: 'add_task', title: String(args.title || '') });
          } else if (name === 'complete_task') {
            mapped.push({
              type: 'complete_task',
              title: String(args.title || ''),
            });
          } else if (name === 'add_idea') {
            mapped.push({
              type: 'add_idea',
              title: String(args.title || ''),
              body: args.body ? String(args.body) : undefined,
              starred: Boolean(args.starred),
            });
          } else if (name === 'add_note') {
            mapped.push({
              type: 'add_note',
              title: args.title ? String(args.title) : undefined,
              body: String(args.body || ''),
            });
          } else if (name === 'set_wellness') {
            mapped.push({
              type: 'set_wellness',
              mood: args.mood != null ? Number(args.mood) : undefined,
              health: args.health != null ? Number(args.health) : undefined,
              love: args.love != null ? Number(args.love) : undefined,
              friendships:
                args.friendships != null ? Number(args.friendships) : undefined,
              family: args.family != null ? Number(args.family) : undefined,
              note: args.note ? String(args.note) : undefined,
            });
          } else if (name === 'set_budget') {
            mapped.push({
              type: 'set_budget',
              category: String(args.category || ''),
              limitCOP: Number(args.limitCOP),
            });
          }
        }
        const actionsDone = await this.executeActions(
          opts.tenant,
          mapped.filter((a) => {
            if (a.type === 'add_task') return Boolean(a.title);
            if (a.type === 'add_idea') return Boolean(a.title);
            if (a.type === 'add_note') return Boolean(a.body);
            if (a.type === 'set_budget')
              return Boolean(a.category) && a.limitCOP > 0;
            if (a.type === 'add_money') return a.amountCOP > 0;
            return true;
          }),
          opts.life,
        );
        const life2 = await this.buildLifeContext(opts.tenant, opts.first);
        const follow = msg.content?.trim();
        return {
          answer:
            follow ||
            this.actionReply(life2, actionsDone, opts.question),
          engine: 'openai-tools',
          actionsDone,
        };
      }

      const text = msg.content?.trim();
      if (!text) return null;
      return { answer: text, engine: 'openai' };
    } catch (err) {
      this.logger.warn(`Aura OpenAI error: ${(err as Error).message}`);
      return null;
    }
  }
}
