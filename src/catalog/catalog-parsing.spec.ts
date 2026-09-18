import { catalogChoices, catalogValuation } from './catalog-parsing';

const reference = {
  brand: 'Marca de teste',
  model: 'Modelo de teste',
  modelYear: 2022,
  fuel: 'Gasolina',
  codeFipe: '000000-0',
  price: 'R$ 89.123,45',
  referenceMonth: 'setembro de 2026',
};

describe('Reference catalog facts', () => {
  it('preserves the provider month and exact monetary value without implying stock', () => {
    expect(catalogValuation(reference)).toMatchObject({
      price: 89123.45,
      referenceMonth: 'setembro de 2026',
      kind: 'reference_valuation',
      currency: 'BRL',
    });
  });

  it('rejects malformed reference prices instead of silently making up a number', () => {
    expect(() =>
      catalogValuation({ ...reference, price: 'aproximadamente 90 mil' }),
    ).toThrow();
    expect(() =>
      catalogValuation({ ...reference, price: 'R$ 0,00' }),
    ).toThrow();
  });

  it('requires source facts and never fills a missing model or month', () => {
    expect(() =>
      catalogValuation({ ...reference, referenceMonth: undefined }),
    ).toThrow();
    expect(() => catalogValuation({ ...reference, model: '' })).toThrow();
    expect(() => catalogChoices([{ name: 'Sem identificador' }])).toThrow();
  });
});
