import { mentionedBrands, ruleProfile } from './briefing-rules';

describe('Explicit purchase preferences', () => {
  it('understands Brazilian money and common transmission spelling', () => {
    expect(ruleProfile('Quero SUV automático até 90 mil')).toEqual({
      bodyType: 'suv',
      transmission: 'automatico',
      budgetMax: 90000,
    });
    expect(ruleProfile('hatch com orçamento de R$ 75.000,00')).toMatchObject({
      budgetMax: 75000,
      bodyType: 'hatch',
    });
  });
  it('does not reinterpret an income or model year as purchase budget', () => {
    expect(
      ruleProfile('ganho 10 mil e aceito carros até 2020'),
    ).not.toHaveProperty('budgetMax');
  });
  it('does not turn a directly negated attribute into a preference', () => {
    expect(ruleProfile('não quero SUV, prefiro hatch manual')).toMatchObject({
      bodyType: 'hatch',
      transmission: 'manual',
    });
  });
  it('keeps mileage limits out of the purchase budget', () => {
    expect(ruleProfile('Quero um carro com até 80 mil km')).not.toHaveProperty(
      'budgetMax',
    );
    expect(
      ruleProfile('até 80 mil quilômetros e até 90 mil reais'),
    ).toMatchObject({ budgetMax: 90000 });
  });
  it('treats the decimal point before k as a decimal, not a thousands separator', () => {
    expect(ruleProfile('Quero um carro até 100.5k')).toMatchObject({
      budgetMax: 100500,
    });
    expect(ruleProfile('Quero um carro até 100,5 mil')).toMatchObject({
      budgetMax: 100500,
    });
  });
  it('does not suggest a directly rejected brand', () => {
    expect(
      mentionedBrands('Não quero Toyota, prefiro Honda', [
        { code: '1', name: 'Toyota' },
        { code: '2', name: 'Honda' },
      ]),
    ).toEqual([{ code: '2', name: 'Honda' }]);
  });
  it('only suggests brand identifiers returned by the provider', () => {
    expect(
      mentionedBrands('Quero Volkswagen', [
        { code: '59', name: 'VW - VolksWagen' },
      ]),
    ).toEqual([{ code: '59', name: 'VW - VolksWagen' }]);
    expect(
      mentionedBrands('Uma marca inventada', [
        { code: '59', name: 'VW - VolksWagen' },
      ]),
    ).toEqual([]);
  });
});
