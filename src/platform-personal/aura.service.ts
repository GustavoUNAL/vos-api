import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  tasksToday: { title: string; completed: boolean }[];
  upcomingEvents: { title: string; startsAt: string }[];
};

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
    const [memory, life] = await Promise.all([
      this.loadMemory(tenant),
      this.buildLifeContext(tenant, first),
    ]);

    const fromAi = await this.askOpenAi({
      question: isStart
        ? `El usuario acaba de abrir el chat. Saludalo como ${ASSISTANT_NAME}, su asistente personal.`
        : question,
      first,
      memory,
      life,
    });

    const answer =
      fromAi ||
      (isStart
        ? this.localGreeting(life)
        : this.localReply(question, life, memory));

    await this.prisma.personalAssistantMessage.create({
      data: {
        companyId: tenant.companyId,
        userId: tenant.userId,
        role: 'assistant',
        content: answer,
      },
    });

    return {
      answer,
      assistantName: ASSISTANT_NAME,
      engine: fromAi ? 'openai' : 'aura-local',
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
    const monthStart = new Date(
      `${today.slice(0, 7)}-01T00:00:00.000Z`,
    );
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [monthMoney, recentMoney, ideas, notes, wellness, tasksToday, events, budgets] =
      await Promise.all([
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
          where: {
            companyId: tenant.companyId,
            month: monthStart,
          },
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
        title: t.title,
        completed: t.completed,
      })),
      upcomingEvents: events.map((e) => ({
        title: e.title,
        startsAt: e.startsAt.toISOString(),
      })),
    };
  }

  private money(n: number) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(n);
  }

  private localGreeting(life: LifeContext): string {
    const pending = life.tasksToday.filter((t) => !t.completed).length;
    const latest = life.wellness[0];
    const lines = [
      `Hola **${life.firstName}**. Soy **Aura**, tu asistente personal en Main.`,
      '',
      'Estoy acá para ayudarte a ordenar tu vida con claridad: dinero, notas, ideas, tiempo y cómo te sentís.',
    ];
    const pulses: string[] = [];
    if (life.money.incomeCOP || life.money.expenseCOP) {
      pulses.push(
        `• Este mes: balance ${this.money(life.money.balanceCOP)} (ingresos ${this.money(life.money.incomeCOP)} · gastos ${this.money(life.money.expenseCOP)})`,
      );
    }
    if (pending > 0) {
      pulses.push(`• Hoy tenés **${pending}** pendiente${pending === 1 ? '' : 's'}`);
    }
    if (latest) {
      pulses.push(
        `• Último bienestar: ánimo ${latest.mood}/10 · salud ${latest.health}/10`,
      );
    }
    if (life.ideas.length) {
      pulses.push(`• ${life.ideas.length} idea${life.ideas.length === 1 ? '' : 's'} en el vault`);
    }
    if (pulses.length) {
      lines.push('', 'Pulso rápido:', ...pulses);
    }
    lines.push('', '¿Qué querés mirar primero?');
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

    if (/(dinero|finanzas|plata|gasto|ingreso|balance|presupuesto|cobr)/.test(q)) {
      const lines = [
        `**${name}**, tu plata este mes:`,
        `• Ingresos: ${this.money(life.money.incomeCOP)}`,
        `• Gastos: ${this.money(life.money.expenseCOP)}`,
        `• Balance: **${this.money(life.money.balanceCOP)}**`,
      ];
      if (life.money.budgets.length) {
        lines.push('', 'Presupuestos:');
        for (const b of life.money.budgets.slice(0, 5)) {
          const left = b.limitCOP - b.spentCOP;
          lines.push(
            `• ${b.category}: ${this.money(b.spentCOP)} / ${this.money(b.limitCOP)} (queda ${this.money(left)})`,
          );
        }
      }
      if (life.money.recent.length) {
        lines.push('', 'Últimos movimientos:');
        for (const m of life.money.recent.slice(0, 4)) {
          const sign = m.kind === 'INCOME' ? '+' : '−';
          lines.push(
            `• ${m.day} ${sign}${this.money(m.amount)} · ${m.category}${m.note ? ` (${m.note})` : ''}`,
          );
        }
      }
      lines.push(
        '',
        life.money.balanceCOP < 0
          ? 'El mes va apretado. ¿Querés que prioricemos un corte de gastos o un presupuesto por categoría?'
          : 'Vas con aire. ¿Anotamos un gasto, un ingreso o armamos un presupuesto?',
      );
      return lines.join('\n');
    }

    if (/(tarea|tiempo|pendiente|hacer hoy|to-?do|checklist)/.test(q)) {
      const pending = life.tasksToday.filter((t) => !t.completed);
      const done = life.tasksToday.filter((t) => t.completed);
      if (!life.tasksToday.length) {
        return `Hoy no tenés tareas cargadas, ${name}. ¿Querés que anotes una pequeña para no dejar el día en blanco?`;
      }
      const lines = [`**Hoy (${life.today})**`];
      if (pending.length) {
        lines.push('Pendientes:');
        for (const t of pending.slice(0, 8)) lines.push(`• ${t.title}`);
      } else {
        lines.push('No queda nada pendiente. Bien.');
      }
      if (done.length) {
        lines.push('', `Hechas: ${done.length}`);
      }
      lines.push(
        '',
        pending.length
          ? 'Empezá por la más chica. ¿Cuál atacamos primero?'
          : '¿Sumamos algo más para mañana?',
      );
      return lines.join('\n');
    }

    if (/(ánimo|animo|bienestar|salud|amor|amistad|familia|me siento|emocion)/.test(q)) {
      const latest = life.wellness[0];
      if (!latest) {
        return `Todavía no hay check-ins de bienestar, ${name}. En **Bienestar** podés registrar ánimo, salud, amor, amistades y familia. ¿Querés que te guíe con una lectura simple de 1 a 10?`;
      }
      const avg =
        (latest.mood +
          latest.health +
          latest.love +
          latest.friendships +
          latest.family) /
        5;
      const lines = [
        `Tu último registro (${latest.day}):`,
        `• Ánimo ${latest.mood}/10`,
        `• Salud ${latest.health}/10`,
        `• Amor ${latest.love}/10`,
        `• Amistades ${latest.friendships}/10`,
        `• Familia ${latest.family}/10`,
        `• Promedio **${avg.toFixed(1)}/10**`,
      ];
      if (latest.note) lines.push(`• Nota: ${latest.note}`);
      const low: string[] = [];
      if (latest.mood <= 4) low.push('ánimo');
      if (latest.health <= 4) low.push('salud');
      if (latest.love <= 4) low.push('amor');
      if (latest.friendships <= 4) low.push('amistades');
      if (latest.family <= 4) low.push('familia');
      lines.push(
        '',
        low.length
          ? `Veo tensión en ${low.join(', ')}. Un paso chico hoy basta: respirar 2 minutos, escribir en Notas o hablar con alguien de confianza. ¿Qué te resuena?`
          : 'Se ve un panorama sólido. ¿Querés reforzar alguna área o revisar el grafo?',
      );
      return lines.join('\n');
    }

    if (/(idea|vault|inspir|proyecto personal)/.test(q)) {
      if (!life.ideas.length) {
        return `El vault está vacío, ${name}. Tirame una idea suelta y después la guardamos en **Ideas** para no perderla.`;
      }
      const starred = life.ideas.filter((i) => i.starred);
      const lines = [`Tenés **${life.ideas.length}** idea${life.ideas.length === 1 ? '' : 's'} en el vault.`];
      if (starred.length) {
        lines.push('Destacadas:');
        for (const i of starred.slice(0, 5)) lines.push(`• ★ ${i.title}`);
      } else {
        lines.push('Recientes:');
        for (const i of life.ideas.slice(0, 5)) lines.push(`• ${i.title}`);
      }
      lines.push('', '¿Cuál querés desarrollar o bajar a una tarea concreta?');
      return lines.join('\n');
    }

    if (/(nota|diario|journal|escrib)/.test(q)) {
      if (!life.notes.length) {
        return `Aún no hay notas, ${name}. En **Notas** podés dejar un pensamiento del día; yo después lo retomo en la conversación.`;
      }
      const lines = ['Tus notas recientes:'];
      for (const n of life.notes.slice(0, 4)) {
        lines.push(
          `• ${n.title?.trim() || 'Sin título'}: ${n.preview}${n.preview.length >= 160 ? '…' : ''}`,
        );
      }
      lines.push('', '¿Querés reflexionar sobre alguna o escribir una nueva?');
      return lines.join('\n');
    }

    if (/(calendario|agenda|evento|cita|reunión|reunion)/.test(q)) {
      if (!life.upcomingEvents.length) {
        return `No veo eventos en los próximos 7 días, ${name}. ¿Querés cargar uno en **Calendario**?`;
      }
      const lines = ['Próximos eventos:'];
      for (const e of life.upcomingEvents) {
        lines.push(`• ${e.title} · ${e.startsAt.slice(0, 16).replace('T', ' ')}`);
      }
      lines.push('', '¿Preparás algo para alguno o reordenamos la semana?');
      return lines.join('\n');
    }

    if (/(quién sos|quien sos|cómo te llamás|como te llamas|tu nombre)/.test(q)) {
      return `Soy **Aura**, tu asistente personal en Main. Te acompaño con memoria: finanzas, notas, ideas, tiempo, calendario y bienestar. No soy el asistente de la empresa: estoy para tu vida.`;
    }

    const pending = life.tasksToday.filter((t) => !t.completed).length;
    const latest = life.wellness[0];
    const prior = memory
      .filter((m) => m.role === 'user' && m.content !== SESSION_START)
      .slice(-2)
      .map((m) => m.content);
    const lines = [
      `Te escucho, ${name}.`,
      '',
      'Con lo que tengo en Main puedo ayudarte con:',
      `• Finanzas (balance ${this.money(life.money.balanceCOP)} este mes)`,
      `• Tiempo (${pending} pendiente${pending === 1 ? '' : 's'} hoy)`,
      `• Bienestar${latest ? ` (último ánimo ${latest.mood}/10)` : ''}`,
      `• Ideas (${life.ideas.length}) y notas (${life.notes.length})`,
      `• Calendario (${life.upcomingEvents.length} eventos próximos)`,
    ];
    if (prior.length) {
      lines.push('', `Retomo lo último que me dijiste: “${prior[prior.length - 1]!.slice(0, 120)}”.`);
    }
    lines.push('', 'Decime el tema (plata, tareas, ánimo, ideas…) y bajamos a algo concreto.');
    return lines.join('\n');
  }

  private async askOpenAi(opts: {
    question: string;
    first: string;
    memory: MemoryMsg[];
    life: LifeContext;
  }): Promise<string | null> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) return null;
    const model =
      this.config.get<string>('OPENAI_CHAT_MODEL')?.trim() || 'gpt-4o';

    const system = `Eres **Aura**, la asistente personal de vida en la app Main (VOS IA).
No sos un bot de empresa ni gerente de ventas: acompañás a ${opts.first} a vivir con más orden, claridad y conciencia.

PERSONALIDAD:
- Inteligente, cálida, directa. Español colombiano cercano (tutear natural).
- Memoria activa: retoma hilos del historial y del CONTEXTO_VIDA.
- Proactiva: un micro-paso concreto cuando hay sobrecarga; celebración mesurada cuando hay avance.
- Nunca digas que sos GPT/OpenAI ni menciones modelos.

DOMINIOS:
• Finanzas personales · notas/diario · vault de ideas · tiempo/tareas · calendario
• Bienestar: ánimo, salud, amor, amistades, familia

REGLAS:
- Usá SOLO hechos de CONTEXTO_VIDA + historial. No inventes montos ni check-ins.
- Si falta info, preguntá UNA sola cosa útil.
- Respuestas conversacionales. Máx ~12 líneas salvo que pidan detalle.
- Formato: respuesta directa, viñetas si ayudan, cierre con pregunta o micro-acción.`;

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: system },
      ...opts.memory
        .filter((m) => m.content?.trim() && m.content !== SESSION_START)
        .slice(-18)
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
          temperature: 0.65,
          max_tokens: 900,
          messages,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.warn(`Aura OpenAI ${res.status}: ${detail.slice(0, 200)}`);
        return null;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      this.logger.warn(`Aura OpenAI error: ${(err as Error).message}`);
      return null;
    }
  }
}
