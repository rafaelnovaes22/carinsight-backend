import { Test, TestingModule } from '@nestjs/testing';
import { AIMessage } from '@langchain/core/messages';
import { LeadService } from '../lead.service';
import { LeadNotificationService } from '../lead-notification.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { IGraphState } from '../../graph/types/graph-state.types';

describe('LeadService', () => {
  let service: LeadService;
  let prisma: { lead: { create: jest.Mock; update: jest.Mock } };
  let notification: { notifyNewLead: jest.Mock };

  const baseState = (): IGraphState => ({
    messages: [new AIMessage('olá')],
    phoneNumber: '',
    sessionId: 'session-1',
    profile: {
      customerName: 'Rafael Silva',
      budget: 90000,
      bodyType: 'suv',
      wantsFinancing: true,
      financingDownPayment: 20000,
      financingMonths: 48,
    },
    recommendations: [
      {
        vehicleId: 'v1',
        matchScore: 92,
        reasoning: 'Combina com o perfil',
        highlights: [],
        concerns: [],
        vehicle: {
          id: 'v1',
          make: 'Jeep',
          model: 'Renegade',
          yearModel: 2022,
          price: 89900,
          mileage: 35000,
          bodyType: 'suv',
        },
      },
    ],
    next: 'lead_handoff',
    metadata: {
      startedAt: Date.now(),
      lastMessageAt: Date.now(),
      loopCount: 0,
      errorCount: 0,
      flags: ['visit_requested'],
    },
  });

  beforeEach(async () => {
    process.env.STORE_WHATSAPP_NUMBER = '55 (11) 99999-9999';

    prisma = {
      lead: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'lead-1', ...data }),
          ),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    notification = { notifyNewLead: jest.fn().mockResolvedValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadService,
        { provide: PrismaService, useValue: prisma },
        { provide: LeadNotificationService, useValue: notification },
      ],
    }).compile();

    service = module.get(LeadService);
  });

  it('persists the lead with vehicles, financing and summary', async () => {
    const handoff = await service.createLeadFromState(baseState());

    expect(handoff.leadId).toBe('lead-1');
    const created = prisma.lead.create.mock.calls[0][0].data;
    expect(created.name).toBe('Rafael Silva');
    expect(created.sessionId).toBe('session-1');
    expect(created.vehicles[0].model).toBe('Renegade');
    expect(created.financing.downPayment).toBe(20000);
    expect(created.summary).toContain('Jeep Renegade 2022');
    expect(created.summary).toContain('agendamento de visita');
  });

  it('builds a wa.me link with sanitized number and pre-filled summary', async () => {
    const handoff = await service.createLeadFromState(baseState());

    expect(handoff.waLink).toMatch(/^https:\/\/wa\.me\/5511999999999\?text=/);
    const text = decodeURIComponent(handoff.waLink.split('?text=')[1]);
    expect(text).toContain('Rafael Silva');
    expect(text).toContain('Jeep Renegade 2022');
    expect(text).toContain('financiamento');
    expect(text).toContain('agendar uma visita');
    expect(handoff.waLink.length).toBeLessThan(2000);
  });

  it('falls back to a generic name and search description without vehicle', async () => {
    const state = baseState();
    state.profile.customerName = undefined;
    state.recommendations = [];

    const handoff = await service.createLeadFromState(state);
    const text = decodeURIComponent(handoff.waLink.split('?text=')[1]);
    expect(text).toContain('Cliente do site');
    expect(text).toContain('suv');
    expect(text).toContain('90.000');
  });

  it('notifies the store asynchronously', async () => {
    await service.createLeadFromState(baseState());
    expect(notification.notifyNewLead).toHaveBeenCalledWith(
      'lead-1',
      expect.stringContaining('Novo lead'),
    );
  });
});
