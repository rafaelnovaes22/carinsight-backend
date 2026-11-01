import { Test, TestingModule } from '@nestjs/testing';
import { PreferenceExtractorService } from '../preference-extractor.service';
import { LlmRouterService, LlmUnavailableError } from '../llm-router.service';

describe('PreferenceExtractorService', () => {
  let service: PreferenceExtractorService;
  let llmRouter: { chat: jest.Mock };

  beforeEach(async () => {
    llmRouter = { chat: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferenceExtractorService,
        { provide: LlmRouterService, useValue: llmRouter },
      ],
    }).compile();

    service = module.get(PreferenceExtractorService);
  });

  it('parses a valid extraction result', async () => {
    llmRouter.chat.mockResolvedValue({
      content: JSON.stringify({
        extracted: { bodyType: 'suv', budget: 90000 },
        confidence: 0.95,
        fieldsExtracted: ['bodyType', 'budget'],
      }),
      provider: 'openai',
    });

    const result = await service.extract('Quero um SUV até 90 mil');
    expect(result.extracted.bodyType).toBe('suv');
    expect(result.extracted.budget).toBe(90000);
    expect(result.confidence).toBe(0.95);
  });

  it('strips markdown fences from the LLM response', async () => {
    llmRouter.chat.mockResolvedValue({
      content:
        '```json\n{"extracted": {"brand": "toyota"}, "confidence": 0.9, "fieldsExtracted": ["brand"]}\n```',
      provider: 'openai',
    });

    const result = await service.extract('Prefiro Toyota');
    expect(result.extracted.brand).toBe('toyota');
  });

  it('returns empty extraction on malformed JSON', async () => {
    llmRouter.chat.mockResolvedValue({
      content: 'não consegui entender',
      provider: 'groq',
    });

    const result = await service.extract('mensagem qualquer');
    expect(result.extracted).toEqual({});
    expect(result.confidence).toBe(0);
  });

  it('propagates LlmUnavailableError for caller fallback', async () => {
    llmRouter.chat.mockRejectedValue(new LlmUnavailableError('down'));

    await expect(service.extract('Quero um sedan')).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
  });

  it('sends current profile and history as context', async () => {
    llmRouter.chat.mockResolvedValue({
      content: '{"extracted": {}, "confidence": 0.5, "fieldsExtracted": []}',
      provider: 'openai',
    });

    await service.extract('e com entrada de 15 mil?', {
      currentProfile: { budget: 80000 },
      conversationHistory: ['assistente: quer financiar?'],
    });

    const systemMessage = llmRouter.chat.mock.calls[0][0][0].content;
    expect(systemMessage).toContain('PERFIL ATUAL DO CLIENTE');
    expect(systemMessage).toContain('80000');
    expect(systemMessage).toContain('quer financiar?');
  });
});
