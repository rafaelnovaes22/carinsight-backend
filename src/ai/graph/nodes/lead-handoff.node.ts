import { AIMessage } from '@langchain/core/messages';
import { Logger } from '@nestjs/common';
import { IGraphState } from '../types/graph-state.types';
import { LeadService } from '../../lead/lead.service';

const logger = new Logger('LeadHandoffNode');

/**
 * Lead Handoff Node - final step of the funnel.
 * Persists the qualified lead and hands the customer over to the store's
 * WhatsApp with a pre-filled summary (wa.me deep link).
 */
export function createLeadHandoffNode(leadService: LeadService) {
  return async (state: IGraphState): Promise<Partial<IGraphState>> => {
    // Idempotency: if a lead was already created in this session, just remind
    if (state.handoff?.waLink) {
      return {
        next: 'negotiation',
        messages: [
          new AIMessage(
            `Seu resumo já está pronto! É só clicar no botão abaixo para falar com a loja no WhatsApp. 📲\n\n` +
              `Enquanto isso, posso te ajudar com mais alguma coisa?`,
          ),
        ],
        metadata: { ...state.metadata, lastMessageAt: Date.now() },
      };
    }

    try {
      const handoff = await leadService.createLeadFromState(state);
      const firstName = state.profile.customerName?.split(' ')[0];

      let text = firstName
        ? `Perfeito, ${firstName}! 🎉\n\n`
        : `Perfeito! 🎉\n\n`;
      text +=
        `Preparei um resumo com tudo que conversamos e a equipe da loja já foi avisada.\n\n` +
        `👉 Clique no botão abaixo para continuar direto no WhatsApp da loja - ` +
        `sua mensagem já vai pronta, é só enviar!\n\n` +
        `Enquanto isso, se quiser, posso mostrar mais opções ou simular outro financiamento.`;

      return {
        next: 'negotiation',
        handoff,
        messages: [new AIMessage(text)],
        metadata: {
          ...state.metadata,
          lastMessageAt: Date.now(),
          flags: [...state.metadata.flags, 'lead_created'],
        },
      };
    } catch (error) {
      logger.error(`Failed to create lead: ${String(error)}`);
      return {
        next: 'negotiation',
        messages: [
          new AIMessage(
            `Já avisei nossa equipe sobre seu interesse! 👨‍💼\n\n` +
              `Um consultor da loja vai falar com você em breve.\n\n` +
              `Posso te ajudar com mais alguma coisa enquanto isso?`,
          ),
        ],
        metadata: {
          ...state.metadata,
          lastMessageAt: Date.now(),
          errorCount: state.metadata.errorCount + 1,
          flags: [...state.metadata.flags, 'lead_creation_failed'],
        },
      };
    }
  };
}
