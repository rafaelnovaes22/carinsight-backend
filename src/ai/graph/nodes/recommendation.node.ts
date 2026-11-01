import { AIMessage } from '@langchain/core/messages';
import { IGraphState, VehicleRecommendation } from '../types/graph-state.types';
import { Logger } from '@nestjs/common';

const logger = new Logger('RecommendationNode');

/**
 * Format price for display
 */
function formatPrice(price: number | string | null): string {
  if (!price) return 'Consulte';
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice)) return 'Consulte';
  return numPrice.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Format recommendations into a nice message
 */
function formatRecommendations(
  recommendations: VehicleRecommendation[],
): string {
  if (recommendations.length === 0) {
    return (
      `Poxa, não encontrei veículos disponíveis com esses critérios no momento. 😕\n\n` +
      `Quer que eu:\n` +
      `• Busque com critérios mais flexíveis?\n` +
      `• Te passe para um vendedor que pode ajudar?`
    );
  }

  let message = `Encontrei algumas opções que combinam com você! 🚗✨\n\n`;

  recommendations.forEach((rec, index) => {
    const vehicle = rec.vehicle;
    if (!vehicle) return;

    const num = index + 1;
    const km = vehicle.mileage
      ? `${Math.round(vehicle.mileage / 1000)}mil km`
      : '';
    const price = formatPrice(vehicle.price);

    message += `*${num}. ${vehicle.make} ${vehicle.model}* ${vehicle.yearModel}\n`;
    message += `   ${km} • R$ ${price}\n`;

    if (rec.reasoning) {
      message += `   _${rec.reasoning}_\n`;
    }

    message += `\n`;
  });

  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  message += `Curtiu algum? Me diz o número (1, 2 ou 3) pra ver mais detalhes!\n\n`;
  message += `Ou me conta se quer:\n`;
  message += `• Ver mais opções\n`;
  message += `• Saber sobre financiamento\n`;
  message += `• Falar com um vendedor`;

  return message;
}

/**
 * Format vehicle details
 */
function formatVehicleDetails(rec: VehicleRecommendation): string {
  const vehicle = rec.vehicle;
  if (!vehicle) return 'Detalhes não disponíveis';

  let details = `📋 *${vehicle.make} ${vehicle.model}*\n\n`;
  details += `📅 Ano: ${vehicle.yearModel}\n`;
  details += `🛣️ ${vehicle.mileage?.toLocaleString('pt-BR') || 'N/A'} km\n`;
  details += `💰 R$ ${formatPrice(vehicle.price)}\n`;
  details += `🚗 Tipo: ${vehicle.bodyType}\n`;

  if (vehicle.features && vehicle.features.length > 0) {
    details += `\n✨ *Destaques:*\n`;
    vehicle.features.slice(0, 5).forEach((f) => {
      details += `• ${f}\n`;
    });
  }

  if (rec.highlights && rec.highlights.length > 0) {
    details += `\n👍 *Por que esse carro:*\n`;
    rec.highlights.forEach((h) => {
      details += `• ${h}\n`;
    });
  }

  details += `\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
  details += `Gostou? Você pode:\n`;
  details += `• "Agendar visita" pra ver de perto\n`;
  details += `• "Financiamento" pra simular parcelas\n`;
  details += `• "Falar com vendedor" pra negociar`;

  return details;
}

/**
 * Recommendation Node - Presents vehicles and handles selection
 */
export function recommendationNode(state: IGraphState): Partial<IGraphState> {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage || typeof lastMessage.content !== 'string') {
    // First time showing recommendations
    if (state.recommendations.length > 0) {
      return {
        messages: [new AIMessage(formatRecommendations(state.recommendations))],
        metadata: {
          ...state.metadata,
          lastMessageAt: Date.now(),
        },
      };
    }
    return {};
  }

  const message = lastMessage.content;
  const lower = message.toLowerCase();
  logger.log(`Processing recommendation: "${message.substring(0, 50)}..."`);

  // Handle vehicle number selection (1, 2, 3)
  const numberMatch = lower.trim().match(/^[1-3]$/);
  if (numberMatch) {
    const vehicleIndex = parseInt(numberMatch[0]) - 1;
    if (vehicleIndex >= 0 && vehicleIndex < state.recommendations.length) {
      const rec = state.recommendations[vehicleIndex];
      logger.log(`User selected vehicle ${vehicleIndex + 1}`);

      return {
        messages: [new AIMessage(formatVehicleDetails(rec))],
        metadata: {
          ...state.metadata,
          lastMessageAt: Date.now(),
          flags: [...state.metadata.flags, `viewed_vehicle_${rec.vehicleId}`],
        },
      };
    }
  }

  // Handle "agendar" / schedule visit - scheduling happens with the store on WhatsApp
  if (/agendar|visita|test.?drive|conhecer/i.test(lower)) {
    logger.log('Visit requested');
    return {
      next: 'lead_handoff',
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
        flags: [...state.metadata.flags, 'visit_requested'],
      },
    };
  }

  // Handle "vendedor" / talk to human - lead_handoff node produces the response
  if (/vendedor|humano|atendente|pessoa/i.test(lower)) {
    logger.log('Human handoff requested');
    return {
      next: 'lead_handoff',
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
        flags: [...state.metadata.flags, 'handoff_requested'],
      },
    };
  }

  // Handle financing intent
  if (/financ|parcel|entrada|prestação/i.test(lower)) {
    logger.log('Financing intent detected');
    return {
      next: 'financing',
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  // Handle trade-in intent
  if (/troca|meu carro|tenho um|dar na troca/i.test(lower)) {
    logger.log('Trade-in intent detected');
    return {
      next: 'trade_in',
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  // Handle interest / purchase intent - ready lead goes to the store's WhatsApp
  if (
    /gostei|interessei|quero esse|quero o|vou levar|fechar|comprar/i.test(lower)
  ) {
    logger.log('Purchase interest detected');
    return {
      next: 'lead_handoff',
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
        flags: [...state.metadata.flags, 'purchase_intent'],
      },
    };
  }

  // Handle "more options" request
  if (/mais opções|outras|diferentes|outro/i.test(lower)) {
    return {
      next: 'search',
      profile: {
        ...state.profile,
        _showedRecommendation: false,
      },
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
      messages: [new AIMessage(`Vou buscar mais opções pra você! 🔍`)],
    };
  }

  // First time showing recommendations or fallback
  if (
    state.recommendations.length > 0 &&
    !state.profile._showedRecommendation
  ) {
    return {
      profile: {
        ...state.profile,
        _showedRecommendation: true,
      },
      messages: [new AIMessage(formatRecommendations(state.recommendations))],
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  // Fallback - offer help
  return {
    messages: [
      new AIMessage(
        `Posso te ajudar com algo mais? 🤔\n\n` +
          `• Digite um número (1, 2 ou 3) pra ver detalhes\n` +
          `• "Mais opções" pra ver outros carros\n` +
          `• "Financiamento" pra simular parcelas\n` +
          `• "Vendedor" pra falar com alguém`,
      ),
    ],
    metadata: {
      ...state.metadata,
      lastMessageAt: Date.now(),
    },
  };
}
