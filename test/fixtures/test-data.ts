import {
  VehicleCondition,
  VehicleStatus,
  UserRole,
  InteractionType,
  MediaType,
} from '@prisma/client';

/**
 * Fixtures de dados para testes
 */

export const mockUser = {
  email: 'test@example.com',
  passwordHash: '$2b$10$YourHashedPasswordHere',
  name: 'Test User',
  role: UserRole.CUSTOMER,
  preferences: {
    budget: { min: 30000, max: 60000 },
    bodyTypes: ['Sedan', 'SUV'],
    features: ['Ar Condicionado', 'Direção Hidráulica'],
  },
};

export const mockDealer = {
  name: 'Test Dealership',
  contactInfo: {
    email: 'dealer@example.com',
    phone: '+5511987654321',
    whatsapp: '+5511987654321',
    address: 'Rua Teste, 123 - São Paulo, SP',
  },
  verificationStatus: 'VERIFIED',
  rating: 4.5,
};

export const mockVehicle = {
  title: 'Toyota Corolla XEi 2022',
  make: 'Toyota',
  model: 'Corolla',
  version: 'XEi 2.0 Flex Aut.',
  yearModel: 2022,
  yearFab: 2021,
  price: 125000,
  mileage: 15000,
  condition: VehicleCondition.USED,
  bodyType: 'Sedan',
  technicalSpecs: {
    engine: '2.0L Flex',
    power: '177cv',
    transmission: 'Automático CVT',
    consumption: '12.8 km/l (cidade) / 15.3 km/l (estrada)',
    dimensions: '4630 x 1780 x 1435 mm',
    trunk: '470 litros',
    fuel: 'Gasolina/Etanol',
  },
  features: [
    'Ar Condicionado Digital Dual Zone',
    'Direção Elétrica',
    'Vidros Elétricos',
    'Travas Elétricas',
    'Retrovisores Elétricos',
    'Central Multimídia 9"',
    'Câmera de Ré',
    'Sensores de Estacionamento',
    'Controle de Cruzeiro Adaptativo',
    'Freio Automático de Emergência',
    'Airbags Frontais e Laterais',
    'ABS',
    'Controle de Estabilidade',
  ],
  inspectionReport: {
    overall: 'EXCELENTE',
    exterior: {
      paint: 'Sem arranhões ou amassados',
      lights: 'Funcionando perfeitamente',
      tires: 'Pneus com 70% de vida útil',
      glass: 'Sem trincas ou lascas',
    },
    interior: {
      upholstery: 'Sem manchas ou rasgos',
      electronics: 'Todos os sistemas funcionando',
      airConditioning: 'Funcionando perfeitamente',
      odor: 'Sem odores',
    },
    mechanical: {
      engine: 'Funcionamento perfeito',
      transmission: 'Sem problemas',
      suspension: 'Sem ruídos ou folgas',
      brakes: 'Excelente estado',
    },
    documentation: {
      ownership: 'Documentação regular',
      fines: 'Sem multas pendentes',
      recalls: 'Nenhum recall pendente',
    },
  },
  aiTags: ['Bom Negócio', 'Baixa Quilometragem', 'Família', 'Econômico'],
  status: VehicleStatus.AVAILABLE,
};

export const mockVehicleMedia = {
  url: 'https://example.com/images/corolla-2022.jpg',
  type: MediaType.IMAGE,
  order: 0,
};

export const mockInteraction = {
  type: InteractionType.SAVED,
  metadata: {
    timestamp: new Date().toISOString(),
    source: 'web',
  },
};

/**
 * Factory para criar múltiplos veículos de teste
 */
export function createMockVehicles(count: number) {
  const makes = ['Toyota', 'Honda', 'Volkswagen', 'Chevrolet', 'Ford'];
  const models = ['Corolla', 'Civic', 'Jetta', 'Cruze', 'Focus'];
  const bodyTypes = ['Sedan', 'SUV', 'Hatch', 'Pickup'];

  return Array.from({ length: count }, (_, i) => ({
    ...mockVehicle,
    title: `${makes[i % makes.length]} ${models[i % models.length]} ${2020 + (i % 4)}`,
    make: makes[i % makes.length],
    model: models[i % models.length],
    bodyType: bodyTypes[i % bodyTypes.length],
    yearModel: 2020 + (i % 4),
    price: 50000 + i * 10000,
    mileage: 10000 + i * 5000,
  }));
}

/**
 * Dados para testar validações de DTO
 */
export const invalidVehicleData = {
  missingRequired: {
    // Faltam campos obrigatórios
    make: 'Toyota',
  },
  invalidPrice: {
    ...mockVehicle,
    price: -1000, // Preço negativo
  },
  invalidMileage: {
    ...mockVehicle,
    mileage: -500, // Quilometragem negativa
  },
  invalidYear: {
    ...mockVehicle,
    yearModel: 1800, // Ano inválido
  },
};

export const invalidUserData = {
  missingEmail: {
    passwordHash: 'hash',
    name: 'Test',
  },
  invalidEmail: {
    email: 'not-an-email',
    passwordHash: 'hash',
    name: 'Test',
  },
  weakPassword: {
    email: 'test@example.com',
    passwordHash: '123', // Senha muito curta
    name: 'Test',
  },
};
