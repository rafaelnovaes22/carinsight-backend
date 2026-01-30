import { BaseMessage } from '@langchain/core/messages';

/**
 * Customer profile extracted from conversation
 */
export interface CustomerProfile {
  // Customer info
  customerName?: string;

  // Budget
  budget?: number;
  budgetMin?: number;
  budgetMax?: number;
  budgetFlexibility?: number;

  // Usage
  usage?: 'cidade' | 'viagem' | 'trabalho' | 'misto' | 'app';
  usagePattern?: string;

  // People
  people?: number;
  familySize?: number;

  // Vehicle preferences
  bodyType?: 'sedan' | 'hatch' | 'suv' | 'pickup' | 'minivan';
  vehicleType?: string;
  transmission?: 'manual' | 'automatico';
  fuelType?: 'gasolina' | 'flex' | 'diesel' | 'hibrido' | 'eletrico';

  // Constraints
  minYear?: number;
  maxKm?: number;
  minSeats?: number;

  // Specific preferences
  color?: string;
  brand?: string;
  model?: string;

  // Priorities
  priorities?: string[];
  dealBreakers?: string[];

  // Trade-in
  hasTradeIn?: boolean;
  tradeInBrand?: string;
  tradeInModel?: string;
  tradeInYear?: number;
  tradeInEstimatedValue?: number;

  // Financing
  wantsFinancing?: boolean;
  financingDownPayment?: number;
  financingMonths?: number;

  // Urgency
  urgency?: 'imediato' | '1mes' | '3meses' | 'flexivel';

  // Internal flags
  _skipOnboarding?: boolean;
  _showedRecommendation?: boolean;
  _lastShownVehicles?: Array<{
    vehicleId: string;
    brand: string;
    model: string;
    year: number;
    price: number;
  }>;
}

/**
 * Vehicle recommendation with match score
 */
export interface VehicleRecommendation {
  vehicleId: string;
  matchScore: number;
  reasoning: string;
  highlights: string[];
  concerns: string[];
  vehicle?: {
    id: string;
    make: string;
    model: string;
    yearModel: number;
    price: number;
    mileage: number;
    bodyType: string;
    features?: string[];
  };
}

/**
 * Quiz state for guided discovery
 */
export interface QuizState {
  currentQuestion: number;
  progress: number;
  answers: Record<string, unknown>;
  isComplete: boolean;
}

/**
 * Graph metadata for tracking
 */
export interface GraphMetadata {
  startedAt: number;
  lastMessageAt: number;
  loopCount: number;
  errorCount: number;
  flags: string[];
}

/**
 * Main LangGraph state interface
 */
export interface IGraphState {
  messages: BaseMessage[];
  phoneNumber: string;
  userId?: string;
  profile: Partial<CustomerProfile>;
  recommendations: VehicleRecommendation[];
  next: GraphNode;
  metadata: GraphMetadata;
  quiz: QuizState;
}

/**
 * Valid graph nodes
 */
export type GraphNode =
  | 'greeting'
  | 'discovery'
  | 'search'
  | 'recommendation'
  | 'financing'
  | 'trade_in'
  | 'negotiation'
  | 'end'
  | 'handoff';

/**
 * Create initial graph state
 */
export function createInitialState(): IGraphState {
  return {
    messages: [],
    phoneNumber: '',
    profile: {},
    recommendations: [],
    next: 'greeting',
    metadata: {
      startedAt: Date.now(),
      lastMessageAt: Date.now(),
      loopCount: 0,
      errorCount: 0,
      flags: [],
    },
    quiz: {
      currentQuestion: 1,
      progress: 0,
      answers: {},
      isComplete: false,
    },
  };
}
