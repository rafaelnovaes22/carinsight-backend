import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { LlmCallBudget, llmSettings } from './llm-settings';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
}

interface ChatResponse {
  content: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

interface CircuitBreaker {
  failures: number;
  lastFailure: Date | null;
  isOpen: boolean;
}

/**
 * Thrown when no LLM provider can answer; callers should degrade to
 * their rule-based behavior.
 */
export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

@Injectable()
export class LlmRouterService {
  private readonly logger = new Logger(LlmRouterService.name);
  private openai: OpenAI | null = null;
  private groq: Groq | null = null;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private readonly settings = llmSettings();
  private readonly budget = new LlmCallBudget(this.settings.dailyCallLimit);

  private readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private readonly CIRCUIT_BREAKER_TIMEOUT_MS = 60000; // 1 minute

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        maxRetries: 0,
        timeout: 5000,
      });
      this.circuitBreakers.set('openai', {
        failures: 0,
        lastFailure: null,
        isOpen: false,
      });
      this.logger.log('OpenAI provider initialized');
    }

    if (process.env.GROQ_API_KEY) {
      this.groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
        maxRetries: 0,
        timeout: 5000,
      });
      this.circuitBreakers.set('groq', {
        failures: 0,
        lastFailure: null,
        isOpen: false,
      });
      this.logger.log('Groq provider initialized');
    }
  }

  private isCircuitOpen(provider: string): boolean {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) return true;

    if (breaker.isOpen && breaker.lastFailure) {
      const timeSinceFailure = Date.now() - breaker.lastFailure.getTime();
      if (timeSinceFailure > this.CIRCUIT_BREAKER_TIMEOUT_MS) {
        breaker.isOpen = false;
        breaker.failures = 0;
        this.logger.log(`Circuit breaker reset for ${provider}`);
      }
    }

    return breaker.isOpen;
  }

  private recordFailure(provider: string): void {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) return;

    breaker.failures++;
    breaker.lastFailure = new Date();

    if (breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      breaker.isOpen = true;
      this.logger.warn(`Circuit breaker opened for ${provider}`);
    }
  }

  private recordSuccess(provider: string): void {
    const breaker = this.circuitBreakers.get(provider);
    if (!breaker) return;

    breaker.failures = 0;
    breaker.isOpen = false;
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<ChatResponse> {
    const { temperature = 0.7, maxTokens = 1024 } = options;

    // Try OpenAI first
    if (this.openai && !this.isCircuitOpen('openai') && this.budget.reserve()) {
      try {
        const response = await this.openai.chat.completions.create(
          {
            model: this.settings.openaiModel,
            messages,
            temperature,
            max_tokens: maxTokens,
            response_format: options.jsonMode
              ? { type: 'json_object' }
              : undefined,
          },
          options.timeoutMs
            ? { timeout: options.timeoutMs, maxRetries: 0 }
            : undefined,
        );
        if (response.choices[0]?.finish_reason === 'length')
          throw new LlmUnavailableError(
            'OpenAI retornou uma conclusão truncada',
          );

        this.recordSuccess('openai');

        return {
          content: response.choices[0]?.message?.content || '',
          provider: 'openai',
          usage: {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
          },
        };
      } catch {
        this.logger.warn({ event: 'llm.provider.failed', provider: 'openai' });
        this.recordFailure('openai');
      }
    }

    // Fallback to Groq
    if (this.groq && !this.isCircuitOpen('groq') && this.budget.reserve()) {
      try {
        const response = await this.groq.chat.completions.create(
          {
            model: this.settings.groqModel,
            messages,
            temperature,
            max_completion_tokens: maxTokens,
            response_format: options.jsonMode
              ? { type: 'json_object' }
              : undefined,
            ...(this.settings.groqModel.startsWith('openai/gpt-oss-')
              ? { reasoning_effort: 'low' as const, include_reasoning: false }
              : {}),
          },
          options.timeoutMs
            ? { timeout: options.timeoutMs, maxRetries: 0 }
            : undefined,
        );
        if (response.choices[0]?.finish_reason === 'length')
          throw new LlmUnavailableError('Groq retornou uma conclusão truncada');

        this.recordSuccess('groq');

        return {
          content: response.choices[0]?.message?.content || '',
          provider: 'groq',
          usage: {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
          },
        };
      } catch {
        this.logger.warn({ event: 'llm.provider.failed', provider: 'groq' });
        this.recordFailure('groq');
      }
    }

    // Mock fallback is restricted to tests; in production callers must
    // fall back to their rule-based behavior instead of a canned phrase.
    if (process.env.NODE_ENV === 'test') {
      this.logger.warn('All providers failed, using mock response (test env)');
      return {
        content:
          'Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes.',
        provider: 'mock',
      };
    }

    throw new LlmUnavailableError('No LLM provider available');
  }

  isAvailable(): boolean {
    if (!this.budget.hasRemaining()) return false;
    return (
      (this.openai !== null && !this.isCircuitOpen('openai')) ||
      (this.groq !== null && !this.isCircuitOpen('groq'))
    );
  }
}
