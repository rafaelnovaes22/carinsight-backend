import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { LlmRouterService, LlmUnavailableError } from '../llm-router.service';

jest.mock('openai');
jest.mock('groq-sdk');

describe('Shared inference limits and supported model configuration', () => {
  const original = { ...process.env };
  const openaiRequest = jest.fn();
  const groqRequest = jest.fn();
  const completion = {
    choices: [{ message: { content: '{}' }, finish_reason: 'stop' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'production';
    process.env.LLM_DAILY_CALL_LIMIT = '2';
    process.env.OPENAI_API_KEY = 'unit-test-openai';
    process.env.GROQ_API_KEY = 'unit-test-groq';
    delete process.env.OPENAI_MODEL;
    delete process.env.GROQ_MODEL;
    const mockedOpenai = jest.mocked(OpenAI);
    mockedOpenai.mockImplementation(
      () =>
        ({
          chat: { completions: { create: openaiRequest } },
        }) as unknown as OpenAI,
    );
    const mockedGroq = jest.mocked(Groq);
    mockedGroq.mockImplementation(
      () =>
        ({
          chat: { completions: { create: groqRequest } },
        }) as unknown as Groq,
    );
    openaiRequest.mockResolvedValue(completion);
    groqRequest.mockResolvedValue(completion);
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('counts each fallback provider attempt against one shared daily cap', async () => {
    openaiRequest.mockRejectedValue(new Error('provider failure'));
    const router = new LlmRouterService();
    await expect(
      router.chat([{ role: 'user', content: 'JSON' }]),
    ).resolves.toMatchObject({ provider: 'groq' });
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0, timeout: 5000 }),
    );
    expect(Groq).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0, timeout: 5000 }),
    );
    await expect(
      router.chat([{ role: 'user', content: 'Another route' }]),
    ).rejects.toThrow(LlmUnavailableError);
    expect(openaiRequest).toHaveBeenCalledTimes(1);
    expect(groqRequest).toHaveBeenCalledTimes(1);
    expect(router.isAvailable()).toBe(false);
  });

  it('uses a supported GPT-OSS model with separate hidden reasoning and bounded JSON output', async () => {
    delete process.env.OPENAI_API_KEY;
    const router = new LlmRouterService();
    await router.chat([{ role: 'user', content: 'Return JSON' }], {
      jsonMode: true,
      timeoutMs: 2500,
      maxTokens: 1024,
    });
    expect(groqRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-oss-20b',
        max_completion_tokens: 1024,
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
        include_reasoning: false,
      }),
      { timeout: 2500, maxRetries: 0 },
    );
    expect(groqRequest.mock.calls[0][0]).not.toHaveProperty('reasoning_format');
  });

  it('rejects truncated model output instead of presenting partial content as an answer', async () => {
    delete process.env.OPENAI_API_KEY;
    groqRequest.mockResolvedValue({
      choices: [
        { message: { content: '{"partial"' }, finish_reason: 'length' },
      ],
    });
    await expect(
      new LlmRouterService().chat([{ role: 'user', content: 'JSON' }]),
    ).rejects.toThrow(LlmUnavailableError);
  });

  it('can disable all inference routes with a zero shared limit', async () => {
    process.env.LLM_DAILY_CALL_LIMIT = '0';
    const router = new LlmRouterService();
    expect(router.isAvailable()).toBe(false);
    await expect(
      router.chat([{ role: 'user', content: 'test' }]),
    ).rejects.toThrow(LlmUnavailableError);
    expect(openaiRequest).not.toHaveBeenCalled();
    expect(groqRequest).not.toHaveBeenCalled();
  });
});
