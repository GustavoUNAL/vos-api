import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessInsightsService } from './business-insights.service';

export const ASSISTANT_SESSION_START = '__SESSION_START__';

export type AssistantHistoryItem = {
  role: 'user' | 'assistant';
  content: string;
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

@Injectable()
export class BusinessAssistantService {
  private readonly logger = new Logger(BusinessAssistantService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly insights: BusinessInsightsService,
  ) {}

  async answer(
    question: string,
    companyId?: string,
    history?: AssistantHistoryItem[],
  ): Promise<string> {
    const text = question.trim();
    if (!text) {
      return this.formatAnswer(this.insights.helpText());
    }

    if (text === ASSISTANT_SESSION_START) {
      return this.formatAnswer(
        await this.generateSessionGreeting(companyId),
      );
    }

    const explicit = this.isExplicitDataQuery(normalize(text));

    if (explicit) {
      const direct = await this.tryDirectAnswer(text, companyId);
      if (direct) return this.formatAnswer(direct);
    }

    const ai = await this.askOpenAi(text, companyId, history);
    if (ai) return this.formatAnswer(ai);

    if (!explicit) {
      const direct = await this.tryDirectAnswer(text, companyId);
      if (direct) return this.formatAnswer(direct);
    }

    return this.formatAnswer(
      [
        'No encontré un dato exacto para eso en este momento.',
        '',
        'Probá preguntarme, por ejemplo:',
        '• ¿Cómo va el negocio hoy?',
        '• ¿Qué debo comprar?',
        '• ¿Cuál fue la utilidad del mes?',
        '• ¿Hay pedidos en la tienda?',
        '',
        'También podés saludarme o contarme qué te preocupa del negocio — interpreto la pregunta con los datos en vivo.',
      ].join('\n'),
    );
  }

  private formatAnswer(raw: string): string {
    let text = raw
      .replace(/\r\n/g, '\n')
      .replace(/^\s+|\s+$/g, '')
      .replace(/\n{3,}/g, '\n\n');

    text = text
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (!t) return '';
        if (/^[-*]\s+/.test(t)) return `• ${t.replace(/^[-*]\s+/, '')}`;
        return t;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');

    return text;
  }

  private isExplicitDataQuery(n: string): boolean {
    return (
      /negocio hoy|como va hoy|ventas hoy|hoy va|resumen del dia|resumen hoy|cuanto vendi hoy|vendi hoy/.test(
        n,
      ) ||
      /semana|ultimos 7|7 dias|ultima semana|como vamos esta semana/.test(n) ||
      /que debo comprar|que comprar|reponer|inventario bajo|falta stock|comprar|que me falta|agotado/.test(
        n,
      ) ||
      (/inventario|stock|existencias|cuanto tengo/.test(n) &&
        !/comprar|reponer/.test(n)) ||
      /utilidad del mes|ganancia del mes|utilidad mensual|cuanto gane|finanzas del mes|resultado del mes|cuanto llevo en el mes/.test(
        n,
      ) ||
      /compras del mes|ultimas compras|proveedor|que compre|gastos en compras/.test(
        n,
      ) ||
      /personal|nomina|turnos|staff|quien trabajo|horas trabajadas/.test(n) ||
      /tienda online|pedidos web|pedidos tienda|shop|domicilio web/.test(n) ||
      /producto.*dinero|mas rentable|deja mas|mejor producto|mas utilidad|mas vendido|estrella/.test(
        n,
      ) ||
      /clientes.*regres|no han vuelto|no regresan|clientes inactivos|mesas.*regres/.test(
        n,
      ) ||
      /tareas|pendientes del dia|que tengo hoy|actividades/.test(n)
    );
  }

  private async tryDirectAnswer(
    text: string,
    companyId?: string,
  ): Promise<string | null> {
    const n = normalize(text);

    if (
      /negocio hoy|como va hoy|ventas hoy|hoy va|resumen del dia|resumen hoy|cuanto vendi hoy|vendi hoy/.test(
        n,
      )
    ) {
      return this.insights.todayBusiness(companyId);
    }
    if (
      /semana|ultimos 7|7 dias|ultima semana|como vamos esta semana/.test(n)
    ) {
      return this.insights.weekSummary(companyId);
    }
    if (
      /que debo comprar|que comprar|reponer|inventario bajo|falta stock|comprar|que me falta|agotado/.test(
        n,
      )
    ) {
      return this.insights.purchaseRecommendations(companyId);
    }
    if (
      /inventario|stock|existencias|cuanto tengo/.test(n) &&
      !/comprar|reponer/.test(n)
    ) {
      return this.insights.inventoryOverview(companyId);
    }
    if (
      /utilidad del mes|ganancia del mes|utilidad mensual|cuanto gane|finanzas del mes|resultado del mes|cuanto llevo en el mes/.test(
        n,
      )
    ) {
      return this.insights.monthlyProfit(companyId);
    }
    if (
      /compras del mes|ultimas compras|proveedor|que compre|gastos en compras/.test(
        n,
      )
    ) {
      return this.insights.purchasesRecent(companyId);
    }
    if (
      /personal|nomina|turnos|staff|quien trabajo|horas trabajadas/.test(n)
    ) {
      return this.insights.staffMonthSummary(companyId);
    }
    if (
      /tienda online|pedidos web|pedidos tienda|shop|domicilio web/.test(n)
    ) {
      return this.insights.shopOrdersStatus(companyId);
    }
    if (
      /producto.*dinero|mas rentable|deja mas|mejor producto|mas utilidad|mas vendido|estrella/.test(
        n,
      )
    ) {
      return this.insights.topProductsByProfit(companyId);
    }
    if (
      /clientes.*regres|no han vuelto|no regresan|clientes inactivos|mesas.*regres/.test(
        n,
      )
    ) {
      return this.insights.inactiveCustomers(companyId);
    }
    if (/tareas|pendientes del dia|que tengo hoy|actividades/.test(n)) {
      return this.insights.tasksTodaySummary(companyId);
    }

    return null;
  }

  private async generateSessionGreeting(
    companyId?: string,
  ): Promise<string> {
    const structured = await this.insights.buildStructuredContext(companyId);
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();

    if (!apiKey) {
      return this.fallbackSessionGreeting(structured);
    }

    const model =
      this.config.get<string>('OPENAI_CHAT_MODEL')?.trim() || 'gpt-4o';

    const system = `Eres VOS AI, el gerente digital del negocio. El usuario acaba de abrir el chat en la app.

Genera un saludo inicial cálido y profesional en español colombiano (tuteo respetuoso).

REGLAS:
- Usa SOLO datos de DATOS_JSON. No inventes cifras.
- Menciona el nombre de la empresa.
- Incluye 2 o 3 datos vivos relevantes (ventas de hoy, alertas de inventario, pedidos web o tareas pendientes) si existen en los datos.
- Si hoy no hay ventas aún, dilo con tono constructivo y sugiere revisar inventario o pedidos.
- Invita a preguntar lo que necesite (ventas, compras, personal, clientes, finanzas).
- Máximo 10 líneas. Primera línea con **negrita** en el saludo o dato clave.
- Usa viñetas • para highlights.
- Cierra con una pregunta abierta y útil.
- No digas que eres GPT ni un modelo de lenguaje.`;

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.55,
          max_tokens: 500,
          messages: [
            { role: 'system', content: system },
            {
              role: 'user',
              content: `DATOS_JSON:\n${JSON.stringify(structured, null, 2)}`,
            },
          ],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.warn(
          `OpenAI greeting ${res.status}: ${detail.slice(0, 180)}`,
        );
        return this.fallbackSessionGreeting(structured);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const reply = data.choices?.[0]?.message?.content?.trim();
      return reply || this.fallbackSessionGreeting(structured);
    } catch (err) {
      this.logger.warn(`OpenAI greeting error: ${(err as Error).message}`);
      return this.fallbackSessionGreeting(structured);
    }
  }

  private fallbackSessionGreeting(
    structured: Record<string, unknown>,
  ): string {
    const empresa = String(structured.empresa ?? 'tu negocio');
    const hoy = structured.hoy as
      | { ventas?: number; totalCOP?: number }
      | undefined;
    const ventas = hoy?.ventas ?? 0;
    const total = hoy?.totalCOP ?? 0;
    const fmt = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(total);

    return [
      `¡Hola! Soy **VOS AI**, tu gerente digital de **${empresa}**.`,
      '',
      ventas > 0
        ? `• Hoy llevamos **${ventas}** venta${ventas === 1 ? '' : 's'} por **${fmt}**`
        : '• Aún no hay ventas registradas hoy — buen momento para revisar stock y pedidos',
      '• Puedo contarte utilidad, compras, personal, tienda web y clientes',
      '',
      '¿Qué querés revisar primero?',
    ].join('\n');
  }

  private async askOpenAi(
    question: string,
    companyId?: string,
    history?: AssistantHistoryItem[],
  ): Promise<string | null> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) return null;

    const model =
      this.config.get<string>('OPENAI_CHAT_MODEL')?.trim() || 'gpt-4o';

    const [structured, narrative] = await Promise.all([
      this.insights.buildStructuredContext(companyId),
      this.insights.buildContextBundle(companyId),
    ]);

    const system = `Eres VOS AI, el gerente digital del negocio dentro de la app. Conocés la operación al detalle y hablás con el dueño, gerente o equipo autorizado.

PERSONALIDAD:
- Español colombiano, cercano y profesional (tuteo respetuoso: "podés", "contame").
- Proactivo: si saludan, respondé con calidez Y un dato útil del negocio si está en los datos.
- Inteligente: interpretá preguntas vagas ("¿cómo vamos?", "¿qué me preocupa?", "¿qué hago hoy?") usando el contexto completo.
- Conectá puntos: si preguntan por utilidad, mencioná compras y nómina si impactan; si hay stock bajo, sugerí reponer.

REGLAS ESTRICTAS:
- Usa SOLO cifras y hechos de DATOS_JSON y RESUMEN. No inventes ventas, clientes ni montos.
- Montos en COP, sin decimales, formato $1.234.567.
- Si falta un dato, dilo con claridad y sugiere qué cargar en el sistema.
- No digas que eres GPT, OpenAI ni un modelo de lenguaje.

FORMATO (respeta saltos de línea):
1) Respuesta directa (1–3 frases). Concepto clave en **negrita**.
2) Línea en blanco.
3) Detalle con viñetas • si aplica (máx 5 viñetas salvo listado pedido).
4) Línea en blanco.
5) Cierre: recomendación accionable o pregunta de seguimiento útil.

CAPACIDADES que podés ofrecer:
• Ventas hoy, semana y mes · utilidad y resultado aproximado
• Inventario bajo y qué comprar · compras y proveedores
• Personal y nómina · pedidos tienda online
• Productos más rentables · clientes que no han vuelto · tareas del día

Si mezclan temas en una pregunta, integrá todo en una sola respuesta coherente.
Si ya hablaron de algo en el historial, no repitas: profundizá o cambiá el ángulo.
Máximo 14 líneas salvo que pidan un listado largo.`;

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: system },
    ];

    const trimmedHistory = (history ?? [])
      .filter(
        (m) =>
          m.content?.trim() && m.content.trim() !== ASSISTANT_SESSION_START,
      )
      .slice(-10);
    for (const item of trimmedHistory) {
      messages.push({ role: item.role, content: item.content.trim() });
    }

    messages.push({
      role: 'user',
      content: `DATOS_JSON:\n${JSON.stringify(structured, null, 2)}\n\nRESUMEN:\n${narrative}\n\nMENSAJE:\n${question}`,
    });

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.45,
          max_tokens: 1000,
          messages,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.warn(`OpenAI ${res.status}: ${detail.slice(0, 200)}`);
        return null;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      this.logger.warn(`OpenAI error: ${(err as Error).message}`);
      return null;
    }
  }
}
