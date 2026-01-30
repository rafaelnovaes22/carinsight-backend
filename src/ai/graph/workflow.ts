import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import {
  GraphNode,
  CustomerProfile,
  VehicleRecommendation,
  QuizState,
  GraphMetadata,
} from './types/graph-state.types';
import {
  greetingNode,
  discoveryNode,
  recommendationNode,
  financingNode,
  tradeInNode,
  negotiationNode,
} from './nodes';
import { Logger } from '@nestjs/common';

const logger = new Logger('ConversationWorkflow');

/**
 * Define the graph state using Annotation API
 */
const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  phoneNumber: Annotation<string>({
    reducer: (_x, y) => y,
    default: () => '',
  }),
  userId: Annotation<string | undefined>({
    reducer: (_x, y) => y,
    default: () => undefined,
  }),
  profile: Annotation<Partial<CustomerProfile>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  recommendations: Annotation<VehicleRecommendation[]>({
    reducer: (_x, y) => (y !== undefined ? y : _x),
    default: () => [],
  }),
  next: Annotation<GraphNode>({
    reducer: (_x, y) => y,
    default: () => 'greeting' as GraphNode,
  }),
  metadata: Annotation<GraphMetadata>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({
      startedAt: Date.now(),
      lastMessageAt: Date.now(),
      loopCount: 0,
      errorCount: 0,
      flags: [],
    }),
  }),
  quiz: Annotation<QuizState>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({
      currentQuestion: 1,
      progress: 0,
      answers: {},
      isComplete: false,
    }),
  }),
});

type GraphStateType = typeof GraphState.State;

/**
 * Route function that determines the next node based on state
 */
function routeNode(state: GraphStateType): string {
  const lastMessage = state.messages[state.messages.length - 1];

  // Check if last message is from AI (waiting for user input)
  let isAiMessage = false;
  if (lastMessage) {
    if (typeof (lastMessage as any)._getType === 'function') {
      isAiMessage = (lastMessage as any)._getType() === 'ai';
    } else {
      const msg = lastMessage as any;
      isAiMessage = msg.type === 'ai' || msg.id?.includes('AIMessage');
    }
  }

  if (isAiMessage) {
    return END;
  }

  const nextNode = state.next;
  logger.debug(`Router: next=${nextNode}`);

  switch (nextNode) {
    case 'greeting':
      return 'greeting';
    case 'discovery':
      return 'discovery';
    case 'search':
      return 'search';
    case 'recommendation':
      return 'recommendation';
    case 'financing':
      return 'financing';
    case 'trade_in':
      return 'trade_in';
    case 'negotiation':
      return 'negotiation';
    case 'end':
    case 'handoff':
      return END;
    default:
      logger.warn(
        `Unknown next state: ${String(nextNode)}, defaulting to greeting`,
      );
      return 'greeting';
  }
}

// Define all possible route destinations
const _routeDestinations = [
  'greeting',
  'discovery',
  'search',
  'recommendation',
  'financing',
  'trade_in',
  'negotiation',
  END,
] as const;

/**
 * Create the conversation graph with optional search function injection
 */
export function createConversationGraph(options?: {
  searchNode?: (state: GraphStateType) => Promise<Partial<GraphStateType>>;
  checkpointer?: any;
}) {
  // Use any to bypass strict typing issues with LangGraph
  const workflow = new StateGraph(GraphState) as any;

  // Add nodes
  workflow.addNode('greeting', greetingNode);
  workflow.addNode('discovery', discoveryNode);
  workflow.addNode('search', options?.searchNode || defaultSearchNode);
  workflow.addNode('recommendation', recommendationNode);
  workflow.addNode('financing', financingNode);
  workflow.addNode('trade_in', tradeInNode);
  workflow.addNode('negotiation', negotiationNode);

  // Set entry point - START -> greeting
  workflow.addEdge(START, 'greeting');

  // Add conditional edges for routing from each node
  const routeMap = {
    greeting: 'greeting',
    discovery: 'discovery',
    search: 'search',
    recommendation: 'recommendation',
    financing: 'financing',
    trade_in: 'trade_in',
    negotiation: 'negotiation',
    [END]: END,
  };

  workflow.addConditionalEdges('greeting', routeNode, routeMap);
  workflow.addConditionalEdges('discovery', routeNode, routeMap);
  workflow.addConditionalEdges('search', routeNode, routeMap);
  workflow.addConditionalEdges('recommendation', routeNode, routeMap);
  workflow.addConditionalEdges('financing', routeNode, routeMap);
  workflow.addConditionalEdges('trade_in', routeNode, routeMap);
  workflow.addConditionalEdges('negotiation', routeNode, routeMap);

  // Compile with optional checkpointer
  return workflow.compile({
    checkpointer: options?.checkpointer,
  });
}

/**
 * Default search node (placeholder - real implementation injected at runtime)
 */
function defaultSearchNode(state: GraphStateType): Partial<GraphStateType> {
  logger.warn('Using default search node - no results');
  return {
    next: 'recommendation',
    recommendations: [],
    metadata: {
      ...state.metadata,
      lastMessageAt: Date.now(),
    },
  };
}

export type { GraphStateType };
