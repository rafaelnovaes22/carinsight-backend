import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import {
  GraphNode,
  CustomerProfile,
  VehicleRecommendation,
  HandoffPayload,
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
  sessionId: Annotation<string>({
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
  handoff: Annotation<HandoffPayload | undefined>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => undefined,
  }),
});

type GraphStateType = typeof GraphState.State;

type NodeFn = (
  state: GraphStateType,
) => Partial<GraphStateType> | Promise<Partial<GraphStateType>>;

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
    case 'discovery':
    case 'search':
    case 'recommendation':
    case 'financing':
    case 'trade_in':
    case 'negotiation':
    case 'lead_handoff':
      return nextNode;
    case 'handoff':
      // Human handoff now flows through the lead_handoff node
      return 'lead_handoff';
    case 'end':
      return END;
    default:
      logger.warn(
        `Unknown next state: ${String(nextNode)}, defaulting to greeting`,
      );
      return 'greeting';
  }
}

export interface ConversationGraphOptions {
  /** Search node integrated with VectorSearchService (required in production) */
  searchNode: NodeFn;
  /** Lead handoff node integrated with LeadService (required in production) */
  leadHandoffNode: NodeFn;
  /** Optional LLM-powered node overrides (fall back to rule-based nodes) */
  greetingNode?: NodeFn;
  discoveryNode?: NodeFn;
  recommendationNode?: NodeFn;
  financingNode?: NodeFn;
  tradeInNode?: NodeFn;
  negotiationNode?: NodeFn;
  checkpointer?: any;
}

/**
 * Create the conversation graph with injected nodes
 */
export function createConversationGraph(options: ConversationGraphOptions) {
  // Use any to bypass strict typing issues with LangGraph
  const workflow = new StateGraph(GraphState) as any;

  workflow.addNode('greeting', options.greetingNode || greetingNode);
  workflow.addNode('discovery', options.discoveryNode || discoveryNode);
  workflow.addNode('search', options.searchNode);
  workflow.addNode(
    'recommendation',
    options.recommendationNode || recommendationNode,
  );
  workflow.addNode('financing', options.financingNode || financingNode);
  workflow.addNode('trade_in', options.tradeInNode || tradeInNode);
  workflow.addNode('negotiation', options.negotiationNode || negotiationNode);
  workflow.addNode('lead_handoff', options.leadHandoffNode);

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
    lead_handoff: 'lead_handoff',
    [END]: END,
  };

  workflow.addConditionalEdges('greeting', routeNode, routeMap);
  workflow.addConditionalEdges('discovery', routeNode, routeMap);
  workflow.addConditionalEdges('search', routeNode, routeMap);
  workflow.addConditionalEdges('recommendation', routeNode, routeMap);
  workflow.addConditionalEdges('financing', routeNode, routeMap);
  workflow.addConditionalEdges('trade_in', routeNode, routeMap);
  workflow.addConditionalEdges('negotiation', routeNode, routeMap);
  workflow.addConditionalEdges('lead_handoff', routeNode, routeMap);

  // Compile with optional checkpointer
  return workflow.compile({
    checkpointer: options.checkpointer,
  });
}

export type { GraphStateType, NodeFn };
