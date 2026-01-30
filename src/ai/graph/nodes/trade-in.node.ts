import { AIMessage } from '@langchain/core/messages';
import { IGraphState } from '../types/graph-state.types';
import { Logger } from '@nestjs/common';

const logger = new Logger('TradeInNode');

/**
 * Estimate trade-in value based on basic info
 * This is a simplified estimation - real values would come from FIPE table
 */
function estimateTradeInValue(
  brand: string,
  model: string,
  year: number,
  km?: number,
): { minValue: number; maxValue: number; confidence: string } {
  // Base values by brand tier (simplified)
  const brandTiers: Record<string, number> = {
    toyota: 1.1,
    honda: 1.1,
    volkswagen: 1.0,
    chevrolet: 0.95,
    fiat: 0.9,
    hyundai: 1.0,
    jeep: 1.15,
    ford: 0.95,
    renault: 0.9,
    nissan: 0.95,
  };

  const currentYear = new Date().getFullYear();
  const age = currentYear - year;

  // Base value estimation (very simplified)
  let baseValue = 50000; // Default base

  // Adjust by age (depreciation ~10-15% per year)
  const depreciationRate = 0.12;
  baseValue = baseValue * Math.pow(1 - depreciationRate, age);

  // Adjust by brand
  const brandMultiplier = brandTiers[brand.toLowerCase()] || 1.0;
  baseValue = baseValue * brandMultiplier;

  // Adjust by km (if provided)
  if (km) {
    const expectedKm = age * 15000; // 15k km/year average
    const kmDiff = km - expectedKm;
    const kmAdjustment = 1 - (kmDiff / 100000) * 0.1; // 10% adjustment per 100k km difference
    baseValue = baseValue * Math.max(0.7, Math.min(1.1, kmAdjustment));
  }

  // Range
  const minValue = Math.round(baseValue * 0.85);
  const maxValue = Math.round(baseValue * 1.05);

  return {
    minValue,
    maxValue,
    confidence: age <= 5 ? 'alta' : age <= 10 ? 'média' : 'baixa',
  };
}

/**
 * Extract trade-in info from message
 */
function extractTradeInInfo(message: string): {
  brand?: string;
  model?: string;
  year?: number;
  km?: number;
} {
  const lower = message.toLowerCase();
  const info: { brand?: string; model?: string; year?: number; km?: number } = {};

  // Brand detection
  const brands = [
    'toyota', 'honda', 'volkswagen', 'vw', 'fiat', 'chevrolet', 'gm',
    'ford', 'hyundai', 'jeep', 'nissan', 'renault', 'peugeot', 'citroen',
  ];
  for (const brand of brands) {
    if (lower.includes(brand)) {
      info.brand = brand === 'vw' ? 'volkswagen' : brand === 'gm' ? 'chevrolet' : brand;
      break;
    }
  }

  // Model detection (common models)
  const models = [
    'corolla', 'civic', 'gol', 'polo', 'onix', 'hb20', 'creta', 'compass',
    'kicks', 'renegade', 'tracker', 'tcross', 't-cross', 'nivus', 'argo',
    'cronos', 'mobi', 'uno', 'palio', 'siena', 'toro', 'strada', 'saveiro',
    'hilux', 'ranger', 's10', 'amarok', 'frontier',
  ];
  for (const model of models) {
    if (lower.includes(model)) {
      info.model = model;
      break;
    }
  }

  // Year detection
  const yearMatch = lower.match(/20[0-2]\d/);
  if (yearMatch) {
    info.year = parseInt(yearMatch[0]);
  }

  // KM detection
  const kmMatch = lower.match(/(\d{2,3})[\s.]?(?:mil)?\s*km/i);
  if (kmMatch) {
    info.km = parseInt(kmMatch[1]) * 1000;
  }

  return info;
}

/**
 * Trade-In Node - Handles trade-in evaluation
 */
export async function tradeInNode(state: IGraphState): Promise<Partial<IGraphState>> {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage || typeof lastMessage.content !== 'string') {
    return {};
  }

  const message = lastMessage.content;
  const lower = message.toLowerCase();
  logger.log(`Processing trade-in: "${message.substring(0, 50)}..."`);

  // Extract trade-in info from message
  const extractedInfo = extractTradeInInfo(message);

  // Merge with existing profile info
  const tradeInBrand = extractedInfo.brand || state.profile.tradeInBrand;
  const tradeInModel = extractedInfo.model || state.profile.tradeInModel;
  const tradeInYear = extractedInfo.year || state.profile.tradeInYear;
  const tradeInKm = extractedInfo.km;

  // Update profile
  const updatedProfile = {
    ...state.profile,
    hasTradeIn: true,
    ...(tradeInBrand && { tradeInBrand }),
    ...(tradeInModel && { tradeInModel }),
    ...(tradeInYear && { tradeInYear }),
  };

  // If we have enough info, estimate value
  if (tradeInBrand && tradeInYear) {
    const estimation = estimateTradeInValue(
      tradeInBrand,
      tradeInModel || 'modelo',
      tradeInYear,
      tradeInKm,
    );

    const modelText = tradeInModel
      ? `${tradeInBrand.toUpperCase()} ${tradeInModel.toUpperCase()}`
      : tradeInBrand.toUpperCase();

    let response = `🚗 *Avaliação do seu ${modelText} ${tradeInYear}*\n\n`;
    response += `💰 Valor estimado:\n`;
    response += `R$ ${estimation.minValue.toLocaleString('pt-BR')} - R$ ${estimation.maxValue.toLocaleString('pt-BR')}\n\n`;
    response += `_Confiança: ${estimation.confidence}_\n\n`;

    response += `⚠️ *Importante:* Este é um valor estimado. O valor final depende de:\n`;
    response += `• Estado de conservação\n`;
    response += `• Quilometragem real\n`;
    response += `• Histórico de manutenção\n\n`;

    response += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    response += `Quer que eu considere esse valor na busca do seu próximo carro?\n`;
    response += `Ou prefere falar com um consultor pra uma avaliação presencial?`;

    return {
      profile: {
        ...updatedProfile,
        tradeInEstimatedValue: Math.round((estimation.minValue + estimation.maxValue) / 2),
      },
      messages: [new AIMessage(response)],
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
        flags: [...state.metadata.flags, 'trade_in_evaluated'],
      },
    };
  }

  // Handle navigation
  if (/voltar|ver carros|opções|recomend/i.test(lower)) {
    return {
      next: 'recommendation',
      profile: updatedProfile,
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  if (/vendedor|humano|avaliar presencial/i.test(lower)) {
    return {
      next: 'negotiation',
      profile: updatedProfile,
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  // Need more info
  let question = `Pra avaliar seu carro, preciso de algumas informações! 🚗\n\n`;

  if (!tradeInBrand) {
    question += `• Qual a *marca* do seu carro?\n`;
  }
  if (!tradeInModel) {
    question += `• Qual o *modelo*?\n`;
  }
  if (!tradeInYear) {
    question += `• Qual o *ano*?\n`;
  }

  question += `\n_Exemplo: "Tenho um Corolla 2020"_`;

  return {
    profile: updatedProfile,
    messages: [new AIMessage(question)],
    metadata: {
      ...state.metadata,
      lastMessageAt: Date.now(),
    },
  };
}
