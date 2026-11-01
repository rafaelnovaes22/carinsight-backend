import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  LlmRouterService,
  LlmUnavailableError,
} from '../ai/llm/llm-router.service';

export interface Contagem {
  nome: string;
  vezes: number;
}

export interface AnalyticsReport {
  periodo: { dias: number; inicio: string; fim: string };
  site: {
    sessoes: number;
    sessoesEngajadas: number;
    mediaMensagens: number;
    leads: number;
    pedidosVendedor: number;
    interesseCompra: number;
    visitasPedidas: number;
    semEstoque: number;
    estagiosFinais: Contagem[];
    carrosMaisApresentados: Contagem[];
    marcasBuscadas: Contagem[];
    tiposBuscados: Contagem[];
    modelosBuscados: Contagem[];
    usosBuscados: Contagem[];
    orcamentoMedio: number | null;
    perguntas: string[];
  };
  bot: {
    conversas: number;
    mensagensUsuario: number;
    mediaPorConversa: number;
    carrosCitados: Contagem[];
    perguntas: string[];
  };
  demandaVsEstoque: { tipo: string; buscados: number; emEstoque: number }[];
  geradoEm: string;
}

const BODY_TYPES = ['hatch', 'sedan', 'suv', 'pickup', 'minivan'] as const;

const str = (value: unknown): string =>
  typeof value === 'string' ? value : '';

interface ParsedSession {
  mensagens: number;
  mensagensHumano: string[];
  estagioFinal: string;
  flags: string[];
  brand?: string;
  model?: string;
  bodyType?: string;
  usage?: string;
  budget?: number;
  apresentados: string[];
}

/**
 * Agregações de inteligência de negócio sobre as conversas do site
 * (ChatSession + Lead) e do bot externo (BotMessage, via /analytics/ingest).
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private prisma: PrismaService,
    private llmRouter: LlmRouterService,
  ) {}

  async getReport(days = 7): Promise<AnalyticsReport> {
    const clamped = this.clampDays(days);
    const since = new Date(Date.now() - clamped * 86_400_000);

    const [sessions, leadCount, botMessages, vehicles] = await Promise.all([
      this.prisma.chatSession.findMany({
        where: { updatedAt: { gte: since } },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      }),
      this.prisma.lead.count({ where: { createdAt: { gte: since } } }),
      this.prisma.botMessage.findMany({
        where: { occurredAt: { gte: since } },
        orderBy: { occurredAt: 'desc' },
        take: 1000,
      }),
      this.prisma.vehicle.findMany({
        where: { status: 'AVAILABLE' },
        select: { make: true, model: true, bodyType: true },
      }),
    ]);

    const parsed = sessions.map((s) =>
      this.parseSession(s.state as unknown as Record<string, unknown>),
    );

    // ---- Site ----
    const siteSessions = parsed.length;
    const engaged = parsed.filter((p) => p.mensagensHumano.length > 0).length;
    const totalMensagens = parsed.reduce((acc, p) => acc + p.mensagens, 0);
    const estagios = this.contar(parsed.map((p) => p.estagioFinal));
    const apresentados = this.contar(parsed.flatMap((p) => p.apresentados));
    const modelos = this.contar(
      parsed.map((p) => p.model).filter((v): v is string => !!v),
    );
    const marcas = this.contar(
      parsed.map((p) => p.brand).filter((v): v is string => !!v),
    );
    const tipos = this.contar(
      parsed.map((p) => p.bodyType).filter((v): v is string => !!v),
    );
    const usos = this.contar(
      parsed.map((p) => p.usage).filter((v): v is string => !!v),
    );
    const budgets = parsed
      .map((p) => p.budget)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const orcamentoMedio = budgets.length
      ? Math.round(budgets.reduce((a, b) => a + b, 0) / budgets.length)
      : null;

    const perguntasSite = parsed.flatMap((p) => p.mensagensHumano).slice(0, 40);

    // ---- Bot externo (Telegram) ----
    const chatsBot = new Map<string, number>();
    for (const m of botMessages) {
      chatsBot.set(m.chatId, (chatsBot.get(m.chatId) ?? 0) + 1);
    }
    const perguntasBot = botMessages
      .map((m) => m.userText)
      .filter((t): t is string => !!t && t.trim().length > 0)
      .slice(0, 40);

    const availableModels = vehicles.map((v) => ({
      label: `${v.make} ${v.model}`.trim().toLowerCase(),
      bodyType: (v.bodyType || '').toLowerCase(),
    }));
    const carrosCitadosBot = this.contarCarrosCitados(
      botMessages
        .flatMap((m) => [m.userText, m.botText])
        .filter((t): t is string => !!t),
      availableModels,
    );

    // ---- Demanda vs estoque ----
    const estoquePorTipo = new Map<string, number>();
    for (const v of vehicles) {
      const tipo = (v.bodyType || 'n/a').toLowerCase();
      estoquePorTipo.set(tipo, (estoquePorTipo.get(tipo) ?? 0) + 1);
    }
    const demandaVsEstoque = BODY_TYPES.map((tipo) => ({
      tipo,
      buscados: tipos.get(tipo) ?? 0,
      emEstoque: estoquePorTipo.get(tipo) ?? 0,
    }));

    return {
      periodo: {
        dias: clamped,
        inicio: since.toISOString(),
        fim: new Date().toISOString(),
      },
      site: {
        sessoes: siteSessions,
        sessoesEngajadas: engaged,
        mediaMensagens: siteSessions
          ? Math.round((totalMensagens / siteSessions) * 10) / 10
          : 0,
        leads: leadCount,
        pedidosVendedor: parsed.filter((p) =>
          p.flags.includes('handoff_requested'),
        ).length,
        interesseCompra: parsed.filter((p) =>
          p.flags.includes('purchase_intent'),
        ).length,
        visitasPedidas: parsed.filter((p) =>
          p.flags.includes('visit_requested'),
        ).length,
        semEstoque: parsed.filter((p) => p.flags.includes('no_results')).length,
        estagiosFinais: this.paraLista(estagios),
        carrosMaisApresentados: this.paraLista(apresentados).slice(0, 5),
        marcasBuscadas: this.paraLista(marcas).slice(0, 5),
        modelosBuscados: this.paraLista(modelos).slice(0, 5),
        tiposBuscados: this.paraLista(tipos).slice(0, 5),
        usosBuscados: this.paraLista(usos).slice(0, 5),
        orcamentoMedio,
        perguntas: perguntasSite,
      },
      bot: {
        conversas: chatsBot.size,
        mensagensUsuario: botMessages.filter((m) => m.userText).length,
        mediaPorConversa: chatsBot.size
          ? Math.round((botMessages.length / chatsBot.size) * 10) / 10
          : 0,
        carrosCitados: this.paraLista(carrosCitadosBot).slice(0, 5),
        perguntas: perguntasBot,
      },
      demandaVsEstoque,
      geradoEm: new Date().toISOString(),
    };
  }

  /**
   * Relatório narrativo pronto para enviar ao lojista (Telegram).
   * LLM escreve a análise; template determinístico como fallback.
   */
  async getReportText(days = 7): Promise<string> {
    const clamped = this.clampDays(days);
    let report: AnalyticsReport;
    try {
      report = await this.getReport(clamped);
    } catch (error) {
      this.logger.error(`Falha ao agregar relatório: ${String(error)}`);
      return '⚠️ Não consegui levantar os dados de conversas agora. Tenta de novo em alguns minutos.';
    }

    if (this.llmRouter.isAvailable()) {
      try {
        const result = await this.llmRouter.chat(
          [
            {
              role: 'system',
              content:
                "Você é analista de negócios de uma loja de veículos usados (Renatinhu's Cars). " +
                'Recebe métricas agregadas das conversas do assistente virtual (site + Telegram) e escreve ' +
                'um relatório curto em português do Brasil para o DONO da loja, em texto puro de mensagem ' +
                '(sem markdown pesado; emojis discretos ok). Estrutura: 1 linha de resumo; KPIs em bullets; ' +
                'carros mais procurados; onde as pessoas desistem; 2-3 recomendações acionáveis conectando ' +
                'demanda e estoque. Máximo ~220 palavras. NUNCA invente números: use apenas os fornecidos. ' +
                'Se os números forem todos zero, diga com franqueza que ainda não houve movimento no período.',
            },
            {
              role: 'user',
              content: `MÉTRICAS (JSON):\n${JSON.stringify(report)}`,
            },
          ],
          { temperature: 0.4, maxTokens: 500 },
        );
        return result.content.trim();
      } catch (error) {
        if (!(error instanceof LlmUnavailableError)) {
          this.logger.warn(`LLM falhou no relatório: ${String(error)}`);
        }
      }
    }
    return this.templateFallback(report);
  }

  async ingestMessage(data: {
    platform: string;
    chatId: string;
    userName?: string;
    userText?: string;
    botText?: string;
    meta?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const MAX_TEXT = 2000;
    const created = await this.prisma.botMessage.create({
      data: {
        platform: data.platform.toLowerCase().slice(0, 32),
        chatId: data.chatId.slice(0, 128),
        userName: data.userName?.slice(0, 128),
        userText: data.userText?.slice(0, MAX_TEXT),
        botText: data.botText?.slice(0, MAX_TEXT),
        meta: data.meta ? (data.meta as Prisma.InputJsonObject) : undefined,
      },
      select: { id: true },
    });
    return created;
  }

  // ---- helpers ----

  private clampDays(days: number): number {
    if (!Number.isFinite(days) || days <= 0) return 7;
    return Math.min(Math.round(days), 90);
  }

  private parseSession(state: Record<string, unknown>): ParsedSession {
    const messages = Array.isArray(state?.messages)
      ? (state.messages as Record<string, unknown>[])
      : [];
    const mensagensHumano = messages
      .filter((m) => typeof m?.content === 'string' && !this.isAiMessage(m))
      .map((m) => (m.content as string).trim())
      .filter((t) => t.length > 0);

    const profile = (state?.profile ?? {}) as Record<string, unknown>;
    const metadata = (state?.metadata ?? {}) as Record<string, unknown>;
    const apresentados = Array.isArray(profile._lastShownVehicles)
      ? (profile._lastShownVehicles as Record<string, unknown>[]).map((v) =>
          `${str(v.brand)} ${str(v.model)}`.trim().toLowerCase(),
        )
      : [];

    return {
      mensagens: messages.length,
      mensagensHumano,
      estagioFinal:
        typeof state?.next === 'string' ? state.next : 'desconhecido',
      flags: Array.isArray(metadata.flags) ? (metadata.flags as string[]) : [],
      brand:
        typeof profile.brand === 'string'
          ? profile.brand.toLowerCase()
          : undefined,
      model:
        typeof profile.model === 'string'
          ? profile.model.toLowerCase()
          : undefined,
      bodyType:
        typeof profile.bodyType === 'string'
          ? profile.bodyType.toLowerCase()
          : undefined,
      usage: typeof profile.usage === 'string' ? profile.usage : undefined,
      budget: typeof profile.budget === 'number' ? profile.budget : undefined,
      apresentados: apresentados.filter((t) => t.length > 0),
    };
  }

  /** Mesma heurística do router do grafo: IA tem type 'ai' ou id de AIMessage. */
  private isAiMessage(msg: Record<string, unknown>): boolean {
    return (
      msg.type === 'ai' ||
      (typeof msg.id === 'string' && msg.id.includes('AIMessage'))
    );
  }

  private contar(valores: string[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const v of valores) {
      const key = v.toLowerCase().trim();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }

  private paraLista(map: Map<string, number>): Contagem[] {
    return [...map.entries()]
      .map(([nome, vezes]) => ({ nome, vezes }))
      .sort((a, b) => b.vezes - a.vezes);
  }

  /** Conta menções de veículos do estoque nos textos livres do bot. */
  private contarCarrosCitados(
    textos: string[],
    modelos: { label: string; bodyType: string }[],
  ): Map<string, number> {
    const counts = new Map<string, number>();
    const haystack = textos.join('\n').toLowerCase();
    for (const { label } of modelos) {
      // Primeiro token do modelo (ex.: 'ONIX 1.0' -> 'ONIX') evita perder
      // menções sem a versão; exige ao menos 3 chars para não ruído.
      const token = label.split(' ')[1] ?? label;
      if (token.length < 3) continue;
      const vezes = haystack.split(token.toLowerCase()).length - 1;
      if (vezes > 0) counts.set(label, vezes);
    }
    return counts;
  }

  private templateFallback(report: AnalyticsReport): string {
    const s = report.site;
    const b = report.bot;
    const linhas: string[] = [];
    linhas.push(
      `📊 Relatório CarInsight — últimos ${report.periodo.dias} dia(s)`,
    );
    linhas.push('');
    linhas.push(
      `🤖 Bot: ${b.conversas} conversa(s), ${b.mensagensUsuario} mensagem(ns) de clientes`,
    );
    linhas.push(
      `💬 Site: ${s.sessoes} sessão(ões), ${s.leads} lead(s), ${s.pedidosVendedor} pedido(s) de vendedor`,
    );
    if (s.carrosMaisApresentados.length) {
      linhas.push('');
      linhas.push('🚗 Mais apresentados no site:');
      for (const c of s.carrosMaisApresentados) {
        linhas.push(`• ${c.nome} (${c.vezes}x)`);
      }
    }
    if (b.carrosCitados.length) {
      linhas.push('');
      linhas.push('🔎 Mais citados no Telegram:');
      for (const c of b.carrosCitados) {
        linhas.push(`• ${c.nome} (${c.vezes}x)`);
      }
    }
    if (s.estagiosFinais.length) {
      linhas.push('');
      linhas.push('📉 Onde as conversas pararam (site):');
      for (const e of s.estagiosFinais.slice(0, 5)) {
        linhas.push(`• ${e.nome}: ${e.vezes}`);
      }
    }
    linhas.push('');
    linhas.push(`Gerado em ${new Date().toLocaleString('pt-BR')}`);
    return linhas.join('\n');
  }
}
