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
  /** Tras un 429/error de red, no reintentar OpenAI un rato (respuestas más rápidas). */
  private openaiCooldownUntil = 0;

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

  async ask(
    tenant: TenantContext,
    questionRaw: string,
    userName?: string,
    mode: 'chat' | 'call' = 'chat',
  ) {
    const question = questionRaw.trim();
    const isCall = mode === 'call';
    if (!question) {
      return {
        answer: isCall
          ? 'Te escucho. Decime qué necesitas.'
          : 'Ey, tirame algo parce — aunque sea un “qué dice”.',
        assistantName: ASSISTANT_NAME,
        mode,
        voiceHint: isCall
          ? { gender: 'male', style: 'friendly', lang: 'es-CO' }
          : undefined,
      };
    }

    const isStart = question === SESSION_START;
    // Silencio al abrir: Aura no habla hasta que el usuario inicie.
    if (isStart) {
      return {
        answer: '',
        assistantName: ASSISTANT_NAME,
        engine: 'aura-silent',
        actions: [],
        mode,
        voiceHint: isCall
          ? { gender: 'male', style: 'friendly', lang: 'es-CO' }
          : undefined,
      };
    }

    await this.prisma.personalAssistantMessage.create({
      data: {
        companyId: tenant.companyId,
        userId: tenant.userId,
        role: 'user',
        content: question,
      },
    });

    const first = userName?.trim().split(/\s+/)[0] || 'parce';
    let life = await this.buildLifeContext(tenant, first);
    const memory = await this.loadMemory(tenant);

    let actionsDone: string[] = [];
    let engine = 'aura-local';

    const parsed = this.parseActions(question, life);
    if (parsed.length) {
      actionsDone = await this.executeActions(tenant, parsed, life);
      life = await this.buildLifeContext(tenant, first);
    }

    let answer: string | null = null;

    if (actionsDone.length) {
      answer = isCall
        ? this.callActionReply(life, actionsDone)
        : this.actionReply(life, actionsDone, question);
      engine = 'aura-actions';
    } else {
      // Preferir motor inteligente; local solo como fallback (o llamada muy corta).
      const fromAi = await this.askOpenAi({
        question,
        first,
        memory,
        life,
        allowTools: true,
        tenant,
        callMode: isCall,
      });
      if (fromAi) {
        answer = fromAi.answer;
        engine = fromAi.engine;
        if (fromAi.actionsDone?.length) {
          actionsDone = fromAi.actionsDone;
          life = await this.buildLifeContext(tenant, first);
        }
      } else {
        answer = isCall
          ? this.callReply(question, life, memory)
          : this.localReply(question, life, memory);
        engine = 'aura-local';
      }
    }

    if (isCall) {
      answer = this.forSpeech(answer!);
    }

    if (answer?.trim()) {
      await this.prisma.personalAssistantMessage.create({
        data: {
          companyId: tenant.companyId,
          userId: tenant.userId,
          role: 'assistant',
          content: answer,
        },
      });
    }

    return {
      answer: answer ?? '',
      assistantName: ASSISTANT_NAME,
      engine,
      actions: actionsDone,
      mode,
      voiceHint: isCall
        ? { gender: 'male', style: 'friendly', lang: 'es-CO' }
        : undefined,
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

  private isCasualLocal(question: string): boolean {
    const q = question.toLowerCase().trim();
    if (q.length <= 40) return true;
    return /(hola|buenas|qu[eé] dice|que dice|parce|bro|c[oó]mo vas|c[oó]mo est|charl|hablamos|gracias|bacano|chimba|cansad|triste|bien|nada|random|qui[eé]n sos|chiste|broma|cuento|curios|dato|divert|jaja|re[ií]|aburr)/.test(
      q,
    );
  }

  private pickJokeOrCuriosity(): string {
    const bits = [
      'Dato random: los pulpos tienen tres corazones. Vos con uno ya vivís a mil, parce.',
      'Chiste malo del día: ¿qué le dice un semáforo a otro? No me mires, que me estoy cambiando.',
      'Curiosidad: el cerebro inventa recuerdos. O sea, a veces tu “yo de ayer” también era creativo.',
      'Chiste express: fui al gimnasio… mentalmente. Quemé ansiedad.',
      'Dato chevere: las bananas son bayas y las fresas no. La biología también tira micos.',
      'Chiste seco: ¿por qué el libro de matemáticas está triste? Porque tiene demasiados problemas.',
      'Curiosidad: bostezar es contagioso hasta en texto. ¿Ya lo sentiste?',
      'Dato: el café tiene más de mil compuestos aromáticos. Por eso huele a “salvación”.',
      'Chiste colombiano light: no es flojera, es ahorro estratégico de energía.',
      'Curiosidad: tu celular vibra y el cuerpo cree que es urgente. Mentira: casi nunca lo es.',
    ];
    return bits[Math.floor(Date.now() / 40_000) % bits.length]!;
  }

  private actionReply(
    life: LifeContext,
    actionsDone: string[],
    question: string,
  ): string {
    const name = life.firstName;
    const q = question.toLowerCase();
    const opener = /gracias|listo|ok|dale|perfecto|bacano/.test(q)
      ? `De una, ${name}.`
      : `Listo parce, sin drama.`;
    const soft = actionsDone.map((a) => {
      if (a.startsWith('Gasto ')) return a.replace('Gasto ', 'anoté ');
      if (a.startsWith('Ingreso ')) return a.replace('Ingreso ', 'metí ');
      if (a.startsWith('Tarea creada: '))
        return `dejé la tarea “${a.slice('Tarea creada: '.length)}”`;
      if (a.startsWith('Idea guardada: '))
        return `guardé la idea “${a.slice('Idea guardada: '.length)}”`;
      if (a.startsWith('Bienestar')) return 'actualicé cómo te sentís';
      if (a.startsWith('Nota')) return 'la dejé en el diario';
      if (a.startsWith('Evento')) return a.replace('Evento agendado: ', 'agendé “') + '”';
      return a;
    });
    const follow = life.tasksToday.some((t) => !t.completed)
      ? `¿Seguimos o preferís un chiste de premio?`
      : `¿Qué más, bro — otra vaina o un dato random?`;
    return `${opener} ${soft.join('; ')}. ${follow}`;
  }

  private pickFriendlyHook(life: LifeContext): string {
    const pending = life.tasksToday.filter((t) => !t.completed);
    const latest = life.wellness[0];
    const idea = life.ideas[0];
    const hooks: string[] = [];
    if (latest && latest.mood <= 5) {
      hooks.push(`Vi que andabas medio abajo (ánimo ${latest.mood}). Si querés botar vaina, acá estoy.`);
    } else if (latest && latest.mood >= 8) {
      hooks.push(`La última vez venías full (${latest.mood}/10). Ojalá hoy también, parce.`);
    }
    if (pending.length === 1) {
      hooks.push(`Tenés lo de “${pending[0]!.title}” pendiente… ¿le metemos o después?`);
    } else if (pending.length > 1) {
      hooks.push(`Hoy tenés ${pending.length} pendientes; la primera es “${pending[0]!.title}”.`);
    }
    if (idea) {
      hooks.push(`Todavía me late tu idea de “${idea.title}”. ¿Le damos?`);
    }
    if (life.upcomingEvents[0]) {
      hooks.push(`Ojo: tenés “${life.upcomingEvents[0].title}” cerca en la agenda.`);
    }
    if (!hooks.length) {
      return 'Acá para lo que sea, bro.';
    }
    return hooks[Math.floor(Date.now() / 45_000) % hooks.length]!;
  }

  private localGreeting(life: LifeContext): string {
    const name = life.firstName;
    return `Hola **${name}**. Acá estoy.`;
  }

  /** Saludo para llamada: mínimo; solo si el usuario habló. */
  private callGreeting(life: LifeContext): string {
    return `Hola ${life.firstName}. Te escucho.`;
  }

  private callActionReply(life: LifeContext, actionsDone: string[]): string {
    const soft = actionsDone
      .map((a) => {
        if (a.startsWith('Gasto ')) return a.replace('Gasto ', 'listo, anoté ');
        if (a.startsWith('Ingreso ')) return a.replace('Ingreso ', 'listo, metí ');
        if (a.startsWith('Tarea creada: '))
          return `dejé la tarea ${a.slice('Tarea creada: '.length)}`;
        if (a.startsWith('Idea guardada: '))
          return `guardé la idea ${a.slice('Idea guardada: '.length)}`;
        if (a.startsWith('Bienestar')) return 'actualicé tu bienestar';
        if (a.startsWith('Nota')) return 'dejé la nota';
        if (a.startsWith('Evento'))
          return a.replace('Evento agendado: ', 'agendé ');
        return a;
      })
      .join('. ');
    return `Listo parce. ${soft}. ¿Seguimos o te suelto una curiosidad?`;
  }

  private callReply(
    question: string,
    life: LifeContext,
    memory: MemoryMsg[],
  ): string {
    const q = question.toLowerCase().trim();
    const name = life.firstName;
    const pending = life.tasksToday.filter((t) => !t.completed);
    const latest = life.wellness[0];

    if (
      /^(hola|buenas|hey|al[oó]|alo|qu[eé] dice|parce|bro)[\s!.?]*$/i.test(q)
    ) {
      return this.callGreeting(life);
    }
    if (/(chiste|broma|re[ií]|divert|cuento algo|algo gracioso)/.test(q)) {
      return `${this.pickJokeOrCuriosity().replace(/\*\*/g, '')} ¿Otro o vamos a lo serio?`;
    }
    if (/(curios|dato|random|sab[ií]as)/.test(q)) {
      return `${this.pickJokeOrCuriosity().replace(/\*\*/g, '')} ¿Querés más?`;
    }
    if (/(gracias|bacano|chimba|perfecto|listo|ok|dale)/.test(q)) {
      return `Jajaja de una, ${name}. Acá sigo, sin drama.`;
    }
    if (/(qui[eé]n sos|c[oó]mo te llam|tu nombre)/.test(q)) {
      return `Soy Aura, tu parce en llamada. Charlo, invento chistes malos y anoto vainas de verdad. Decime.`;
    }
    if (/(plata|gasto|ingreso|balance|dinero|finanzas|caja)/.test(q)) {
      return `Plata del mes: ${this.moneyFmt(life.money.balanceCOP)}. Entró ${this.moneyFmt(life.money.incomeCOP)}, salió ${this.moneyFmt(life.money.expenseCOP)}. ¿Anoto algo o seguimos hablando paja?`;
    }
    if (/(tarea|pendiente|hoy|qu[eé] tengo)/.test(q)) {
      if (!pending.length) return `Hoy limpio de pendientes. ¿Inventamos una o celebramos con flojera?`;
      return `Hoy: ${pending
        .slice(0, 3)
        .map((t) => t.title)
        .join(', ')}${pending.length > 3 ? ' y más' : ''}. ¿Cuál primero?`;
    }
    if (/([aá]nimo|bienestar|c[oó]mo me siento|me siento)/.test(q)) {
      if (!latest) return `No tengo tu ánimo guardado. Tirame del 1 al 10, sin filtro.`;
      return `Último ánimo ${latest.mood} de 10. ¿Actualizamos o preferís botar vaina?`;
    }
    if (/(agenda|calendario|evento|cita)/.test(q)) {
      if (!life.upcomingEvents.length) return `Agenda libre. ¿Agendamos o disfrutamos el vacío?`;
      const e = life.upcomingEvents[0]!;
      return `Próximo: ${e.title}, ${e.startsAt.slice(0, 16).replace('T', ' ')}. ¿Todo bien con eso?`;
    }
    if (/(idea|vault)/.test(q)) {
      if (!life.ideas.length) return `Sin ideas guardadas. Tirame una loca y la dejo.`;
      return `Tu última idea: ${life.ideas[0]!.title}. ¿Le damos o metemos otra?`;
    }
    const prior = memory
      .filter((m) => m.role === 'user' && m.content !== SESSION_START)
      .at(-2)?.content;
    if (prior) {
      return `Te leo. Antes tocaste algo parecido. ¿Retomamos o me pedís un chiste mientras tanto?`;
    }
    return `${this.pickJokeOrCuriosity().replace(/\*\*/g, '')} Y de lo tuyo: ${this.pickFriendlyHook(life).replace(/\*\*/g, '')}`;
  }

  /** Limpia markdown y acorta para TTS en llamada. */
  private forSpeech(text: string): string {
    let s = text
      .replace(/\*\*/g, '')
      .replace(/[_`#]/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > 3) {
      s = sentences.slice(0, 3).join(' ');
    }
    if (s.length > 280) {
      s = s.slice(0, 277).replace(/\s+\S*$/, '') + '.';
    }
    return s;
  }

  private localReply(
    question: string,
    life: LifeContext,
    memory: MemoryMsg[],
  ): string {
    const q = question.toLowerCase().trim();
    const name = life.firstName;
    const pending = life.tasksToday.filter((t) => !t.completed);
    const latest = life.wellness[0];

    if (
      /^(hola|buenas|hey|hi|hello|qu[eé] tal|que tal|qu[eé] dice|que dice|buenos d[ií]as|buenas tardes|buenas noches|parce|bro)[\s!.?]*$/i.test(
        q,
      )
    ) {
      return this.localGreeting(life);
    }

    if (
      /(c[oó]mo est|c[oó]mo vas|c[oó]mo te va|qu[eé] hac|aburrid|contame|hablamos|charl|solo quiero|nada|no s[eé]|random|qu[eé] dice|que dice)/.test(
        q,
      )
    ) {
      const line = latest
        ? latest.mood >= 7
          ? `Se te veía bien la última vez (ánimo ${latest.mood}). ¿Seguís así o qué?`
          : `Si andás medio raro, decime parce — sin filtro.`
        : `Tirame cómo vas, aunque sea en una frase.`;
      return `Tranqui, ${name}. ${this.pickFriendlyHook(life)}\n${line}`;
    }

    if (/(chiste|broma|re[ií]r|divert|algo gracioso|cont[aá] un chiste)/.test(q)) {
      return `${this.pickJokeOrCuriosity()}\n¿Otro, o preferís que miremos tu día?`;
    }

    if (/(curios|dato random|sab[ií]as que|contame algo|sorprend)/.test(q)) {
      return `Va una: ${this.pickJokeOrCuriosity()}\nSi querés, te suelto más o miramos pendientes/plata.`;
    }

    if (/(gracias|bacano|chimba|crack|genial|perfecto|te pasaste)/.test(q)) {
      return `Jajaja de una, ${name}. Pa’ eso estoy — sin modo corporativo. ¿Qué más, bro?`;
    }

    if (/(qui[eé]n sos|c[oó]mo te llam|tu nombre|qu[eé] pod[eé]s|para qu[eé] serv)/.test(q)) {
      return `Soy **Aura**: tu parce en Main. Hablo paja, suelto chistes malos, datos raros y, si me decís “anotá esto”, lo guardo de verdad. Sin filtro de tía prudente. ${this.pickFriendlyHook(life)}`;
    }

    if (/(cansad|estres|mal d[ií]a|triste|ansios|preocup|solo|sola|no doy)/.test(q)) {
      return [
        `Uy, ${name}, te leo. Eso pesa.`,
        latest && latest.mood <= 5
          ? `Hace poco también andabas bajito (${latest.mood}). No estás inventando.`
          : `No toca resolver todo ya. Un pasito chiquito alcanza.`,
        pending.length
          ? `Si querés, paramos las tareas (${pending.length} hoy) y solo hablamos. ¿Qué es lo que más te tiene?`
          : `¿Querés botar vaina o preferís que te ayude a bajar una sola cosa?`,
      ].join(' ');
    }

    if (/(feliz|bien|geni|emocionad|contento|alegre|bacano|chimba)/.test(q) && !/(no estoy|no me siento|no ando)/.test(q)) {
      return `Eso sí, ${name} 🔥 Qué rico. ${life.ideas[0] ? `Con esa vibra hasta “${life.ideas[0].title}” se siente posible.` : 'Guardá un poquito de esa energía.'} ¿Qué te tiene así?`;
    }

    if (/(dinero|finanzas|plata|gasto|ingreso|balance|presupuesto|cobr)/.test(q)) {
      const recent = life.money.recent[0];
      let s = `Mirá parce: este mes vas en **${this.moneyFmt(life.money.balanceCOP)}** (entró ${this.moneyFmt(life.money.incomeCOP)}, salió ${this.moneyFmt(life.money.expenseCOP)}).`;
      if (recent) {
        s += ` Lo último fue ${recent.kind === 'INCOME' ? 'entrada' : 'gasto'} de ${this.moneyFmt(recent.amount)} en ${recent.category}.`;
      }
      s += life.money.balanceCOP < 0
        ? ` Si querés miramos dónde se va la plata, sin drama.`
        : ` Vas bien. Si gastaste algo, tíramelo y lo anoto.`;
      return s;
    }

    if (/(tarea|tiempo|pendiente|hacer hoy|productiv)/.test(q)) {
      if (!life.tasksToday.length) {
        return `Hoy no hay nada en la lista, ${name}. ¿Descanso o se te olvidó? Si querés inventamos una sola.`;
      }
      if (!pending.length) {
        return `Cerraste todo hoy, bro. Eso está bacano. ¿Celebramos o metemos una pa’ mañana?`;
      }
      return `Ok: te quedan ${pending.length}. Yo arrancaría por “${pending[0]!.title}”. ¿Le metemos o charlamos primero?`;
    }

    if (/([aá]nimo|bienestar|salud|amor|amistad|familia|me siento|emocion)/.test(q)) {
      if (!latest) {
        return `Aún no tengo cómo te sentís guardado. Decime “ánimo 6” o “me siento raro” y lo dejo, parce. ¿Cómo andás por dentro?`;
      }
      return latest.mood <= 4 || latest.health <= 4
        ? `Se siente tenso (ánimo ${latest.mood}, salud ${latest.health}). Sin tip vacío: ¿qué te ayudaría ahora, aunque sea mínimo?`
        : `Vas entero: ánimo ${latest.mood}, salud ${latest.health}, amor ${latest.love}. ¿Qué cuidamos hoy?`;
    }

    if (/(idea|vault|inspir)/.test(q)) {
      if (!life.ideas.length) {
        return `Vault vacío, pero está bien. Tirame cualquier idea loca que se te ocurrió hoy, bro.`;
      }
      return `Tu idea más fresca: “${life.ideas[0]!.title}”.${life.ideas.length > 1 ? ` Tenés ${life.ideas.length} en total.` : ''} ¿La desarollamos o me tiras otra?`;
    }

    if (/(nota|diario|journal|escrib)/.test(q)) {
      if (!life.notes.length) {
        return `Sin notas todavía. Dictame un pensamiento y lo dejo escrito, o seguimos hablando.`;
      }
      const n = life.notes[0]!;
      return `Tu última nota: “${n.preview.slice(0, 120)}${n.preview.length > 120 ? '…' : ''}”. ¿Seguimos ese hilo o escribimos otra?`;
    }

    if (/(calendario|agenda|evento|cita|reuni[oó]n)/.test(q)) {
      if (!life.upcomingEvents.length) {
        return `Agenda libre los próximos días. ¿Paz o nervios? Si hay que agendar algo, decime cuándo.`;
      }
      const e = life.upcomingEvents[0]!;
      return `Lo próximo: “${e.title}” (${e.startsAt.slice(0, 16).replace('T', ' ')}). ¿Tranquilo o hay que preparar algo?`;
    }

    const prior = memory
      .filter((m) => m.role === 'user' && m.content !== SESSION_START)
      .at(-2)?.content;
    return [
      `Te leo, ${name}.`,
      this.pickFriendlyHook(life),
      prior
        ? `Antes me habías dicho algo como “${prior.slice(0, 80)}”… ¿retomamos o seguimos con esto?`
        : 'Charla o algo práctico, vos mandás. ¿Qué dice?',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private personalitySystem(first: string, callMode = false): string {
    if (callMode) {
      return `Eres Aura en una LLAMADA con ${first}.

Sos muy inteligente, natural y cercano (colombia). NO robot, NO corporativo, NO menús.
NO inventes saludos no pedidos. NO sueltes chistes/sugerencias salvo que ${first} lo pida.
Respondé solo a lo que dijo, con claridad. 1–2 frases hablables. Sin markdown ni emojis.
Si pide anotar y hay datos, usá la herramienta. No digas que sos GPT/OpenAI.`;
    }
    return `Eres **Aura**, agente inteligente de ${first} en Main (VOS IA).

PERSONA:
- Muy capaz: razonás bien, conectás contexto de vida, sos directo y útil.
- Natural (colombia): tutear, “parce/bro” con mesura. Cercano, no cursi.
- Nunca digas que sos GPT/OpenAI/robot.
- NO ofrezcas menús, chips, “¿querés un chiste?”, ni recomendaciones no pedidas.
- Humor/curiosidades SOLO si ${first} lo pide explícitamente.
- No sermonees. Respuestas abiertas y precisas (1–5 frases). Sin listas de funciones.

PODÉS (herramientas): gastos, tareas, ideas, notas, bienestar, eventos, presupuestos.

REGLAS:
- Hechos de vida solo de CONTEXTO_VIDA + historial.
- Si pide anotar y hay datos, usá la herramienta.
- Seguí el hilo del usuario; no cambies de tema hacia sugerencias.`;
  }

  private async askOpenAi(opts: {
    question: string;
    first: string;
    memory: MemoryMsg[];
    life: LifeContext;
    allowTools: boolean;
    tenant?: TenantContext;
    callMode?: boolean;
  }): Promise<{ answer: string; engine: string; actionsDone?: string[] } | null> {
    if (Date.now() < this.openaiCooldownUntil) return null;
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

    const callMode = Boolean(opts.callMode);
    const messages: { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }[] = [
      { role: 'system', content: this.personalitySystem(opts.first, callMode) },
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
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), callMode ? 4500 : 12_000);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          model,
          temperature: callMode ? 0.65 : 0.75,
          max_tokens: callMode ? 160 : 700,
          messages,
          ...(tools ? { tools, tool_choice: 'auto' } : {}),
        }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.warn(`Aura OpenAI ${res.status}: ${detail.slice(0, 200)}`);
        if (res.status === 429 || res.status >= 500) {
          this.openaiCooldownUntil = Date.now() + 10 * 60_000;
        }
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
      this.openaiCooldownUntil = Date.now() + 5 * 60_000;
      return null;
    }
  }
}
