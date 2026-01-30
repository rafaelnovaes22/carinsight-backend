import { AIMessage } from '@langchain/core/messages';
import { IGraphState } from '../types/graph-state.types';
import { Logger } from '@nestjs/common';

const logger = new Logger('FinancingNode');

/**
 * Calculate financing simulation
 */
function calculateFinancing(
  vehiclePrice: number,
  downPayment: number,
  months: number,
): { monthlyPayment: number; totalAmount: number; interestRate: number } {
  // Typical Brazilian car financing rates (around 1.5-2% monthly)
  const monthlyRate = 0.0179; // 1.79% monthly
  const annualRate = Math.pow(1 + monthlyRate, 12) - 1;

  const financedAmount = vehiclePrice - downPayment;
  const monthlyPayment =
    (financedAmount * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);

  const totalAmount = monthlyPayment * months + downPayment;

  return {
    monthlyPayment: Math.round(monthlyPayment),
    totalAmount: Math.round(totalAmount),
    interestRate: annualRate * 100,
  };
}

/**
 * Format currency
 */
function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Financing Node - Handles financing simulation and questions
 */
export async function financingNode(state: IGraphState): Promise<Partial<IGraphState>> {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage || typeof lastMessage.content !== 'string') {
    return {};
  }

  const message = lastMessage.content;
  const lower = message.toLowerCase();
  logger.log(`Processing financing: "${message.substring(0, 50)}..."`);

  // Get vehicle price from last shown vehicles or profile
  let vehiclePrice = 0;
  if (state.profile._lastShownVehicles && state.profile._lastShownVehicles.length > 0) {
    vehiclePrice = state.profile._lastShownVehicles[0].price;
  } else if (state.profile.budget) {
    vehiclePrice = state.profile.budget;
  }

  // Extract down payment from message
  const downPaymentMatch = lower.match(/entrada.*?(\d{1,3})[\s.]?(?:mil|k)?/i) ||
    lower.match(/(\d{1,3})[\s.]?(?:mil|k)?\s*(?:de\s*)?entrada/i);

  // Extract months from message
  const monthsMatch = lower.match(/(\d{1,3})\s*(?:meses?|x|vezes|parcelas?)/i);

  // If we have enough info, calculate
  if (vehiclePrice > 0) {
    const downPayment = downPaymentMatch
      ? parseInt(downPaymentMatch[1]) * (downPaymentMatch[0].includes('mil') || parseInt(downPaymentMatch[1]) < 100 ? 1000 : 1)
      : vehiclePrice * 0.2; // Default 20% down

    const months = monthsMatch ? parseInt(monthsMatch[1]) : 48; // Default 48 months

    const simulation = calculateFinancing(vehiclePrice, downPayment, months);

    // Also calculate alternative scenarios
    const sim36 = calculateFinancing(vehiclePrice, downPayment, 36);
    const sim60 = calculateFinancing(vehiclePrice, downPayment, 60);

    let response = `💰 *Simulação de Financiamento*\n\n`;
    response += `Veículo: R$ ${formatCurrency(vehiclePrice)}\n`;
    response += `Entrada: R$ ${formatCurrency(downPayment)} (${Math.round((downPayment / vehiclePrice) * 100)}%)\n`;
    response += `Valor financiado: R$ ${formatCurrency(vehiclePrice - downPayment)}\n\n`;

    response += `📊 *Opções de parcelamento:*\n\n`;
    response += `• *36x* de R$ ${formatCurrency(sim36.monthlyPayment)}\n`;
    response += `• *48x* de R$ ${formatCurrency(simulation.monthlyPayment)}\n`;
    response += `• *60x* de R$ ${formatCurrency(sim60.monthlyPayment)}\n\n`;

    response += `_Taxa aproximada: ${simulation.interestRate.toFixed(1)}% a.a._\n\n`;
    response += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    response += `Quer ajustar a entrada ou prazo?\n`;
    response += `Ou posso te passar pra um consultor pra fechar as condições! 👨‍💼`;

    // Update profile with financing preferences
    const updatedProfile = {
      ...state.profile,
      wantsFinancing: true,
      financingDownPayment: downPayment,
      financingMonths: months,
    };

    return {
      profile: updatedProfile,
      messages: [new AIMessage(response)],
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
        flags: [...state.metadata.flags, 'financing_simulated'],
      },
    };
  }

  // No vehicle price - ask for context
  if (!vehiclePrice) {
    return {
      next: 'discovery',
      messages: [
        new AIMessage(
          `Pra simular o financiamento, preciso saber qual veículo te interessa! 🚗\n\n` +
          `Me conta:\n` +
          `• Qual tipo de carro você procura?\n` +
          `• Qual seu orçamento?\n\n` +
          `Assim posso te mostrar as opções e simular as parcelas!`
        ),
      ],
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  // Handle back to recommendations
  if (/voltar|ver carros|opções|recomend/i.test(lower)) {
    return {
      next: 'recommendation',
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  // Handle handoff
  if (/vendedor|humano|fechar|aprovar/i.test(lower)) {
    return {
      next: 'negotiation',
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  // Default - ask for financing details
  return {
    messages: [
      new AIMessage(
        `Vamos simular o financiamento! 💰\n\n` +
        `Me conta:\n` +
        `• Quanto você tem de entrada?\n` +
        `• Em quantas vezes quer parcelar? (36, 48 ou 60x)\n\n` +
        `_Exemplo: "20 mil de entrada em 48x"_`
      ),
    ],
    metadata: {
      ...state.metadata,
      lastMessageAt: Date.now(),
    },
  };
}
