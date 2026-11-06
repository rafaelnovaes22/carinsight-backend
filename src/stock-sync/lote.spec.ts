import { readFileSync } from 'fs';
import { join } from 'path';
import {
  carrosComFoto,
  CarroLote,
  dadosDoVeiculo,
  Lote,
  midiaDoVeiculo,
  validarLote,
} from './lote';

const FOTO = 'https://www.carinsight.com.br/assets/carros/loja/carro/01.jpg';

const carro = (extra: Partial<CarroLote> = {}): CarroLote => ({
  id: 'carro',
  make: 'MARCA',
  model: 'ZETA',
  yearFab: 2019,
  yearModel: 2020,
  km: 45000,
  price: 70000,
  bodyType: 'hatch',
  features: ['Multimídia'],
  fotos: [FOTO],
  ...extra,
});
const lote = (...carros: CarroLote[]): Lote => ({
  loja: 'Loja Sintética',
  carros,
});

describe('validarLote', () => {
  it('aceita um carro completo', () => {
    expect(validarLote(lote(carro()))).toEqual([]);
  });

  it.each<[string, Partial<CarroLote>, RegExp]>([
    ['sem preço', { price: 0 }, /sem preço/],
    ['sem km', { km: 0 }, /sem quilometragem/],
    ['anos trocados', { yearFab: 2021 }, /ano de fabricação/],
    ['foto repetida', { fotos: [FOTO, FOTO] }, /foto repetida/],
    [
      'mídia de fora',
      { fotos: ['https://exemplo.test/1.jpg'] },
      /fora do site/,
    ],
    ['telefone no texto', { features: ['Ligue (11) 99999-1234'] }, /telefone/],
  ])('recusa %s', (_nome, extra, erro) => {
    expect(validarLote(lote(carro(extra))).join()).toMatch(erro);
  });

  it('leilão precisa aparecer no nome e nos itens', () => {
    expect(validarLote(lote(carro({ leilao: true }))).join()).toMatch(
      /nome do carro/,
    );
    expect(
      validarLote(
        lote(
          carro({
            leilao: true,
            version: 'EXL - PASSAGEM POR LEILÃO',
            features: ['Couro'],
          }),
        ),
      ).join(),
    ).toMatch(/nos itens/);
  });

  it('recusa id repetido', () => {
    expect(validarLote(lote(carro(), carro())).join()).toMatch(/id repetido/);
  });
});

describe('carrosComFoto', () => {
  it('carro sem foto fica de fora, sem bloquear os outros', () => {
    const l = lote(carro(), carro({ id: 'sem-foto', fotos: [] }));
    expect(validarLote(l)).toEqual([]);
    expect(carrosComFoto(l).map((c) => c.id)).toEqual(['carro']);
  });
});

describe('dados gravados', () => {
  it('não inventa combustível nem câmbio que a ficha não trouxe', () => {
    const specs = dadosDoVeiculo(carro(), 'Loja').technicalSpecs;
    expect(specs).not.toHaveProperty('fuel');
    expect(specs).not.toHaveProperty('transmission');
    expect(specs.source).toEqual({
      site: 'whatsapp',
      loja: 'Loja',
      id: 'carro',
    });
  });

  it('vídeo entra depois das fotos', () => {
    const midia = midiaDoVeiculo(
      carro({ video: FOTO.replace('01.jpg', 'video.mp4') }),
    );
    expect(midia.map((m) => m.type)).toEqual(['IMAGE', 'VIDEO']);
    expect(midia[0].order).toBe(0);
  });
});

describe('lote da Robust Car de 04/11/2026', () => {
  const real = JSON.parse(
    readFileSync(
      join(__dirname, '../../prisma/lotes/robust-car-2026-11-04.json'),
      'utf8',
    ),
  ) as Lote;

  it('é válido, com 6 carros prontos e a Saveiro aguardando foto', () => {
    expect(validarLote(real)).toEqual([]);
    expect(carrosComFoto(real)).toHaveLength(6);
    expect(
      real.carros.filter((c) => c.fotos.length === 0).map((c) => c.model),
    ).toEqual(['SAVEIRO']);
  });

  it('o Fit azul avisa a passagem por leilão no próprio nome', () => {
    const fit = real.carros.find((c) => c.leilao);
    expect(fit?.cor).toBe('Azul');
    expect(dadosDoVeiculo(fit as CarroLote, real.loja).title).toMatch(/LEILÃO/);
  });
});
