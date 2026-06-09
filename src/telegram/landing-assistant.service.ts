import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AssistantHistoryItem } from './business-assistant.service';

const PRODUCT_CONTEXT = `
VOS AI es el primer gerente digital para empresas en Colombia.
- Centraliza ventas, inventario, compras, finanzas, personal y clientes.
- Asistente IA 24/7: responde en lenguaje natural con datos reales del negocio.
- Canales: app web, POS móvil y mensajería (WhatsApp/Telegram según plan).
- No es solo un POS: detecta qué comprar, productos rentables, clientes inactivos, alertas.

Planes (COP/mes, referencia):
- Starter $49.000: operación esencial + asistente IA.
- Business $99.000: más IA + WhatsApp (recomendado).
- Premium $199.000: automatizaciones avanzadas.

Industrias: cafeterías, bares, restaurantes, tiendas, ferreterías, servicios.

Para demo o asesor humano: el visitante debe usar el botón "Hablar con un asesor" en el chat o "Solicitar demo" en la página. NUNCA des números de teléfono ni enlaces wa.me en el texto.
`.trim();

@Injectable()
export class LandingAssistantService {
  private readonly logger = new Logger(LandingAssistantService.name);

  constructor(private readonly config: ConfigService) {}

  async answer(
    question: string,
    history?: AssistantHistoryItem[],
  ): Promise<{ answer: string; advisorSuggested?: boolean }> {
    const text = question.trim();
    if (!text) {
      return {
        answer:
          'Preguntame qué es VOS AI, cómo funciona, para qué empresas sirve o cuánto cuesta.',
      };
    }

    const advisorSuggested = this.wantsAdvisor(text);
    const ai = await this.askOpenAi(text, history);
    if (ai) {
      return { answer: ai, advisorSuggested: advisorSuggested || this.wantsAdvisor(ai) };
    }

    return {
      answer: this.fallbackAnswer(text),
      advisorSuggested,
    };
  }

  private wantsAdvisor(text: string): boolean {
    const n = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    return /asesor|humano|persona|llamar|contacto|whatsapp|hablar con|comercial|ventas/.test(
      n,
    );
  }

  private fallbackAnswer(question: string): string {
    const n = question
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');

    if (this.wantsAdvisor(n)) {
      return 'Con gusto te conectamos con un asesor. Usá el botón **Hablar con un asesor** debajo del chat y te atendemos por WhatsApp.';
    }
    if (/que es|vos ai/.test(n)) {
      return '**VOS AI** es un gerente digital para empresas: ventas, inventario, compras y finanzas con un asistente IA que responde con tus datos reales.';
    }
    if (/precio|plan|cuanto cuesta/.test(n)) {
      return 'Planes desde **$49.000/mes** (Starter) hasta **$199.000/mes** (Premium). El plan Business ($99.000) incluye más IA y WhatsApp.';
    }
    return 'Puedo explicarte qué es VOS AI, cómo funciona, precios o industrias. Si necesitás un asesor, usá el botón verde del chat.';
  }

  private async askOpenAi(
    question: string,
    history?: AssistantHistoryItem[],
  ): Promise<string | null> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) return null;

    const model =
      this.config.get<string>('OPENAI_CHAT_MODEL')?.trim() || 'gpt-4o';

    const system = `Eres el asistente comercial de VOS AI en la landing web. Tono profesional, cercano, español colombiano.

REGLAS ESTRICTAS:
- Responde solo sobre VOS AI, sus beneficios, planes, industrias y cómo empezar.
- NO inventes cifras de clientes ni casos de éxito falsos.
- NO des números de teléfono, WhatsApp ni emails de contacto en el texto.
- Si piden asesor, demo personalizada o contacto humano, indica usar el botón "Hablar con un asesor" del chat o "Solicitar demo" en la página.
- Máximo 10 líneas. Usa viñetas • cuando listes. Puedes usar **negrita** para énfasis.
- No menciones que eres GPT ni OpenAI.

CONTEXTO DEL PRODUCTO:
${PRODUCT_CONTEXT}`;

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: system },
    ];

    for (const item of (history ?? []).filter((m) => m.content?.trim()).slice(-6)) {
      messages.push({ role: item.role, content: item.content.trim() });
    }
    messages.push({ role: 'user', content: question });

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.35,
          max_tokens: 500,
          messages,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.warn(`Landing OpenAI ${res.status}: ${detail.slice(0, 180)}`);
        return null;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      this.logger.warn(`Landing OpenAI error: ${(err as Error).message}`);
      return null;
    }
  }
}
