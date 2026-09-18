import { Test } from '@nestjs/testing';
import { CatalogProvider } from '../catalog/catalog.types';
import { LlmRouterService } from '../ai/llm/llm-router.service';
import { DecisionBriefing } from './decision-briefing';
import { DECISION_POLICY } from './decision-policy';

describe('Decision briefing modes', () => {
  const brands = [{ code: '59', name: 'VW - VolksWagen' }];
  const catalog = { brands: jest.fn() };
  const llm = { isAvailable: jest.fn(), chat: jest.fn() };
  const policy = {
    llmEnabled: false,
    timeoutMs: 2500,
    maxTokens: 400,
    dailyLimit: 1,
  };
  let briefing: DecisionBriefing;

  beforeEach(async () => {
    jest.resetAllMocks();
    policy.llmEnabled = false;
    catalog.brands.mockResolvedValue({ items: brands });
    llm.isAvailable.mockReturnValue(true);
    const module = await Test.createTestingModule({
      providers: [
        DecisionBriefing,
        { provide: CatalogProvider, useValue: catalog },
        { provide: LlmRouterService, useValue: llm },
        { provide: DECISION_POLICY, useValue: policy },
      ],
    }).compile();
    briefing = module.get(DecisionBriefing);
  });

  it('never calls a paid model when disabled and preserves explicit constraint edits', async () => {
    const result = await briefing.create({
      naturalLanguage: 'Volkswagen SUV até 90 mil',
      constraints: { budgetMax: 75000 },
    });
    expect(result).toMatchObject({
      interpretation: 'rules',
      interpretationReason: 'llm_disabled',
      profile: { budgetMax: 75000 },
      suggestedBrands: brands,
    });
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('accepts bounded LLM interpretation but only known brand ids and grounded model terms', async () => {
    policy.llmEnabled = true;
    llm.chat.mockResolvedValue({
      content: JSON.stringify({
        profile: { budgetMax: 80000, transmission: 'automatico' },
        brandCodes: ['invented', '59'],
        modelSearchTerms: ['Polo', 'carro inventado'],
      }),
    });
    const result = await briefing.create({
      naturalLanguage: 'Quero Polo até 90 mil',
      constraints: { budgetMax: 75000 },
    });
    expect(result).toMatchObject({
      interpretation: 'llm',
      profile: { budgetMax: 75000 },
      suggestedBrands: brands,
      modelSearchTerms: ['Polo'],
    });
    expect(llm.chat).toHaveBeenCalledWith(expect.any(Array), {
      temperature: 0,
      maxTokens: 400,
      timeoutMs: 2500,
      jsonMode: true,
    });
  });

  it('fails closed to rules if a model invents sensitive profile fields', async () => {
    policy.llmEnabled = true;
    llm.chat.mockResolvedValue({
      content: JSON.stringify({
        profile: { income: 9000 },
        brandCodes: [],
        modelSearchTerms: [],
      }),
    });
    const result = await briefing.create({ naturalLanguage: 'Quero um hatch' });
    expect(result.interpretation).toBe('rules');
    expect(result.profile).not.toHaveProperty('income');
  });

  it('discards fabricated filters and brands the customer explicitly rejected', async () => {
    policy.llmEnabled = true;
    llm.chat.mockResolvedValue({
      content: JSON.stringify({
        profile: {
          budgetMax: 999999,
          make: 'Ferrari',
          model: 'inventado',
          transmission: 'manual',
          minYear: 2026,
          priorities: ['luxo'],
        },
        brandCodes: ['59'],
        modelSearchTerms: ['Volkswagen', 'inventado'],
      }),
    });
    const result = await briefing.create({
      naturalLanguage: 'Quero um carro. Não quero Volkswagen.',
    });
    expect(result.profile).toEqual({ priorities: [] });
    expect(result.suggestedBrands).toEqual([]);
    expect(result.modelSearchTerms).toEqual([]);
    expect(result.summary).toContain('orçamento a definir');
  });

  it('degrades transparently after provider failure or daily budget exhaustion', async () => {
    policy.llmEnabled = true;
    llm.chat.mockRejectedValue(new Error('upstream unavailable'));
    expect(
      (await briefing.create({ naturalLanguage: 'Quero um carro' }))
        .interpretationReason,
    ).toBe('provider_failure');
    expect(
      (await briefing.create({ naturalLanguage: 'Quero um carro' }))
        .interpretationReason,
    ).toBe('daily_limit');
    expect(llm.chat).toHaveBeenCalledTimes(1);
  });

  it('keeps the briefing useful when the catalog is offline', async () => {
    catalog.brands.mockRejectedValue(new Error('provider offline'));
    const result = await briefing.create({
      naturalLanguage: 'Quero um hatch manual',
    });
    expect(result).toMatchObject({
      catalogAvailable: false,
      suggestedBrands: [],
      profile: { bodyType: 'hatch', transmission: 'manual' },
    });
  });
});
