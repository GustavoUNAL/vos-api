import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessInsightsService } from './business-insights.service';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

@Injectable()
export class BusinessAssistantService {
  constructor(
    private readonly config: ConfigService,
    private readonly insights: BusinessInsightsService,
  ) {}

  async answer(question: string, companyId?: string): Promise<string> {
    const text = question.trim();
    if (!text) {
      return 'Escribí una pregunta sobre ventas, inventario o clientes.';
    }
    return this.routeQuestion(text, companyId);
  }

  private async routeQuestion(text: string, companyId?: string): Promise<string> {
    const n = normalize(text);

    if (
      /negocio|como va|ventas hoy|hoy va|resumen del dia|resumen hoy/.test(n)
    ) {
      return this.insights.todayBusiness(companyId);
    }
    if (
      /que debo comprar|que comprar|reponer|inventario bajo|falta stock|comprar/.test(
        n,
      )
    ) {
      return this.insights.purchaseRecommendations(companyId);
    }
    if (
      /utilidad del mes|ganancia del mes|utilidad mensual|cuanto gane/.test(n)
    ) {
      return this.insights.monthlyProfit(companyId);
    }
    if (
      /producto.*dinero|mas rentable|deja mas|mejor producto|mas utilidad/.test(
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

    const ai = await this.askOpenAi(text, companyId);
    if (ai) return ai;

    return [
      'No entendí la pregunta. Probá con:',
      '• ¿Cómo va el negocio hoy?',
      '• ¿Qué debo comprar?',
      '• ¿Cuál fue la utilidad del mes?',
      '• ¿Qué producto deja más dinero?',
      '• ¿Qué clientes no han regresado?',
    ].join('\n');
  }

  private async askOpenAi(
    question: string,
    companyId?: string,
  ): Promise<string | null> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) return null;

    const model =
      this.config.get<string>('OPENAI_CHAT_MODEL')?.trim() || 'gpt-4o';
    const context = await this.insights.buildContextBundle(companyId);

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 600,
          messages: [
            {
              role: 'system',
              content:
                'Eres un asistente de negocio para un café en Colombia. Responde en español, breve y con cifras en COP. Usa solo los datos del contexto; si falta algo, dilo.',
            },
            {
              role: 'user',
              content: `Contexto del negocio:\n${context}\n\nPregunta: ${question}`,
            },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch {
      return null;
    }
  }
}
