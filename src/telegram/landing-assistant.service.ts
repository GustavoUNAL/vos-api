import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AssistantHistoryItem } from './business-assistant.service';

const PRODUCT_CONTEXT = `
VOS AI es un sistema operativo inteligente para negocios en Colombia.
- Centraliza ventas, inventario, compras, finanzas, personal y clientes.
- Asistente IA 24/7: responde en lenguaje natural con datos reales del negocio.
- Canales: app web, POS móvil y mensajería (WhatsApp/Telegram según activación).
- No es solo un POS: detecta qué comprar, productos rentables, clientes inactivos, alertas.

Fase actual: etapa de validación con usuarios reales (cafeterías, bares, restaurantes, tiendas).
- Sin costo durante la validación; cupos limitados.
- El visitante solicita acceso con "Quiero VOS AI en mi negocio" en la página.
- Si ya tiene credenciales, usa "Iniciar sesión" / "Ir a mi negocio".

Para hablar con un asesor humano: el visitante debe pedirlo en este chat (ej. "hablar con un asesor"); entonces aparece el botón para continuar por WhatsApp. NUNCA des números de teléfono ni enlaces wa.me en el texto.
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
          'Preguntame qué es VOS AI, cómo empezar con tu negocio, para qué rubros sirve o qué incluye el acceso.',
      };
    }

    const advisorSuggested = this.wantsAdvisor(text);
    const ai = await this.askOpenAi(text, history);
    if (ai) {
      return {
        answer: this.formatAnswer(ai),
        advisorSuggested: advisorSuggested || this.wantsAdvisor(ai),
      };
    }

    return {
      answer: this.formatAnswer(this.fallbackAnswer(text)),
      advisorSuggested,
    };
  }

  /** Normaliza saltos, viñetas y espaciado para el chat de la landing. */
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
      return `Perfecto — un asesor puede mostrarte el producto en vivo y armar la demo según tu negocio.

• Te guía por POS, inventario y panel
• Responde dudas de planes y activación
• Sin compromiso

En un momento te aparece el botón **Continuar por WhatsApp** para seguir con un asesor.`;
    }
    if (/que es|vos ai|para que sirve/.test(n)) {
      return `**VOS AI** centraliza tu operación y te responde con datos reales del negocio.

• Ventas (POS + tienda web), inventario y compras
• Finanzas, personal y clientes en un solo panel
• Asistente IA 24/7 en lenguaje natural

Estamos en etapa de validación con usuarios reales. ¿Te cuento cómo empezar con tu negocio?`;
    }
    if (/como funciona|como es|como se usa/.test(n)) {
      return `Funciona en tres pasos simples:

• **Registrás** ventas desde POS o tienda web
• **VOS AI analiza** stock, márgenes y tendencias en tiempo real
• **Preguntás** lo que necesites: qué comprar, utilidad del mes, clientes inactivos…

Todo queda en la nube, con acceso web y móvil. ¿Querés que profundice en POS o en el asistente?`;
    }
    if (/industria|restaur|cafeter|bar|tienda|ferreter|negocio/.test(n)) {
      return `Está pensado para negocios con operación diaria y rotación de productos.

• Cafeterías, bares y restaurantes
• Tiendas y ferreterías
• Servicios con ventas recurrentes

Si me contás tu rubro, te digo qué módulos te convienen más.`;
    }
    if (/precio|plan|cuanto cuesta|valor|tarifa/.test(n)) {
      return `Hoy estamos en **etapa de validación con usuarios reales**.

• Acceso **sin costo** mientras validamos la herramienta
• Cupos limitados y onboarding guiado
• Tu experiencia define qué construimos después

¿Querés que te explique cómo solicitar acceso?`;
    }
    if (/demo|prueba|probar|empezar|comenzar|piloto|validar|inscrib|usar vos/.test(n)) {
      return `Podés empezar así:

• **Quiero VOS AI en mi negocio** en la página — revisamos tu operación y activamos credenciales
• **Hablar con un asesor** en este chat si preferís una conversación antes

¿Cuál te resulta más cómoda?`;
    }
    return `Puedo ayudarte con:

• Qué es VOS AI y cómo funciona
• Cómo usar la plataforma con tu negocio
• Industrias y casos de uso
• Qué incluye el acceso en esta etapa

¿Qué te gustaría saber primero?`;
  }

  private async askOpenAi(
    question: string,
    history?: AssistantHistoryItem[],
  ): Promise<string | null> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) return null;

    const model =
      this.config.get<string>('OPENAI_CHAT_MODEL')?.trim() || 'gpt-4o';

    const system = `Eres el asistente comercial de VOS AI en la landing web (visitante antes de registrarse). Tono profesional, cálido y claro — español colombiano (tuteo respetuoso: "tu", "podés").

REGLAS ESTRICTAS:
- Responde SOLO sobre VOS AI: beneficios, módulos, etapa de validación con usuarios reales, industrias y cómo solicitar acceso.
- NO menciones planes de precios ni suscripciones: estamos en etapa de validación con usuarios reales.
- NO inventes clientes, testimonios ni métricas falsas.
- NO des teléfonos, WhatsApp, emails ni enlaces wa.me en el texto.
- Si piden asesor o demo humana → indica que escriban "hablar con un asesor" en este chat (aparecerá WhatsApp) o usen "Quiero VOS AI en mi negocio" en la página.
- No digas que eres GPT, OpenAI ni un modelo de lenguaje.
- Máximo 12 líneas. Respuestas escaneables, nunca un bloque denso.

FORMATO OBLIGATORIO (respeta saltos de línea):
1) Primera línea: respuesta directa (1–2 frases). Resalta el concepto clave con **negrita**.
2) Línea en blanco.
3) Detalle en 2–4 viñetas con "• " (frases cortas, beneficio concreto).
4) Línea en blanco.
5) Cierre: una pregunta de seguimiento útil (no repetitiva) O el siguiente paso lógico.

Si la pregunta es ambigua, inferí la intención más probable y respondé; al final ofrecé aclarar.
Si ya respondiste algo similar en el historial, profundizá un ángulo distinto (ej. POS, IA, finanzas).

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
          temperature: 0.4,
          max_tokens: 650,
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
