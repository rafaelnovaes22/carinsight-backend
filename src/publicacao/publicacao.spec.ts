import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { PublicacaoGuard } from './publicacao.guard';
import { EntradaCarro, PublicacaoService } from './publicacao.service';

const SENHA = 'senha-sintetica-de-teste-com-mais-de-32-caracteres';

const contexto = (token?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token ? { 'x-publicacao-token': token } : {},
      }),
    }),
  }) as unknown as ExecutionContext;

describe('PublicacaoGuard', () => {
  const guard = new PublicacaoGuard();
  afterEach(() => delete process.env.PUBLICACAO_TOKEN);

  it('sem senha configurada, a rota não existe', () => {
    expect(() => guard.canActivate(contexto(SENHA))).toThrow('Not Found');
  });

  it('recusa senha curta configurada, mesmo acertando', () => {
    process.env.PUBLICACAO_TOKEN = 'curta';
    expect(() => guard.canActivate(contexto('curta'))).toThrow('Not Found');
  });

  it('recusa senha errada ou ausente', () => {
    process.env.PUBLICACAO_TOKEN = SENHA;
    expect(() => guard.canActivate(contexto('errada'))).toThrow('Not Found');
    expect(() => guard.canActivate(contexto())).toThrow('Not Found');
  });

  it('aceita a senha certa', () => {
    process.env.PUBLICACAO_TOKEN = SENHA;
    expect(guard.canActivate(contexto(SENHA))).toBe(true);
  });
});

function montar() {
  const vehicle = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'novo' }),
    update: jest.fn().mockResolvedValue({ id: 'existente' }),
    updateMany: jest.fn().mockResolvedValue({ count: 2 }),
  };
  const dealer = {
    findFirst: jest.fn().mockResolvedValue({ id: 'loja-1' }),
    create: jest.fn().mockResolvedValue({ id: 'loja-nova' }),
    update: jest.fn().mockResolvedValue({}),
  };
  const prisma = {
    vehicle,
    dealer,
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({ vehicle })),
  };
  const embeddings = {
    syncVehicleEmbedding: jest.fn().mockResolvedValue(true),
  };
  const servico = new PublicacaoService(prisma as never, embeddings as never);
  return { servico, vehicle, dealer, embeddings };
}

const entrada = (extra: Partial<EntradaCarro> = {}): EntradaCarro => ({
  loja: 'Loja Sintética',
  dados: {
    title: 'MARCA ZETA 2020',
    price: 70000,
    technicalSpecs: { source: { id: 'fonte-1' } },
  },
  midia: [{ url: 'https://exemplo.test/1.jpg', order: 0 }],
  ...extra,
});

describe('salvarCarro', () => {
  it('cria na loja certa, ignora loja vinda no corpo e atualiza a busca', async () => {
    const { servico, vehicle, embeddings } = montar();
    const base = entrada();
    const resposta = await servico.salvarCarro({
      ...base,
      dados: { ...base.dados, dealerId: 'loja-de-outro' },
    });
    const data = vehicle.create.mock.calls[0][0].data;
    expect(data.dealerId).toBe('loja-1');
    expect(data.media.create[0].type).toBe('IMAGE');
    expect(embeddings.syncVehicleEmbedding).toHaveBeenCalledWith('novo');
    expect(resposta).toEqual({ id: 'novo', criado: true, busca: true });
  });

  it('repetir a chamada atualiza pelo id da fonte, sem duplicar', async () => {
    const { servico, vehicle } = montar();
    vehicle.findFirst.mockResolvedValue({ id: 'existente' });
    const resposta = await servico.salvarCarro(entrada());
    expect(vehicle.findFirst.mock.calls[0][0].where).toEqual({
      dealerId: 'loja-1',
      technicalSpecs: { path: ['source', 'id'], equals: 'fonte-1' },
    });
    expect(vehicle.create).not.toHaveBeenCalled();
    expect(vehicle.update.mock.calls[0][0].data.media.deleteMany).toEqual({});
    expect(resposta.criado).toBe(false);
  });

  it('atualizar não troca a loja do carro nem aceita campo fora da lista', async () => {
    const { servico, vehicle } = montar();
    vehicle.findFirst.mockResolvedValue({ id: 'existente' });
    const base = entrada();
    await servico.salvarCarro({
      ...base,
      dados: { ...base.dados, dealerId: 'loja-de-outro', id: 'outro-id' },
    });
    const data = vehicle.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('dealerId');
    expect(data).not.toHaveProperty('id');
  });

  it('procura o id informado só dentro da própria loja', async () => {
    const { servico, vehicle } = montar();
    vehicle.findFirst.mockResolvedValue({ id: 'x' });
    await servico.salvarCarro(entrada({ id: 'x' }));
    expect(vehicle.findFirst.mock.calls[0][0].where).toEqual({
      id: 'x',
      dealerId: 'loja-1',
    });
  });

  it('recusa atualizar carro de outra loja', async () => {
    const { servico, vehicle } = montar();
    await expect(
      servico.salvarCarro(entrada({ id: 'de-outra-loja' })),
    ).rejects.toThrow(BadRequestException);
    expect(vehicle.update).not.toHaveBeenCalled();
  });

  it('só cria a loja quando pedido', async () => {
    const { servico, dealer, vehicle } = montar();
    dealer.findFirst.mockResolvedValue(null);
    await expect(servico.salvarCarro(entrada())).rejects.toThrow(
      'loja não encontrada',
    );
    expect(vehicle.create).not.toHaveBeenCalled();

    await servico.salvarCarro(entrada({ criarLoja: true }));
    expect(dealer.create.mock.calls[0][0].data.user.create.email).toBe(
      'loja-loja-sintetica@carinsight.com.br',
    );
    expect(vehicle.create.mock.calls[0][0].data.dealerId).toBe('loja-nova');
  });

  it.each<[string, Partial<EntradaCarro>]>([
    ['sem preço', { dados: { title: 'X', price: 0 } }],
    ['sem foto', { midia: [] }],
    ['mídia sem https', { midia: [{ url: 'http://x.test/1.jpg', order: 0 }] }],
    [
      'tipo de mídia inválido',
      { midia: [{ url: 'https://x.test/1.jpg', order: 0, type: 'VR360' }] },
    ],
  ])('recusa %s', async (_nome, extra) => {
    const { servico, vehicle } = montar();
    await expect(servico.salvarCarro(entrada(extra))).rejects.toThrow(
      BadRequestException,
    );
    expect(vehicle.create).not.toHaveBeenCalled();
  });

  it('avisa quando a busca semântica falha', async () => {
    const { servico, embeddings } = montar();
    embeddings.syncVehicleEmbedding.mockResolvedValue(false);
    expect((await servico.salvarCarro(entrada())).busca).toBe(false);
  });
});

describe('mudarSituacao', () => {
  it('só altera carros da própria loja', async () => {
    const { servico, vehicle } = montar();
    await servico.mudarSituacao({ loja: 'L', ids: ['a'], status: 'SOLD' });
    expect(vehicle.updateMany.mock.calls[0][0].where).toEqual({
      id: { in: ['a'] },
      dealerId: 'loja-1',
    });
  });

  it('não aceita outra situação, como apagar ou disponibilizar', async () => {
    const { servico, vehicle } = montar();
    await expect(
      servico.mudarSituacao({ loja: 'L', ids: ['a'], status: 'AVAILABLE' }),
    ).rejects.toThrow(BadRequestException);
    expect(vehicle.updateMany).not.toHaveBeenCalled();
  });
});
