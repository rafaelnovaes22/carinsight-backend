import { AnalyticsService } from '../analytics.service';
import { AnalyticsAuthGuard, BotIngestGuard } from '../analytics-auth.guard';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';

type Mocked = jest.Mock;

function makeSession(state: Record<string, unknown>) {
  return { threadId: 't', state, updatedAt: new Date() };
}

describe('AnalyticsService', () => {
  let prisma: {
    chatSession: { findMany: Mocked };
    lead: { count: Mocked };
    botMessage: { findMany: Mocked; create: Mocked };
    vehicle: { findMany: Mocked };
  };
  let llm: { isAvailable: Mocked; chat: Mocked };
  let service: AnalyticsService;

  beforeEach(() => {
    prisma = {
      chatSession: { findMany: jest.fn().mockResolvedValue([]) },
      lead: { count: jest.fn().mockResolvedValue(0) },
      botMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      vehicle: { findMany: jest.fn().mockResolvedValue([]) },
    };
    llm = { isAvailable: jest.fn().mockReturnValue(false), chat: jest.fn() };
    service = new AnalyticsService(prisma as never, llm as never);
  });

  it('agrega KPIs e funil das sessões do site', async () => {
    prisma.chatSession.findMany.mockResolvedValue([
      makeSession({
        next: 'recommendation',
        messages: [
          { type: 'human', content: 'quero um suv' },
          { type: 'ai', content: 'claro' },
        ],
        profile: {
          bodyType: 'suv',
          brand: 'Toyota',
          budget: 80000,
          _lastShownVehicles: [{ brand: 'Toyota', model: 'Corolla' }],
        },
        metadata: { flags: ['purchase_intent'] },
      }),
      makeSession({
        next: 'search',
        messages: [{ type: 'human', content: 'tem pickup?' }],
        profile: { bodyType: 'pickup' },
        metadata: { flags: ['no_results', 'handoff_requested'] },
      }),
    ]);
    prisma.lead.count.mockResolvedValue(1);

    const report = await service.getReport(7);

    expect(report.site.sessoes).toBe(2);
    expect(report.site.sessoesEngajadas).toBe(2);
    expect(report.site.leads).toBe(1);
    expect(report.site.interesseCompra).toBe(1);
    expect(report.site.semEstoque).toBe(1);
    expect(report.site.pedidosVendedor).toBe(1);
    expect(report.site.orcamentoMedio).toBe(80000);
    expect(report.site.estagiosFinais).toEqual(
      expect.arrayContaining([{ nome: 'search', vezes: 1 }]),
    );
    expect(report.site.carrosMaisApresentados[0]).toEqual({
      nome: 'toyota corolla',
      vezes: 1,
    });
    expect(report.site.perguntas).toEqual(['quero um suv', 'tem pickup?']);
    const suv = report.demandaVsEstoque.find((d) => d.tipo === 'suv');
    expect(suv?.buscados).toBe(1);
  });

  it('limita o período a 90 dias e usa 7 como padrão', async () => {
    await service.getReport(0);
    const first = prisma.chatSession.findMany.mock.calls[0][0].where.updatedAt
      .gte as Date;
    expect(Date.now() - first.getTime()).toBeGreaterThan(6.9 * 86_400_000);
    expect(Date.now() - first.getTime()).toBeLessThan(7.1 * 86_400_000);

    const report = await service.getReport(500);
    expect(report.periodo.dias).toBe(90);
  });

  it('conta carros do estoque citados no bot', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { make: 'Fiat', model: 'Argo 1.0', bodyType: 'hatch' },
    ]);
    prisma.botMessage.findMany.mockResolvedValue([
      {
        chatId: '1',
        userText: 'quanto custa o argo?',
        botText: 'O Argo está R$ 60 mil',
      },
      { chatId: '1', userText: 'e outro argo?', botText: null },
    ]);

    const report = await service.getReport(7);

    expect(report.bot.conversas).toBe(1);
    expect(report.bot.carrosCitados).toEqual([
      { nome: 'fiat argo 1.0', vezes: 3 },
    ]);
  });

  it('gera texto com template quando o LLM está indisponível', async () => {
    prisma.chatSession.findMany.mockResolvedValue([
      makeSession({
        next: 'financing',
        messages: [],
        profile: {},
        metadata: {},
      }),
    ]);

    const text = await service.getReportText(7);

    expect(llm.chat).not.toHaveBeenCalled();
    expect(text).toContain('Relatório CarInsight');
    expect(text).toContain('financing: 1');
  });

  it('usa o LLM quando disponível', async () => {
    llm.isAvailable.mockReturnValue(true);
    llm.chat.mockResolvedValue({ content: '  Resumo da semana.  ' });

    const text = await service.getReportText(7);

    expect(llm.chat).toHaveBeenCalledTimes(1);
    expect(text).toBe('Resumo da semana.');
  });

  it('cai para o template se o LLM falhar', async () => {
    llm.isAvailable.mockReturnValue(true);
    llm.chat.mockRejectedValue(new Error('timeout'));

    const text = await service.getReportText(7);

    expect(text).toContain('Relatório CarInsight');
  });

  it('devolve mensagem amigável se a agregação falhar', async () => {
    prisma.chatSession.findMany.mockRejectedValue(new Error('db down'));

    const text = await service.getReportText(7);

    expect(text).toContain('Não consegui levantar os dados');
  });

  it('persiste mensagem do bot truncando textos longos', async () => {
    prisma.botMessage.create.mockResolvedValue({ id: 'abc' });

    const result = await service.ingestMessage({
      platform: 'Telegram',
      chatId: '123',
      userText: 'x'.repeat(5000),
    });

    expect(result).toEqual({ id: 'abc' });
    const data = prisma.botMessage.create.mock.calls[0][0].data;
    expect(data.platform).toBe('telegram');
    expect(data.userText).toHaveLength(2000);
  });
});

describe('Analytics guards', () => {
  const ctx = (headers: Record<string, string>, user?: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers, user }) }),
    }) as unknown as ExecutionContext;

  const ORIGINAL = process.env.ANALYTICS_API_KEY;
  beforeEach(() => {
    process.env.ANALYTICS_API_KEY = 'segredo-de-teste';
  });
  afterAll(() => {
    process.env.ANALYTICS_API_KEY = ORIGINAL;
  });

  it('BotIngestGuard aceita apenas a chave correta', () => {
    const guard = new BotIngestGuard();
    expect(guard.canActivate(ctx({ 'x-api-key': 'segredo-de-teste' }))).toBe(
      true,
    );
    expect(() => guard.canActivate(ctx({ 'x-api-key': 'errada' }))).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException);
  });

  it('BotIngestGuard recusa tudo quando a env não está definida', () => {
    delete process.env.ANALYTICS_API_KEY;
    const guard = new BotIngestGuard();
    expect(() => guard.canActivate(ctx({ 'x-api-key': '' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('AnalyticsAuthGuard com chave válida define usuário ADMIN de bot sem consultar JWT', () => {
    const guard = new AnalyticsAuthGuard();
    const request: {
      headers: Record<string, string>;
      user?: { role: string };
    } = {
      headers: { 'x-api-key': 'segredo-de-teste' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user?.role).toBe('ADMIN');
  });
});
