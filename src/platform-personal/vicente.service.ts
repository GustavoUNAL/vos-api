import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

const SESSION_START = '__SESSION_START__';

@Injectable()
export class VicenteService {
  private readonly logger = new Logger(VicenteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async history(tenant: TenantContext) {
    const rows = await this.prisma.personalAssistantMessage.findMany({
      where: { companyId: tenant.companyId, userId: tenant.userId },
      orderBy: { createdAt: 'asc' },
      take: 80,
    });
    return {
      messages: rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async ask(tenant: TenantContext, questionRaw: string, userName?: string) {
    const question = questionRaw.trim();
    if (!question) return { answer: 'Contame un poco más y seguimos.' };

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

    const [memory, life] = await Promise.all([
      this.loadMemory(tenant),
      this.buildLifeContext(tenant),
    ]);

    const first = userName?.trim().split(/\s+/)[0] || 'amigo';
    let answer =
      (await this.askOpenAi({
        question: isStart
          ? 'El usuario acaba de abrir el chat. Saludalo como Vicente.'
          : question,
        first,
        memory,
        life,
      })) ||
      (isStart
        ? `Hola ${first}. Soy **Vicente**, tu asistente personal en Main. Puedo ayudarte con finanzas, notas, ideas, tu agenda y cómo te estás sintiendo. ¿Cómo venís hoy?`
        : `Entendido, ${first}. Todavía no tengo el motor de IA disponible, pero tu mensaje quedó en mi memoria. Revisemos juntas tus finanzas, notas o check-in de bienestar en Main.`);

    await this.prisma.personalAssistantMessage.create({
      data: {
        companyId: tenant.companyId,
        userId: tenant.userId,
        role: 'assistant',
        content: answer,
      },
    });

    return { answer, assistantName: 'Vicente' };
  }

  async clear(tenant: TenantContext) {
    await this.prisma.personalAssistantMessage.deleteMany({
      where: { companyId: tenant.companyId, userId: tenant.userId },
    });
    return { ok: true };
  }

  private async loadMemory(tenant: TenantContext) {
    const rows = await this.prisma.personalAssistantMessage.findMany({
      where: { companyId: tenant.companyId, userId: tenant.userId },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
    return rows.reverse().map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
  }

  private async buildLifeContext(tenant: TenantContext) {
    const [money, ideas, notes, wellness, tasksToday] = await Promise.all([
      this.prisma.personalMoneyEntry.findMany({
        where: { companyId: tenant.companyId },
        orderBy: { occurredOn: 'desc' },
        take: 12,
      }),
      this.prisma.personalIdea.findMany({
        where: { companyId: tenant.companyId },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      this.prisma.companyJournalEntry.findMany({
        where: { companyId: tenant.companyId },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      this.prisma.personalWellnessCheckIn.findMany({
        where: { companyId: tenant.companyId, authorId: tenant.userId },
        orderBy: { checkedOn: 'desc' },
        take: 14,
      }),
      this.prisma.companyTask.findMany({
        where: {
          companyId: tenant.companyId,
          taskDate: new Date().toISOString().slice(0, 10),
        },
        take: 12,
      }),
    ]);

    const income = money
      .filter((m) => m.kind === 'INCOME')
      .reduce((s, m) => s + Number(m.amountCOP), 0);
    const expense = money
      .filter((m) => m.kind === 'EXPENSE')
      .reduce((s, m) => s + Number(m.amountCOP), 0);

    return {
      moneySummary: { income, expense, balance: income - expense },
      recentMoney: money.map((m) => ({
        kind: m.kind,
        amount: Number(m.amountCOP),
        category: m.category,
        note: m.note,
        day: m.occurredOn.toISOString().slice(0, 10),
      })),
      ideas: ideas.map((i) => ({ title: i.title, starred: i.starred, tags: i.tags })),
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
    };
  }

  private async askOpenAi(opts: {
    question: string;
    first: string;
    memory: { role: string; content: string }[];
    life: unknown;
  }): Promise<string | null> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) return null;
    const model =
      this.config.get<string>('OPENAI_CHAT_MODEL')?.trim() || 'gpt-4o';

    const system = `Eres **Vicente**, el asistente personal de vida en la app Main (VOS IA).
No sos un bot de empresa ni un gerente de ventas: acompañás a ${opts.first} a vivir con más orden, claridad y conciencia.

PERSONALIDAD:
- Cálido, inteligente, humano. Español colombiano cercano (podés tutear con naturalidad).
- Amable sin ser empalagoso. Humor suave cuando cabe.
- Memoria: usás el historial y el CONTEXTO_VIDA para retomar hilos ("la otra vez hablamos de…").
- Proactivo: si ${opts.first} está sobrecargado, proponé un paso chico; si está bien, celebralo con mesura.
- Nunca digas que sos GPT/OpenAI.

DOMINIOS:
• Finanzas personales · notas/diario · vault de ideas · tiempo/tareas · calendario
• Bienestar: ánimo, salud, amor, amistades, familia (y cómo se relacionan)

REGLAS:
- Usá solo hechos del CONTEXTO_VIDA + historial. No inventes montos ni check-ins.
- Si falta info, preguntá una sola cosa útil.
- Respuestas conversacionales (no reportes corporativos). Máx ~12 líneas salvo que pidan detalle.
- Formato: respuesta directa, luego viñetas si ayudan, cierre con pregunta o micro-acción.`;

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: system },
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
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.warn(`Vicente OpenAI ${res.status}: ${detail.slice(0, 200)}`);
        return null;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      this.logger.warn(`Vicente OpenAI error: ${(err as Error).message}`);
      return null;
    }
  }
}
