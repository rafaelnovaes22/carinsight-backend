import { AIMessage } from '@langchain/core/messages';
import { Logger } from '@nestjs/common';
import { IGraphState, CustomerProfile } from '../types/graph-state.types';
import {
  LlmRouterService,
  LlmUnavailableError,
} from '../../llm/llm-router.service';
import { PreferenceExtractorService } from '../../llm/preference-extractor.service';
import { VEHICLE_EXPERT_SYSTEM_PROMPT } from '../../llm/prompts/vehicle-expert.prompt';
import {
  discoveryNode as ruleDiscoveryNode,
  extractPreferences,
  canRecommend,
  generateClarifyingQuestion,
  detectNameCorrection,
} from './discovery.node';
import { greetingNode as ruleGreetingNode } from './greeting.node';
import {
  negotiationNode as ruleNegotiationNode,
  formatCustomerSummary,
} from './negotiation.node';

const logger = new Logger('LlmNodes');

/** Detect if the user is asking an open question (ported from ref intent-detector) */
const QUESTION_PATTERNS: RegExp[] = [
  /\?$/,
  /^(qual|quais|como|quando|onde|por que|quanto)/i,
  /diferença entre/i,
  /o que [ée]/i,
  /tem (algum|alguma)/i,
  /pode (me )?(explicar|dizer|falar)/i,
  /gostaria de saber/i,
  /queria saber/i,
  /voc[êe]s?\s*tem/i,
];

function isOpenQuestion(message: string): boolean {
  return QUESTION_PATTERNS.some((p) => p.test(message.trim()));
}

/** Last N messages as "role: text" lines for LLM context */
function historyLines(state: IGraphState, n = 6): string[] {
  return state.messages.slice(-n).map((m) => {
    const role =
      typeof (m as any)._getType === 'function' &&
      (m as any)._getType() === 'ai'
        ? 'assistente'
        : 'cliente';
    const text = typeof m.content === 'string' ? m.content : '';
    return `${role}: ${text}`;
  });
}

function profileContext(profile: Partial<CustomerProfile>): string {
  const { _lastShownVehicles, _showedRecommendation, _skipOnboarding, ...pub } =
    profile;
  return Object.keys(pub).length
    ? `\n\nPERFIL DO CLIENTE ATÉ AGORA:\n${JSON.stringify(pub)}`
    : '';
}

/**
 * Discovery node powered by LLM extraction + natural clarifying questions.
 * Falls back to the rule-based discovery node when the LLM is unavailable.
 */
export function createLlmDiscoveryNode(
  llm: LlmRouterService,
  extractor: PreferenceExtractorService,
) {
  return async (state: IGraphState): Promise<Partial<IGraphState>> => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage || typeof lastMessage.content !== 'string') {
      return {};
    }
    const message = lastMessage.content;
    const lower = message.toLowerCase();

    // Deterministic commands stay rule-based
    const correctedName = detectNameCorrection(
      message,
      state.profile.customerName,
    );
    if (correctedName) {
      return ruleDiscoveryNode(state);
    }
    if (/vendedor|humano|atendente|pessoa real/i.test(lower)) {
      return {
        next: 'lead_handoff',
        metadata: {
          ...state.metadata,
          lastMessageAt: Date.now(),
          flags: [...state.metadata.flags, 'handoff_requested'],
        },
      };
    }
    if (/^(sair|tchau|bye|encerrar|finalizar)$/i.test(lower.trim())) {
      return ruleDiscoveryNode(state);
    }

    // LLM-based preference extraction, regex as fallback
    let extractedPrefs: Partial<CustomerProfile>;
    try {
      const result = await extractor.extract(message, {
        currentProfile: state.profile,
        conversationHistory: historyLines(state, 4),
      });
      extractedPrefs =
        result.confidence >= 0.3
          ? result.extracted
          : extractPreferences(message, state.profile);
    } catch (error) {
      if (!(error instanceof LlmUnavailableError)) {
        logger.warn(`LLM extraction failed: ${String(error)}`);
      }
      extractedPrefs = extractPreferences(message, state.profile);
    }
    const updatedProfile = { ...state.profile, ...extractedPrefs };

    // Routing driven by the (now richer) profile
    if (
      extractedPrefs.wantsFinancing ||
      /financ|parcel|prestação/i.test(lower)
    ) {
      return {
        next: 'financing',
        profile: updatedProfile,
        metadata: { ...state.metadata, lastMessageAt: Date.now() },
      };
    }
    if (extractedPrefs.hasTradeIn || /dar na troca|na troca/i.test(lower)) {
      return {
        next: 'trade_in',
        profile: updatedProfile,
        metadata: { ...state.metadata, lastMessageAt: Date.now() },
      };
    }
    if (canRecommend(updatedProfile)) {
      logger.log('Enough info to recommend, moving to search');
      return {
        next: 'search',
        profile: updatedProfile,
        metadata: { ...state.metadata, lastMessageAt: Date.now() },
      };
    }

    // Need more info: natural response via LLM (answers open questions too)
    try {
      const task = isOpenQuestion(message)
        ? 'Responda a pergunta do cliente de forma útil e curta, e em seguida conduza a conversa para descobrir o que falta no perfil (orçamento, tipo de carro ou uso).'
        : 'Faça UMA pergunta natural e contextual para descobrir o que falta no perfil (orçamento, tipo de carro ou uso). Reconheça brevemente o que o cliente disse.';
      const response = await llm.chat(
        [
          {
            role: 'system',
            content:
              VEHICLE_EXPERT_SYSTEM_PROMPT +
              profileContext(updatedProfile) +
              `\n\nTAREFA AGORA: ${task}`,
          },
          ...historyLines(state, 6).map((line) => ({
            role: line.startsWith('assistente:')
              ? ('assistant' as const)
              : ('user' as const),
            content: line.replace(/^(assistente|cliente): /, ''),
          })),
        ],
        { temperature: 0.7, maxTokens: 300 },
      );

      return {
        next: 'discovery',
        profile: updatedProfile,
        metadata: {
          ...state.metadata,
          lastMessageAt: Date.now(),
          loopCount: state.metadata.loopCount + 1,
        },
        messages: [new AIMessage(response.content)],
      };
    } catch (error) {
      if (!(error instanceof LlmUnavailableError)) {
        logger.warn(`LLM discovery response failed: ${String(error)}`);
      }
      return {
        next: 'discovery',
        profile: updatedProfile,
        metadata: {
          ...state.metadata,
          lastMessageAt: Date.now(),
          loopCount: state.metadata.loopCount + 1,
        },
        messages: [new AIMessage(generateClarifyingQuestion(updatedProfile))],
      };
    }
  };
}

/**
 * Greeting node with LLM-enriched intent extraction: free-form first
 * messages still land in a personalized template response.
 */
export function createLlmGreetingNode(extractor: PreferenceExtractorService) {
  return async (state: IGraphState): Promise<Partial<IGraphState>> => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage || typeof lastMessage.content !== 'string') {
      return {};
    }

    // Enrich profile with LLM extraction before the rule-based template logic
    let enrichedState = state;
    try {
      const result = await extractor.extract(lastMessage.content, {
        currentProfile: state.profile,
      });
      if (result.confidence >= 0.3 && Object.keys(result.extracted).length) {
        enrichedState = {
          ...state,
          profile: { ...state.profile, ...result.extracted },
        };
      }
    } catch {
      // Rule-based extraction inside greetingNode still applies
    }

    const update = ruleGreetingNode(enrichedState);
    // Preserve LLM-extracted profile fields in the state update
    return {
      ...update,
      profile: { ...enrichedState.profile, ...(update.profile || {}) },
    };
  };
}

/**
 * Negotiation node with LLM-powered free-form Q&A while keeping
 * deterministic routing (close/back/exit) rule-based.
 */
export function createLlmNegotiationNode(llm: LlmRouterService) {
  return async (state: IGraphState): Promise<Partial<IGraphState>> => {
    const lastMessage = state.messages[state.messages.length - 1];
    const content =
      lastMessage && typeof lastMessage.content === 'string'
        ? lastMessage.content
        : '';
    const lower = content.toLowerCase();

    // Deterministic branches delegate to the rule node
    if (
      !content ||
      /vendedor|humano|atendente|fechar|whatsapp|comprar/i.test(lower) ||
      /voltar|ver carros|outras opções|mais carros/i.test(lower) ||
      /buscar|procurar|outro tipo|diferente/i.test(lower) ||
      /tchau|bye|sair|encerrar|obrigado|valeu/i.test(lower)
    ) {
      return ruleNegotiationNode(state);
    }

    // Free-form question: answer with the vehicle expert persona
    try {
      const response = await llm.chat(
        [
          {
            role: 'system',
            content:
              VEHICLE_EXPERT_SYSTEM_PROMPT +
              profileContext(state.profile) +
              `\n\nCONTEXTO: o cliente já recebeu recomendações e está em fase final. Resumo interno:\n${formatCustomerSummary(state)}\n\nTAREFA AGORA: responda a mensagem do cliente de forma útil e curta. Ao final, ofereça continuar a negociação direto com a loja pelo WhatsApp.`,
          },
          ...state.messages.slice(-6).map((m) => ({
            role:
              typeof (m as any)._getType === 'function' &&
              (m as any)._getType() === 'ai'
                ? ('assistant' as const)
                : ('user' as const),
            content: typeof m.content === 'string' ? m.content : '',
          })),
        ],
        { temperature: 0.7, maxTokens: 350 },
      );

      return {
        messages: [new AIMessage(response.content)],
        metadata: { ...state.metadata, lastMessageAt: Date.now() },
      };
    } catch (error) {
      if (!(error instanceof LlmUnavailableError)) {
        logger.warn(`LLM negotiation response failed: ${String(error)}`);
      }
      return ruleNegotiationNode(state);
    }
  };
}
