import { AIMessage } from '@langchain/core/messages';
import { IGraphState } from '../types/graph-state.types';
import { Logger } from '@nestjs/common';

const logger = new Logger('NegotiationNode');

/**
 * Format customer summary for handoff
 */
function formatCustomerSummary(state: IGraphState): string {
  const profile = state.profile;
  let summary = `📋 *Resumo do Cliente*\n\n`;

  if (profile.customerName) {
    summary += `👤 Nome: ${profile.customerName}\n`;
  }

  if (profile.budget) {
    summary += `💰 Orçamento: R$ ${profile.budget.toLocaleString('pt-BR')}\n`;
  }

  if (profile.bodyType) {
    summary += `🚗 Tipo: ${profile.bodyType.toUpperCase()}\n`;
  }

  if (profile.usage) {
    summary += `📍 Uso: ${profile.usage}\n`;
  }

  if (profile.hasTradeIn) {
    summary += `\n🔄 *Troca:*\n`;
    if (profile.tradeInBrand) summary += `   ${profile.tradeInBrand}`;
    if (profile.tradeInModel) summary += ` ${profile.tradeInModel}`;
    if (profile.tradeInYear) summary += ` ${profile.tradeInYear}`;
    if (profile.tradeInEstimatedValue) {
      summary += `\n   Valor estimado: R$ ${profile.tradeInEstimatedValue.toLocaleString('pt-BR')}`;
    }
    summary += `\n`;
  }

  if (profile.wantsFinancing) {
    summary += `\n💳 *Financiamento:*\n`;
    if (profile.financingDownPayment) {
      summary += `   Entrada: R$ ${profile.financingDownPayment.toLocaleString('pt-BR')}\n`;
    }
    if (profile.financingMonths) {
      summary += `   Prazo: ${profile.financingMonths}x\n`;
    }
  }

  if (state.recommendations.length > 0) {
    summary += `\n🚗 *Veículos de interesse:*\n`;
    state.recommendations.slice(0, 3).forEach((rec, i) => {
      if (rec.vehicle) {
        summary += `   ${i + 1}. ${rec.vehicle.make} ${rec.vehicle.model} ${rec.vehicle.yearModel}\n`;
      }
    });
  }

  return summary;
}

/**
 * Negotiation Node - Handles final steps and handoff to human
 */
export function negotiationNode(state: IGraphState): Partial<IGraphState> {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage || typeof lastMessage.content !== 'string') {
    // First time in negotiation - show summary and offer handoff
    const summary = formatCustomerSummary(state);

    return {
      messages: [
        new AIMessage(
          `Perfeito! Vou te conectar com um de nossos consultores. 👨‍💼\n\n` +
            summary +
            `\n━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Um consultor vai entrar em contato pelo WhatsApp em breve!\n\n` +
            `_Enquanto isso, posso te ajudar com mais alguma coisa?_`,
        ),
      ],
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
        flags: [...state.metadata.flags, 'negotiation_started'],
      },
    };
  }

  const message = lastMessage.content;
  const lower = message.toLowerCase();
  logger.log(`Processing negotiation: "${message.substring(0, 50)}..."`);

  // Handle back to recommendations
  if (/voltar|ver carros|outras opções|mais carros/i.test(lower)) {
    return {
      next: 'recommendation',
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  // Handle new search
  if (/buscar|procurar|outro tipo|diferente/i.test(lower)) {
    return {
      next: 'discovery',
      profile: {
        ...state.profile,
        _showedRecommendation: false,
      },
      recommendations: [],
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
      messages: [
        new AIMessage(
          `Claro! Vamos buscar outras opções. 🔍\n\n` +
            `Me conta o que você está procurando agora?`,
        ),
      ],
    };
  }

  // Handle exit
  if (/tchau|bye|sair|encerrar|obrigado|valeu/i.test(lower)) {
    return {
      next: 'end',
      messages: [
        new AIMessage(
          `Foi um prazer ajudar! 😊\n\n` +
            `Nosso consultor vai entrar em contato em breve.\n\n` +
            `Até mais e boa sorte com o carro novo! 🚗✨`,
        ),
      ],
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
        flags: [...state.metadata.flags, 'conversation_ended'],
      },
    };
  }

  // Handle questions while waiting
  if (/quando|prazo|demora|contato/i.test(lower)) {
    return {
      messages: [
        new AIMessage(
          `Nosso consultor costuma responder em até 30 minutos durante o horário comercial. ⏰\n\n` +
            `Se preferir, pode ligar diretamente para a loja!\n\n` +
            `_Posso ajudar com mais alguma coisa enquanto isso?_`,
        ),
      ],
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  // Default - confirm handoff is in progress
  return {
    messages: [
      new AIMessage(
        `Seu contato já foi encaminhado para nossa equipe! 👍\n\n` +
          `Enquanto aguarda, posso:\n` +
          `• Mostrar mais opções de carros\n` +
          `• Simular financiamento\n` +
          `• Tirar dúvidas sobre os veículos\n\n` +
          `_É só me dizer!_`,
      ),
    ],
    metadata: {
      ...state.metadata,
      lastMessageAt: Date.now(),
    },
  };
}
