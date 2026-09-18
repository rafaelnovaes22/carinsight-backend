import { BadGatewayException } from '@nestjs/common';
import { CatalogChoice, CatalogValuation } from './catalog.types';

export type ValuationFacts = Omit<
  CatalogValuation,
  'source' | 'retrievedAt' | 'cached'
>;

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadGatewayException(
      'O provedor retornou uma referência em formato inválido',
    );
  }
  return input as Record<string, unknown>;
}

function textField(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) {
    throw new BadGatewayException(
      `O provedor retornou o campo ${key} inválido; esperado texto preenchido`,
    );
  }
  return value;
}

export function catalogChoices(input: unknown): CatalogChoice[] {
  if (!Array.isArray(input) || input.length > 10000) {
    throw new BadGatewayException(
      'O provedor retornou uma lista inválida; esperado até 10000 opções',
    );
  }
  return input.map((entry: unknown) => {
    const fields = record(entry);
    return { code: textField(fields, 'code'), name: textField(fields, 'name') };
  });
}

function priceInReais(formatted: string): number {
  if (!/^R\$\s*[\d.]+,\d{2}$/.test(formatted)) {
    throw new BadGatewayException(
      'O provedor retornou preço inválido; esperado BRL com centavos',
    );
  }
  const amount = Number(formatted.replace(/R\$\s*|\./g, '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0)
    throw new BadGatewayException('Preço de referência deve ser positivo');
  return amount;
}

export function catalogValuation(input: unknown): ValuationFacts {
  const fields = record(input);
  const priceFormatted = textField(fields, 'price');
  if (
    typeof fields.modelYear !== 'number' ||
    !Number.isInteger(fields.modelYear)
  ) {
    throw new BadGatewayException(
      'O provedor retornou ano-modelo inválido; esperado número inteiro',
    );
  }
  return {
    kind: 'reference_valuation',
    brand: textField(fields, 'brand'),
    model: textField(fields, 'model'),
    modelYear: fields.modelYear,
    fuel: textField(fields, 'fuel'),
    codeFipe: textField(fields, 'codeFipe'),
    price: priceInReais(priceFormatted),
    priceFormatted,
    currency: 'BRL',
    referenceMonth: textField(fields, 'referenceMonth'),
    disclaimer:
      'Preço médio de referência consultado via provedor independente. Não é oferta, avaliação individual ou garantia de disponibilidade.',
  };
}
