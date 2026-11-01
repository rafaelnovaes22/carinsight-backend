import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { IGraphState, HandoffPayload } from '../graph/types/graph-state.types';
import { LeadNotificationService } from './lead-notification.service';

const WA_TEXT_MAX_LENGTH = 1800; // stay well under the ~2000 char URL limit

@Injectable()
export class LeadService {
  private readonly logger = new Logger(LeadService.name);

  constructor(
    private prisma: PrismaService,
    private notification: LeadNotificationService,
  ) {}

  /**
   * Persist a qualified lead from the conversation state and build the
   * wa.me handoff link with a pre-filled summary message.
   */
  async createLeadFromState(state: IGraphState): Promise<HandoffPayload> {
    const profile = state.profile;
    const name = profile.customerName || 'Cliente do site';

    const vehicles = state.recommendations.slice(0, 3).map((rec) => ({
      vehicleId: rec.vehicleId,
      make: rec.vehicle?.make || '',
      model: rec.vehicle?.model || '',
      yearModel: rec.vehicle?.yearModel || 0,
      price: rec.vehicle?.price || 0,
    }));

    const financing = profile.wantsFinancing
      ? {
          downPayment: profile.financingDownPayment || null,
          months: profile.financingMonths || null,
        }
      : null;

    const tradeIn = profile.hasTradeIn
      ? {
          brand: profile.tradeInBrand || null,
          model: profile.tradeInModel || null,
          year: profile.tradeInYear || null,
          estimatedValue: profile.tradeInEstimatedValue || null,
        }
      : null;

    const summary = this.buildStoreSummary(state, name);

    const lead = await this.prisma.lead.create({
      data: {
        sessionId: state.sessionId || '',
        name,
        phone: state.phoneNumber || null,
        vehicles: vehicles as unknown as Prisma.InputJsonValue,
        financing: financing as unknown as Prisma.InputJsonValue,
        tradeIn: tradeIn as unknown as Prisma.InputJsonValue,
        profile: this.publicProfile(state) as unknown as Prisma.InputJsonValue,
        summary,
      },
    });

    this.logger.log(`Lead created: ${lead.id} (session ${state.sessionId})`);

    // Notify the store asynchronously - never block the customer response
    this.notification
      .notifyNewLead(lead.id, summary)
      .then(async (notified) => {
        if (notified) {
          await this.prisma.lead.update({
            where: { id: lead.id },
            data: { status: 'NOTIFIED' },
          });
        }
      })
      .catch((error) =>
        this.logger.error(`Lead notification failed: ${String(error)}`),
      );

    return {
      leadId: lead.id,
      waLink: this.buildWaLink(state, name),
      summary,
    };
  }

  /**
   * wa.me link with the message the CUSTOMER sends to the store.
   */
  private buildWaLink(state: IGraphState, name: string): string {
    const storeNumber = (process.env.STORE_WHATSAPP_NUMBER || '').replace(
      /\D/g,
      '',
    );

    const parts: string[] = [
      `Olá! Vim do site CarInsight. Meu nome é ${name}.`,
    ];

    const vehicle = state.recommendations[0]?.vehicle;
    if (vehicle) {
      parts.push(
        `Tenho interesse no ${vehicle.make} ${vehicle.model} ${vehicle.yearModel} (R$ ${vehicle.price.toLocaleString('pt-BR')}).`,
      );
    } else if (state.profile.bodyType || state.profile.budget) {
      const desc: string[] = [];
      if (state.profile.bodyType) desc.push(state.profile.bodyType);
      if (state.profile.budget)
        desc.push(`até R$ ${state.profile.budget.toLocaleString('pt-BR')}`);
      parts.push(`Estou procurando um ${desc.join(' ')}.`);
    }

    if (state.profile.wantsFinancing) {
      const fin: string[] = [];
      if (state.profile.financingDownPayment)
        fin.push(
          `entrada de R$ ${state.profile.financingDownPayment.toLocaleString('pt-BR')}`,
        );
      if (state.profile.financingMonths)
        fin.push(`${state.profile.financingMonths}x`);
      parts.push(
        `Quero simular financiamento${fin.length ? ` (${fin.join(', ')})` : ''}.`,
      );
    }

    if (state.profile.hasTradeIn) {
      const t: string[] = [];
      if (state.profile.tradeInBrand) t.push(state.profile.tradeInBrand);
      if (state.profile.tradeInModel) t.push(state.profile.tradeInModel);
      if (state.profile.tradeInYear) t.push(String(state.profile.tradeInYear));
      parts.push(
        `Tenho um carro na troca${t.length ? `: ${t.join(' ')}` : ''}.`,
      );
    }

    if (state.metadata.flags.includes('visit_requested')) {
      parts.push('Gostaria de agendar uma visita.');
    }

    let text = parts.join(' ');
    if (text.length > WA_TEXT_MAX_LENGTH) {
      text = text.substring(0, WA_TEXT_MAX_LENGTH);
    }

    return `https://wa.me/${storeNumber}?text=${encodeURIComponent(text)}`;
  }

  /**
   * Internal summary for the store notification (email/CRM).
   */
  private buildStoreSummary(state: IGraphState, name: string): string {
    const profile = state.profile;
    const lines: string[] = [`Novo lead do chat do site`, ``, `Nome: ${name}`];

    if (state.phoneNumber) lines.push(`Telefone: ${state.phoneNumber}`);
    if (profile.budget)
      lines.push(`Orçamento: R$ ${profile.budget.toLocaleString('pt-BR')}`);
    if (profile.bodyType) lines.push(`Tipo: ${profile.bodyType}`);
    if (profile.usage) lines.push(`Uso: ${profile.usage}`);

    if (state.recommendations.length > 0) {
      lines.push(``, `Veículos de interesse:`);
      state.recommendations.slice(0, 3).forEach((rec, i) => {
        if (rec.vehicle) {
          lines.push(
            `${i + 1}. ${rec.vehicle.make} ${rec.vehicle.model} ${rec.vehicle.yearModel} - R$ ${rec.vehicle.price.toLocaleString('pt-BR')}`,
          );
        }
      });
    }

    if (profile.wantsFinancing) {
      lines.push(``, `Financiamento:`);
      if (profile.financingDownPayment)
        lines.push(
          `Entrada: R$ ${profile.financingDownPayment.toLocaleString('pt-BR')}`,
        );
      if (profile.financingMonths)
        lines.push(`Prazo: ${profile.financingMonths}x`);
    }

    if (profile.hasTradeIn) {
      lines.push(
        ``,
        `Troca: ${[profile.tradeInBrand, profile.tradeInModel, profile.tradeInYear].filter(Boolean).join(' ') || 'sim'}`,
      );
    }

    if (state.metadata.flags.includes('visit_requested')) {
      lines.push(``, `Cliente pediu agendamento de visita.`);
    }
    if (state.metadata.flags.includes('purchase_intent')) {
      lines.push(``, `Cliente demonstrou intenção de compra.`);
    }

    lines.push(``, `Sessão: ${state.sessionId || 'n/a'}`);
    return lines.join('\n');
  }

  private publicProfile(state: IGraphState): Record<string, unknown> {
    const {
      _lastShownVehicles,
      _showedRecommendation,
      _skipOnboarding,
      ...pub
    } = state.profile;
    return pub as Record<string, unknown>;
  }
}
