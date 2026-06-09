import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessInsightsService } from './business-insights.service';

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
      return this.insights.helpText();
    }

    const direct = await this.tryDirectAnswer(text, companyId);
    if (direct) return direct;

    const ai = await this.askOpenAi(text, companyId, history);
    if (ai) return ai;

    return [
      'No encontré un dato exacto para eso. Probá preguntando así:',
      '• ¿Cómo va el negocio hoy?',
      '• ¿Qué debo comprar?',
      '• ¿Cuál fue la utilidad del mes?',
      '• ¿Qué producto deja más dinero?',
      '• ¿Hay pedidos en la tienda?',
      '• ¿Cuánto llevamos en compras y nómina?',
    ].join('\n');
  }

  private async tryDirectAnswer(
    text: string,
    companyId?: string,
  ): Promise<string | null> {
    const n = normalize(text);

    if (/^(ayuda|help|que puedes|que sabes|comandos|hola|buenas)/.test(n)) {
      return this.insights.helpText();
    }
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

    return null;
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

    const system = `Eres VOS AI, el gerente digital del negocio. Respondes en español colombiano, tono cercano y profesional.

REGLAS:
- Usa SOLO los datos en DATOS_JSON y RESUMEN. No inventes cifras.
- Montos en COP, sin decimales, formato $1.234.567.
- Respuestas útiles y accionables: qué hacer, qué revisar, qué comprar.
- Usa viñetas • cuando listes ítems.
- Si la pregunta mezcla temas (ventas + inventario + compras), integra todo en una respuesta coherente.
- Si falta un dato, dilo claramente y sugiere qué registrar en el sistema.
- Máximo 12 líneas salvo que pidan un listado largo.`;

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: system },
    ];

    const trimmedHistory = (history ?? [])
      .filter((m) => m.content?.trim())
      .slice(-8);
    for (const item of trimmedHistory) {
      messages.push({ role: item.role, content: item.content.trim() });
    }

    messages.push({
      role: 'user',
      content: `DATOS_JSON:\n${JSON.stringify(structured, null, 2)}\n\nRESUMEN:\n${narrative}\n\nPREGUNTA:\n${question}`,
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
          temperature: 0.25,
          max_tokens: 900,
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
