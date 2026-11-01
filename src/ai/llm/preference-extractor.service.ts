import { Injectable, Logger } from '@nestjs/common';
import { LlmRouterService, LlmUnavailableError } from './llm-router.service';
import { CustomerProfile } from '../graph/types/graph-state.types';

export interface ExtractionResult {
  extracted: Partial<CustomerProfile>;
  confidence: number;
  fieldsExtracted: string[];
}

export interface ExtractionContext {
  currentProfile?: Partial<CustomerProfile>;
  /** Last few conversation messages, oldest first, prefixed with role */
  conversationHistory?: string[];
}

/**
 * Extracts structured customer preferences from natural language using the
 * LLM router. Ported from the WhatsApp reference bot's PreferenceExtractorAgent
 * and trimmed to the fields of this backend's CustomerProfile.
 */
@Injectable()
export class PreferenceExtractorService {
  private readonly logger = new Logger(PreferenceExtractorService.name);

  constructor(private llmRouter: LlmRouterService) {}

  private readonly EXTRACTION_PROMPT = `Você é um especialista em extrair preferências estruturadas de mensagens sobre compra de veículos.

TAREFA:
Analise a mensagem do cliente e extraia TODAS as preferências mencionadas em formato JSON estruturado.

REGRAS:
1. Extraia apenas informações EXPLICITAMENTE mencionadas
2. Omita campos não mencionados (não use null)
3. Seja preciso e literal (não invente ou assuma)
4. Considere sinônimos e variações de escrita
5. Retorne APENAS JSON válido, sem texto adicional
6. Se o usuário mencionar NOME DE MODELO (ex: Spin, Civic, Corolla), SEMPRE extraia brand e model:
   - Spin, Onix, Prisma, Cobalt, Tracker, S10 = chevrolet
   - Civic, City, Fit, HR-V, CR-V = honda
   - Corolla, Yaris, Etios, Hilux = toyota
   - Gol, Polo, Fox, Voyage, Saveiro, T-Cross, Virtus = volkswagen
   - HB20, Creta, Tucson, i30 = hyundai
   - Argo, Cronos, Mobi, Uno, Palio, Siena, Strada, Toro = fiat
   - Ka, Fiesta, Focus, EcoSport, Ranger = ford
   - Kwid, Sandero, Logan, Duster = renault
7. Converta SEMPRE valores por extenso para números:
   "setenta e cinco mil" → 75000, "cinquenta mil" → 50000, "cem mil" → 100000

CAMPOS POSSÍVEIS:
- customerName: string (apenas se o cliente disser o próprio nome)
- budget: number (valor em reais)
- budgetMin: number (se mencionar "a partir de X")
- budgetMax: number (se mencionar "até X")
- people: number (passageiros + motorista)
- minSeats: number (ex: "7 lugares" → minSeats: 7; Spin, SW4, Pajero, Commander são 7 lugares)
- usage: "cidade" | "viagem" | "trabalho" | "misto" | "app"
- bodyType: "sedan" | "suv" | "hatch" | "pickup" | "minivan"
- minYear: number (ano mínimo aceito)
- maxKm: number (quilometragem máxima)
- transmission: "manual" | "automatico"
- fuelType: "gasolina" | "flex" | "diesel" | "hibrido" | "eletrico"
- color: string
- brand: string (marca preferida, minúsculas)
- model: string (modelo específico, minúsculas)
- priorities: string[] (ex: ["economico", "conforto", "espaco", "seguranca", "potencia", "familia", "cadeirinha"])
- dealBreakers: string[] (ex: ["leilao", "alta_quilometragem", "hatch_pequeno"])
- wantsFinancing: boolean ("financiar", "parcelar", "entrada", "parcela")
- financingDownPayment: number (valor da entrada se mencionado)
- financingMonths: number (prazo em meses/parcelas se mencionado)
- hasTradeIn: boolean ("troca", "tenho um carro", "meu carro na troca")
- tradeInBrand: string
- tradeInModel: string
- tradeInYear: number

REGRAS ESPECIAIS:
- "cadeirinha", "bebê conforto", "criança", "filhos" → usage: "viagem", priorities incluir "familia" e "cadeirinha"
- "picape", "caminhonete", "caçamba", "carga", "obra" → bodyType: "pickup"
- "uber", "99", "aplicativo", "motorista de app" → usage: "app"
- "sou alto", "sou grande", "1,90" → priorities incluir "espaco" e "conforto"; dealBreakers incluir "hatch_pequeno"

CONTEXTO DE CONVERSA (IMPORTANTE):
- Se a ÚLTIMA MENSAGEM do assistente perguntou sobre "carro na troca"/"seu carro atual", a resposta (ex: "É um Gol 2015") deve virar tradeInModel/tradeInYear/tradeInBrand + hasTradeIn: true (NÃO preencha model/minYear do carro desejado)
- Se a ÚLTIMA MENSAGEM do assistente falou de "financiamento"/"entrada": valor <= 25000 → financingDownPayment + wantsFinancing: true; valor > 25000 → budget

FORMATO DA SAÍDA:
{"extracted": { ... }, "confidence": 0.0-1.0, "fieldsExtracted": ["campo1", ...]}

EXEMPLO:
Entrada: "Quero um SUV até 90 mil pra família, tenho um Gol 2015 na troca"
Saída: {"extracted": {"bodyType": "suv", "budget": 90000, "budgetMax": 90000, "usage": "viagem", "priorities": ["familia"], "hasTradeIn": true, "tradeInBrand": "volkswagen", "tradeInModel": "gol", "tradeInYear": 2015}, "confidence": 0.95, "fieldsExtracted": ["bodyType", "budget", "budgetMax", "usage", "priorities", "hasTradeIn", "tradeInBrand", "tradeInModel", "tradeInYear"]}`;

  /**
   * Extract preferences from a user message.
   * Throws LlmUnavailableError when no provider is available so callers can
   * fall back to rule-based extraction.
   */
  async extract(
    message: string,
    context: ExtractionContext = {},
  ): Promise<ExtractionResult> {
    let contextString = '';
    if (
      context.currentProfile &&
      Object.keys(context.currentProfile).length > 0
    ) {
      const { _lastShownVehicles, ...publicProfile } = context.currentProfile;
      contextString = `\n\nPERFIL ATUAL DO CLIENTE:\n${JSON.stringify(publicProfile)}`;
    }
    if (context.conversationHistory?.length) {
      const recent = context.conversationHistory.slice(-3).join('\n');
      contextString += `\n\nMENSAGENS RECENTES:\n${recent}`;
    }

    const result = await this.llmRouter.chat(
      [
        { role: 'system', content: this.EXTRACTION_PROMPT + contextString },
        {
          role: 'user',
          content: `MENSAGEM DO CLIENTE: "${message}"\n\nRetorne APENAS o JSON de extração:`,
        },
      ],
      { temperature: 0.1, maxTokens: 400 },
    );

    return this.parseResult(result.content);
  }

  private parseResult(llmResponse: string): ExtractionResult {
    try {
      let cleaned = llmResponse.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```(?:json)?\n?/g, '');
      }

      const parsed = JSON.parse(cleaned) as ExtractionResult;
      if (!parsed.extracted || typeof parsed.confidence !== 'number') {
        throw new Error('Invalid extraction result structure');
      }

      return {
        extracted: parsed.extracted,
        confidence: parsed.confidence,
        fieldsExtracted: Array.isArray(parsed.fieldsExtracted)
          ? parsed.fieldsExtracted
          : Object.keys(parsed.extracted),
      };
    } catch (error) {
      if (error instanceof LlmUnavailableError) throw error;
      this.logger.warn(
        `Failed to parse extraction result: ${String(error)} — response: ${llmResponse.substring(0, 120)}`,
      );
      return { extracted: {}, confidence: 0, fieldsExtracted: [] };
    }
  }
}
