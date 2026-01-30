import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import Groq from 'groq-sdk';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
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

@Injectable()
export class LlmRouterService {
  private readonly logger = new Logger(LlmRouterService.name);
  private openai: OpenAI | null = null;
  private groq: Groq | null = null;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  private readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private readonly CIRCUIT_BREAKER_TIMEOUT_MS = 60000; // 1 minute

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      this.circuitBreakers.set('openai', {
        failures: 0,
        lastFailure: null,
        isOpen: false,
      });
      this.logger.log('OpenAI provider initialized');
    }

    if (process.env.GROQ_API_KEY) {
      this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
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
    if (this.openai && !this.isCircuitOpen('openai')) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature,
          max_tokens: maxTokens,
        });

        this.recordSuccess('openai');

        return {
          content: response.choices[0]?.message?.content || '',
          provider: 'openai',
          usage: {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
          },
        };
      } catch (error) {
        this.logger.warn(`OpenAI failed: ${error.message}`);
        this.recordFailure('openai');
      }
    }

    // Fallback to Groq
    if (this.groq && !this.isCircuitOpen('groq')) {
      try {
        const response = await this.groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages,
          temperature,
          max_tokens: maxTokens,
        });

        this.recordSuccess('groq');

        return {
          content: response.choices[0]?.message?.content || '',
          provider: 'groq',
          usage: {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
          },
        };
      } catch (error) {
        this.logger.warn(`Groq failed: ${error.message}`);
        this.recordFailure('groq');
      }
    }

    // Mock fallback for development
    this.logger.warn('All providers failed, using mock response');
    return {
      content:
        'Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes.',
      provider: 'mock',
    };
  }

  isAvailable(): boolean {
    return (
      (this.openai !== null && !this.isCircuitOpen('openai')) ||
      (this.groq !== null && !this.isCircuitOpen('groq'))
    );
  }
}
