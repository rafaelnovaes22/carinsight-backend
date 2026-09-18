export const DECISION_POLICY = Symbol('DECISION_POLICY');
export interface DecisionPolicy {
  llmEnabled: boolean;
  timeoutMs: number;
  maxTokens: number;
  dailyLimit: number;
}

export function decisionPolicy(): DecisionPolicy {
  const dailyLimit = Number(process.env.DECISION_LLM_DAILY_LIMIT ?? 100);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 1000)
    throw new Error(
      'DECISION_LLM_DAILY_LIMIT deve ser um inteiro entre 0 e 1000',
    );
  return {
    llmEnabled: process.env.DECISION_LLM_ENABLED === 'true',
    timeoutMs: 2500,
    maxTokens: 1024,
    dailyLimit,
  };
}
