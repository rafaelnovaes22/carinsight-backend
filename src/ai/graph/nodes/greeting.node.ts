import { AIMessage } from '@langchain/core/messages';
import { IGraphState, CustomerProfile } from '../types/graph-state.types';
import { Logger } from '@nestjs/common';

const logger = new Logger('GreetingNode');

/**
 * Extract name from message using simple patterns
 */
function extractName(message: string): string | null {
  const patterns = [
    /(?:me chamo|meu nome [eé]|sou o?a?\s*)([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i,
    /(?:oi|olá|ola),?\s*(?:sou|me chamo)\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
    /^([A-ZÀ-Ú][a-zà-ú]+)$/,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Filter common non-name words
      const nonNames = [
        'oi',
        'ola',
        'olá',
        'bom',
        'boa',
        'dia',
        'tarde',
        'noite',
        'quero',
        'preciso',
        'um',
        'uma',
        'carro',
        'suv',
        'sedan',
      ];
      if (!nonNames.includes(name.toLowerCase()) && name.length > 1) {
        return name;
      }
    }
  }

  return null;
}

/**
 * Parse vehicle intent from message
 */
function parseVehicleIntent(message: string): Partial<CustomerProfile> {
  const profile: Partial<CustomerProfile> = {};
  const lower = message.toLowerCase();

  // Body type detection
  if (/suv/i.test(lower)) profile.bodyType = 'suv';
  else if (/sedan/i.test(lower)) profile.bodyType = 'sedan';
  else if (/hatch/i.test(lower)) profile.bodyType = 'hatch';
  else if (/pickup|picape/i.test(lower)) profile.bodyType = 'pickup';
  else if (/minivan|van/i.test(lower)) profile.bodyType = 'minivan';

  // Usage detection
  if (/uber|99|app|aplicativo/i.test(lower)) profile.usage = 'app';
  else if (/família|filhos|crianças/i.test(lower)) profile.usage = 'viagem';
  else if (/trabalho|serviço/i.test(lower)) profile.usage = 'trabalho';
  else if (/cidade|urbano/i.test(lower)) profile.usage = 'cidade';

  // Budget detection
  const budgetMatch = lower.match(/(\d{2,3})[\s.]?(?:mil|k)/);
  if (budgetMatch) {
    profile.budget = parseInt(budgetMatch[1]) * 1000;
  }

  // Year detection
  const yearMatch = lower.match(/20[12]\d/);
  if (yearMatch) {
    profile.minYear = parseInt(yearMatch[0]);
  }

  // Brand detection
  const brands = [
    'toyota',
    'honda',
    'volkswagen',
    'vw',
    'fiat',
    'chevrolet',
    'ford',
    'hyundai',
    'jeep',
    'nissan',
    'renault',
  ];
  for (const brand of brands) {
    if (lower.includes(brand)) {
      profile.brand = brand === 'vw' ? 'volkswagen' : brand;
      break;
    }
  }

  return profile;
}

/**
 * Check if message is a greeting
 */
function _isGreeting(message: string): boolean {
  return /^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|hello|hi|e aí|eai)/i.test(
    message.trim(),
  );
}

/**
 * Greeting Node - Handles initial interaction and name extraction
 */
export function greetingNode(state: IGraphState): Partial<IGraphState> {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage || typeof lastMessage.content !== 'string') {
    return {};
  }

  const message = lastMessage.content;
  logger.log(`Processing greeting: "${message.substring(0, 50)}..."`);

  // SCENARIO 0: Customer started from a specific vehicle (lead context)
  // Check if we have recommendations already (set by ConversationGraphService when vehicleId provided)
  if (
    state.recommendations.length > 0 &&
    state.recommendations[0].reasoning === 'Veículo que você selecionou'
  ) {
    const vehicle = state.recommendations[0].vehicle;
    if (vehicle) {
      const vehicleName = `${vehicle.make} ${vehicle.model} ${vehicle.yearModel}`;
      const price = vehicle.price?.toLocaleString('pt-BR') || 'Consulte';

      logger.log(`Customer started from vehicle: ${vehicleName}`);

      return {
        next: 'recommendation',
        profile: {
          ...state.profile,
          _showedRecommendation: true,
        },
        messages: [
          new AIMessage(
            `👋 Olá! Sou a assistente virtual do *CarInsight*.\n\n` +
              `🤖 *Importante:* Sou uma inteligência artificial e posso cometer erros.\n\n` +
              `Vi que você está interessado no *${vehicleName}*! Excelente escolha! 🚗\n\n` +
              `📋 *Detalhes:*\n` +
              `💰 Preço: R$ ${price}\n` +
              `🛣️ ${vehicle.mileage?.toLocaleString('pt-BR') || 'N/A'} km\n\n` +
              `Como posso te ajudar?\n` +
              `• Quer saber mais sobre este veículo?\n` +
              `• Simular financiamento?\n` +
              `• Agendar uma visita?\n` +
              `• Falar com um vendedor?\n\n` +
              `_Qual é o seu nome, por favor?_`,
          ),
        ],
      };
    }
  }

  // If we already have a name, move to discovery
  if (state.profile?.customerName) {
    logger.log('Name exists, moving to discovery');
    return { next: 'discovery' };
  }

  // Extract name and vehicle intent
  const possibleName = extractName(message);
  const vehicleIntent = parseVehicleIntent(message);
  const hasVehicleIntent = Object.keys(vehicleIntent).length > 0;

  // SCENARIO A: Name + Vehicle Intent -> Move to discovery with context
  if (possibleName && hasVehicleIntent) {
    const firstName = possibleName.split(' ')[0];
    let responseText = `👋 Olá, ${firstName}! Sou a assistente virtual do *CarInsight*.\n\n`;
    responseText += `🤖 *Importante:* Sou uma inteligência artificial e posso cometer erros.\n\n`;

    if (vehicleIntent.bodyType) {
      responseText += `Vi que você está interessado em um *${vehicleIntent.bodyType.toUpperCase()}*. `;
    }
    if (vehicleIntent.budget) {
      responseText += `Com orçamento de *R$ ${vehicleIntent.budget.toLocaleString('pt-BR')}*. `;
    }
    responseText += `\n\nVou buscar as melhores opções pra você! 🚗`;

    return {
      next: 'discovery',
      profile: {
        ...state.profile,
        customerName: possibleName,
        ...vehicleIntent,
      },
      messages: [new AIMessage(responseText)],
    };
  }

  // SCENARIO B: Only Name -> Ask about preferences
  if (possibleName) {
    const firstName = possibleName.split(' ')[0];
    return {
      next: 'discovery',
      profile: {
        ...state.profile,
        customerName: possibleName,
      },
      messages: [
        new AIMessage(
          `👋 Olá, ${firstName}! Sou a assistente virtual do *CarInsight*.\n\n` +
            `🤖 *Importante:* Sou uma inteligência artificial e posso cometer erros.\n\n` +
            `Me conta, o que você está procurando? 🚗\n\n` +
            `Pode ser:\n` +
            `• Um tipo de carro (SUV, sedan, hatch...)\n` +
            `• Para que vai usar (família, trabalho, app...)\n` +
            `• Ou um modelo específico`,
        ),
      ],
    };
  }

  // SCENARIO C: Vehicle Intent but no name -> Ask for name
  if (hasVehicleIntent) {
    let carDescription = '';
    if (vehicleIntent.bodyType)
      carDescription += vehicleIntent.bodyType.toUpperCase();
    if (vehicleIntent.brand) carDescription += ` ${vehicleIntent.brand}`;

    return {
      next: 'greeting',
      profile: {
        ...state.profile,
        ...vehicleIntent,
      },
      messages: [
        new AIMessage(
          `👋 Olá! Sou a assistente virtual do *CarInsight*.\n\n` +
            `🤖 *Importante:* Sou uma inteligência artificial e posso cometer erros.\n\n` +
            `Vi que você busca um *${carDescription.trim() || 'veículo'}*. Ótima escolha! 🚗\n\n` +
            `Qual é o seu nome?`,
        ),
      ],
    };
  }

  // SCENARIO D: Just greeting or unclear -> Ask for name
  return {
    next: 'greeting',
    messages: [
      new AIMessage(
        `👋 Olá! Sou a assistente virtual do *CarInsight*.\n\n` +
          `🤖 *Importante:* Sou uma inteligência artificial e posso cometer erros.\n\n` +
          `💡 _A qualquer momento, digite *sair* para encerrar._\n\n` +
          `Para começar, qual é o seu nome?`,
      ),
    ],
  };
}
