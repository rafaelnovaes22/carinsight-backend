export interface LlmSettings {
  openaiModel: string;
  groqModel: string;
  dailyCallLimit: number;
}

export function llmSettings(): LlmSettings {
  const dailyCallLimit = Number(process.env.LLM_DAILY_CALL_LIMIT ?? 50);
  if (
    !Number.isInteger(dailyCallLimit) ||
    dailyCallLimit < 0 ||
    dailyCallLimit > 1000
  ) {
    throw new Error('LLM_DAILY_CALL_LIMIT deve ser um inteiro entre 0 e 1000');
  }
  return {
    openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    groqModel: process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b',
    dailyCallLimit,
  };
}

export class LlmCallBudget {
  private startedAt = Date.now();
  private calls = 0;
  constructor(private readonly limit: number) {}

  hasRemaining(): boolean {
    if (Date.now() - this.startedAt >= 86400000) {
      this.startedAt = Date.now();
      this.calls = 0;
    }
    return this.calls < this.limit;
  }

  reserve(): boolean {
    if (!this.hasRemaining()) return false;
    this.calls += 1;
    return true;
  }
}
