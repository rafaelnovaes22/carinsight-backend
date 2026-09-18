import { Inject, Injectable } from '@nestjs/common';
import { CatalogChoice, CatalogProvider } from '../catalog/catalog.types';
import { LlmRouterService } from '../ai/llm/llm-router.service';
import {
  DecisionRequestDto,
  DecisionConstraintsDto,
} from './decision-request.dto';
import {
  briefingQuestions,
  briefingSummary,
  mentionedBrands,
  ruleProfile,
} from './briefing-rules';
import { briefingPrompt, parseBriefing, ParsedBriefing } from './briefing-llm';
import { DECISION_POLICY } from './decision-policy';
import type { DecisionPolicy } from './decision-policy';

export interface DecisionBriefReply extends ParsedBriefing {
  summary: string;
  followUpQuestions: string[];
  interpretation: 'rules' | 'llm';
  interpretationReason: string;
  limitations: string[];
  catalogAvailable: boolean;
}

@Injectable()
export class DecisionBriefing {
  private llmRequests = 0;
  private budgetStarted = Date.now();
  constructor(
    private readonly catalog: CatalogProvider,
    private readonly llm: LlmRouterService,
    @Inject(DECISION_POLICY) private readonly policy: DecisionPolicy,
  ) {}

  async create(request: DecisionRequestDto): Promise<DecisionBriefReply> {
    const brands = await this.availableBrands();
    const profile = {
      ...ruleProfile(request.naturalLanguage),
      ...request.constraints,
    };
    const base = this.baseReply(profile, request.naturalLanguage, brands);
    if (!this.policy.llmEnabled || !this.llm.isAvailable()) return base;
    if (!this.reserveInterpretation())
      return { ...base, interpretationReason: 'daily_limit' };
    try {
      const interpretation = await this.interpret(
        request.naturalLanguage,
        brands,
      );
      const merged = { ...interpretation.profile, ...profile };
      return {
        ...base,
        ...interpretation,
        profile: merged,
        summary: briefingSummary(merged),
        followUpQuestions: briefingQuestions(merged),
        interpretation: 'llm',
        interpretationReason: 'validated_llm',
      };
    } catch {
      return { ...base, interpretationReason: 'provider_failure' };
    }
  }

  private reserveInterpretation(): boolean {
    if (Date.now() - this.budgetStarted >= 86400000) {
      this.budgetStarted = Date.now();
      this.llmRequests = 0;
    }
    if (this.llmRequests >= this.policy.dailyLimit) return false;
    this.llmRequests += 1;
    return true;
  }

  private async availableBrands(): Promise<CatalogChoice[]> {
    try {
      return (await this.catalog.brands()).items;
    } catch {
      return [];
    }
  }

  private async interpret(
    message: string,
    brands: CatalogChoice[],
  ): Promise<ParsedBriefing> {
    const response = await this.llm.chat(
      [
        { role: 'system', content: briefingPrompt(brands) },
        { role: 'user', content: message },
      ],
      {
        temperature: 0,
        maxTokens: this.policy.maxTokens,
        timeoutMs: this.policy.timeoutMs,
        jsonMode: true,
      },
    );
    return parseBriefing(response.content, message, brands);
  }

  private baseReply(
    profile: DecisionConstraintsDto,
    message: string,
    brands: CatalogChoice[],
  ): DecisionBriefReply {
    const limitations = [
      'Confirme o perfil interpretado e escolha a versão e o ano antes de comparar valores.',
      'Referência de preço não comprova consumo, segurança, manutenção, estado ou disponibilidade.',
    ];
    if (!brands.length)
      limitations.push(
        'Catálogo temporariamente indisponível; suas preferências foram preservadas.',
      );
    return {
      profile,
      summary: briefingSummary(profile),
      followUpQuestions: briefingQuestions(profile),
      suggestedBrands: mentionedBrands(
        [message, profile.make].filter(Boolean).join(' '),
        brands,
      ),
      modelSearchTerms: profile.model ? [profile.model] : [],
      limitations,
      catalogAvailable: brands.length > 0,
      interpretation: 'rules',
      interpretationReason: this.policy.llmEnabled
        ? 'provider_unavailable'
        : 'llm_disabled',
    };
  }
}
