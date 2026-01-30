import { AIMessage } from '@langchain/core/messages';
import { IGraphState, CustomerProfile } from '../types/graph-state.types';
import { Logger } from '@nestjs/common';

const logger = new Logger('DiscoveryNode');

/**
 * Detect if user is correcting their name
 * Returns the corrected name or null if not a correction
 */
function detectNameCorrection(
  message: string,
  currentName?: string,
): string | null {
  // Patterns for name correction
  const correctionPatterns = [
    // "é Rafael na verdade", "na verdade é Rafael"
    /(?:é|e)\s+([A-ZÀ-Ú][a-zà-ú]+)\s+(?:na verdade|na real)/i,
    /(?:na verdade|na real)\s+(?:é|e|sou)\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
    // "meu nome é Rafael", "me chamo Rafael"
    /(?:meu nome [eé]|me chamo)\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
    // "Rafael, não Rafaek", "é Rafael e não Rafaek"
    /([A-ZÀ-Ú][a-zà-ú]+),?\s+(?:não|e não|nao)\s+[A-ZÀ-Ú][a-zà-ú]+/i,
    // "pode me chamar de Rafael", "me chama de Rafael"
    /(?:pode me chamar de|me chama de|chama de)\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
    // "sou Rafael" or "sou o Rafael"
    /^sou\s+(?:o\s+)?([A-ZÀ-Ú][a-zà-ú]+)$/i,
    // "errei, é Rafael" or "errado, é Rafael"
    /(?:errei|errado|erro),?\s+(?:é|e|sou)\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
    // "desculpa, Rafael" or "desculpe, é Rafael"
    /(?:desculpa|desculpe),?\s+(?:é\s+)?([A-ZÀ-Ú][a-zà-ú]+)/i,
    // "corrigindo: Rafael" or "correção: Rafael"
    /(?:corrigindo|correção|correcao):?\s+([A-ZÀ-Ú][a-zà-ú]+)/i,
  ];

  for (const pattern of correctionPatterns) {
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
        'sim',
        'nao',
        'não',
      ];
      if (!nonNames.includes(name.toLowerCase()) && name.length > 1) {
        logger.log(`Name correction detected: "${currentName}" -> "${name}"`);
        return name;
      }
    }
  }

  // Check if it's just a single capitalized word that looks like a name
  // and is different from current name (possible typo correction)
  if (currentName) {
    const singleNameMatch = message.match(/^([A-ZÀ-Ú][a-zà-ú]+)$/);
    if (singleNameMatch) {
      const possibleName = singleNameMatch[1];
      const currentLower = currentName.toLowerCase();
      const possibleLower = possibleName.toLowerCase();

      // Check if it's similar but different (typo correction)
      // e.g., "Rafaek" -> "Rafael"
      if (
        possibleLower !== currentLower &&
        isSimilarName(currentLower, possibleLower)
      ) {
        logger.log(
          `Possible typo correction detected: "${currentName}" -> "${possibleName}"`,
        );
        return possibleName;
      }
    }
  }

  return null;
}

/**
 * Check if two names are similar (possible typo)
 * Uses simple Levenshtein-like comparison
 */
function isSimilarName(name1: string, name2: string): boolean {
  if (Math.abs(name1.length - name2.length) > 2) return false;

  let differences = 0;
  const maxLen = Math.max(name1.length, name2.length);

  for (let i = 0; i < maxLen; i++) {
    if (name1[i] !== name2[i]) differences++;
  }

  // Allow up to 2 character differences for similar names
  return differences <= 2 && differences > 0;
}

/**
 * Extract preferences from user message using LLM-like pattern matching
 */
function extractPreferences(
  message: string,
  _currentProfile: Partial<CustomerProfile>,
): Partial<CustomerProfile> {
  const profile: Partial<CustomerProfile> = {};
  const lower = message.toLowerCase();

  // Budget extraction
  const budgetPatterns = [
    /(\d{2,3})[\s.]?(?:mil|k)/i,
    /r\$?\s*(\d{2,3})\.?(\d{3})?/i,
    /até\s*(\d{2,3})[\s.]?(?:mil)?/i,
    /orçamento.*?(\d{2,3})[\s.]?(?:mil)?/i,
  ];

  for (const pattern of budgetPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const value = parseInt(match[1]);
      profile.budget = value < 1000 ? value * 1000 : value;
      break;
    }
  }

  // Body type
  if (/suv/i.test(lower)) profile.bodyType = 'suv';
  else if (/sedan/i.test(lower)) profile.bodyType = 'sedan';
  else if (/hatch/i.test(lower)) profile.bodyType = 'hatch';
  else if (/pickup|picape/i.test(lower)) profile.bodyType = 'pickup';
  else if (/minivan|van/i.test(lower)) profile.bodyType = 'minivan';

  // Usage
  if (/uber|99|app|aplicativo|motorista/i.test(lower)) {
    profile.usage = 'app';
  } else if (/família|filhos|crianças|passeio/i.test(lower)) {
    profile.usage = 'viagem';
  } else if (/trabalho|serviço|empresa/i.test(lower)) {
    profile.usage = 'trabalho';
  } else if (/cidade|urbano|dia.?a.?dia/i.test(lower)) {
    profile.usage = 'cidade';
  } else if (/viagem|estrada|rodovia/i.test(lower)) {
    profile.usage = 'viagem';
  }

  // People/Family size
  const peopleMatch = lower.match(/(\d+)\s*(?:pessoas?|passageiros?|lugares?)/);
  if (peopleMatch) {
    profile.people = parseInt(peopleMatch[1]);
  }
  if (/família grande|muitos filhos/i.test(lower)) {
    profile.people = 5;
    profile.minSeats = 7;
  }

  // Year
  const yearMatch = lower.match(/(?:a partir de|mínimo|desde)\s*(20[12]\d)/);
  if (yearMatch) {
    profile.minYear = parseInt(yearMatch[0].match(/20[12]\d/)![0]);
  } else {
    const simpleYear = lower.match(/20[12]\d/);
    if (simpleYear) {
      profile.minYear = parseInt(simpleYear[0]);
    }
  }

  // Mileage
  const kmMatch = lower.match(
    /(?:até|máximo|menos de)\s*(\d{2,3})[\s.]?(?:mil)?\s*km/i,
  );
  if (kmMatch) {
    profile.maxKm = parseInt(kmMatch[1]) * 1000;
  }

  // Transmission
  if (/automático|automatico|câmbio automático/i.test(lower)) {
    profile.transmission = 'automatico';
  } else if (/manual|câmbio manual/i.test(lower)) {
    profile.transmission = 'manual';
  }

  // Fuel
  if (/flex/i.test(lower)) profile.fuelType = 'flex';
  else if (/diesel/i.test(lower)) profile.fuelType = 'diesel';
  else if (/híbrido|hibrido/i.test(lower)) profile.fuelType = 'hibrido';
  else if (/elétrico|eletrico/i.test(lower)) profile.fuelType = 'eletrico';

  // Brand
  const brands = [
    'toyota',
    'honda',
    'volkswagen',
    'vw',
    'fiat',
    'chevrolet',
    'gm',
    'ford',
    'hyundai',
    'jeep',
    'nissan',
    'renault',
    'peugeot',
    'citroen',
    'mitsubishi',
    'kia',
    'bmw',
    'mercedes',
    'audi',
  ];
  for (const brand of brands) {
    if (lower.includes(brand)) {
      profile.brand =
        brand === 'vw' ? 'volkswagen' : brand === 'gm' ? 'chevrolet' : brand;
      break;
    }
  }

  // Trade-in detection
  if (
    /tenho.*(?:pra|para)?\s*(?:dar na)?\s*troca|meu carro.*troca|trocar meu/i.test(
      lower,
    )
  ) {
    profile.hasTradeIn = true;
  }

  // Financing detection
  if (/financ|parcel|entrada|prestação/i.test(lower)) {
    profile.wantsFinancing = true;
  }

  // Priorities
  const priorities: string[] = [];
  if (/econômic|econom|consumo baixo|gasta pouco/i.test(lower))
    priorities.push('economico');
  if (/confort|espaço|espaçoso/i.test(lower)) priorities.push('conforto');
  if (/segur|airbag|freio abs/i.test(lower)) priorities.push('seguranca');
  if (/potent|forte|motor bom/i.test(lower)) priorities.push('potencia');
  if (priorities.length > 0) profile.priorities = priorities;

  return profile;
}

/**
 * Check if we have enough info to make recommendations
 */
function canRecommend(profile: Partial<CustomerProfile>): boolean {
  // Need at least budget OR (bodyType + usage)
  const hasBudget = !!profile.budget;
  const hasPreferences = !!(profile.bodyType || profile.usage || profile.brand);
  return hasBudget || hasPreferences;
}

/**
 * Generate clarifying question based on missing info
 */
function generateClarifyingQuestion(profile: Partial<CustomerProfile>): string {
  const name = profile.customerName ? profile.customerName.split(' ')[0] : '';
  const greeting = name ? `${name}, ` : '';

  if (!profile.budget && !profile.bodyType && !profile.usage) {
    return (
      `${greeting}pra te ajudar melhor, me conta:\n\n` +
      `• Qual tipo de carro você procura? (SUV, sedan, hatch...)\n` +
      `• Pra que vai usar? (família, trabalho, app...)\n` +
      `• Tem um orçamento em mente?`
    );
  }

  if (!profile.budget) {
    return `${greeting}qual é o seu orçamento? Pode ser um valor aproximado, tipo "até 80 mil" 💰`;
  }

  if (!profile.bodyType && !profile.usage) {
    return (
      `${greeting}e qual tipo de carro você prefere?\n\n` +
      `• SUV (mais espaço e altura)\n` +
      `• Sedan (conforto e porta-malas)\n` +
      `• Hatch (compacto e econômico)\n` +
      `• Pickup (trabalho e aventura)`
    );
  }

  // We have enough, but let's confirm
  return `Entendi! Deixa eu buscar as melhores opções pra você... 🔍`;
}

/**
 * Discovery Node - Extracts preferences and guides conversation
 */
export function discoveryNode(state: IGraphState): Partial<IGraphState> {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage || typeof lastMessage.content !== 'string') {
    return {};
  }

  const message = lastMessage.content;
  const lower = message.toLowerCase();
  logger.log(`Processing discovery: "${message.substring(0, 50)}..."`);

  // Check for name correction FIRST
  const correctedName = detectNameCorrection(
    message,
    state.profile.customerName,
  );
  if (correctedName) {
    const firstName = correctedName.split(' ')[0];
    const updatedProfile = {
      ...state.profile,
      customerName: correctedName,
    };

    // Generate appropriate follow-up based on what info we already have
    let followUp = '';
    if (!state.profile.budget) {
      followUp = `Qual seria sua faixa de orçamento para o carro? 🚗💰`;
    } else if (!state.profile.usage && !state.profile.bodyType) {
      followUp = `E qual o principal uso que você pretende dar para o carro? 🚗`;
    } else if (canRecommend(updatedProfile)) {
      // We have enough info, go to search
      return {
        next: 'search',
        profile: updatedProfile,
        metadata: {
          ...state.metadata,
          lastMessageAt: Date.now(),
        },
        messages: [
          new AIMessage(
            `Desculpa pelo erro, ${firstName}! 😅 Deixa eu buscar as melhores opções pra você...`,
          ),
        ],
      };
    } else {
      followUp = `Como posso te ajudar a encontrar o carro ideal? 🚗`;
    }

    return {
      next: 'discovery',
      profile: updatedProfile,
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
      messages: [
        new AIMessage(`Desculpa pelo erro, ${firstName}! 😅\n\n${followUp}`),
      ],
    };
  }

  // Check for handoff request
  if (/vendedor|humano|atendente|pessoa real/i.test(lower)) {
    logger.log('Handoff requested');
    return {
      next: 'handoff',
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
        flags: [...state.metadata.flags, 'handoff_requested'],
      },
      messages: [
        new AIMessage(
          `Claro! Vou te transferir para um de nossos consultores. 👨‍💼\n\n` +
            `Ele vai entrar em contato em breve pelo WhatsApp.\n\n` +
            `_Obrigado por usar o CarInsight!_ 🚗`,
        ),
      ],
    };
  }

  // Check for exit
  if (/^(sair|tchau|bye|encerrar|finalizar)$/i.test(lower.trim())) {
    return {
      next: 'end',
      messages: [
        new AIMessage(
          `Até mais! Foi um prazer ajudar. 👋\n\n` +
            `Quando precisar de um carro, é só voltar aqui! 🚗`,
        ),
      ],
    };
  }

  // Extract preferences from message
  const extractedPrefs = extractPreferences(message, state.profile);
  const updatedProfile = { ...state.profile, ...extractedPrefs };

  // Check for financing intent
  if (/financ|parcel|entrada|prestação/i.test(lower)) {
    return {
      next: 'financing',
      profile: updatedProfile,
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  // Check for trade-in intent
  if (/tenho.*troca|meu carro|dar na troca/i.test(lower)) {
    return {
      next: 'trade_in',
      profile: updatedProfile,
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  // Check if we can recommend
  if (canRecommend(updatedProfile)) {
    logger.log('Enough info to recommend, moving to search');
    return {
      next: 'search',
      profile: updatedProfile,
      metadata: {
        ...state.metadata,
        lastMessageAt: Date.now(),
      },
    };
  }

  // Need more info - ask clarifying question
  const question = generateClarifyingQuestion(updatedProfile);

  return {
    next: 'discovery',
    profile: updatedProfile,
    metadata: {
      ...state.metadata,
      lastMessageAt: Date.now(),
      loopCount: state.metadata.loopCount + 1,
    },
    messages: [new AIMessage(question)],
  };
}
