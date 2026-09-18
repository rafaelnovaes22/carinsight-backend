import { CatalogChoice } from '../catalog/catalog.types';
import { DecisionConstraintsDto } from './decision-request.dto';

export function normalizedWords(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function affirmativeChoice(
  text: string,
  choices: string[],
): string | undefined {
  return choices.find((choice) => {
    const mentioned = new RegExp(`\\b${choice}\\b`).test(text);
    const negated = new RegExp(
      `(?:nao|sem|evitar)\\s+(?:(?:quero|prefiro|um|uma)\\s+)*${choice}\\b`,
    ).test(text);
    return mentioned && !negated;
  });
}

function statedBudget(text: string): number | undefined {
  const pattern =
    /(?:ate|orcamento(?: de)?|limite(?: de)?|no maximo)\s*(?:r\$\s*)?([\d.]+(?:,\d+)?)\s*(mil|k)?\b/g;
  for (const match of text.matchAll(pattern)) {
    const suffix = text.slice(match.index + match[0].length).trimStart();
    if (/^(?:km\b|quilometros?\b|rodados?\b)/.test(suffix)) continue;
    const numeral = match[2] ? match[1] : match[1].replace(/\./g, '');
    const amount = Number(numeral.replace(',', '.')) * (match[2] ? 1000 : 1);
    if (amount >= 5000 && amount <= 99999999) return amount;
  }
  return undefined;
}

export function ruleProfile(message: string): DecisionConstraintsDto {
  const text = normalizedWords(message);
  const profile: DecisionConstraintsDto = {};
  const budget = statedBudget(text);
  const body = affirmativeChoice(text, [
    'suv',
    'sedan',
    'hatch',
    'picape',
    'pickup',
    'minivan',
  ]);
  const transmission = affirmativeChoice(text, [
    'automatico',
    'automatica',
    'cvt',
    'manual',
  ]);
  const fuel = affirmativeChoice(text, [
    'flex',
    'gasolina',
    'diesel',
    'eletrico',
    'hibrido',
  ]);
  if (budget) profile.budgetMax = budget;
  if (body) profile.bodyType = body === 'picape' ? 'pickup' : body;
  if (transmission)
    profile.transmission = transmission === 'manual' ? 'manual' : 'automatico';
  if (fuel) profile.fuelType = fuel;
  return profile;
}

export function mentionedBrands(
  message: string,
  brands: CatalogChoice[],
): CatalogChoice[] {
  const text = normalizedWords(message);
  return brands
    .filter((brand) =>
      normalizedWords(brand.name)
        .split(/[^a-z0-9]+/)
        .some(
          (part) =>
            part.length >= 2 && affirmativeChoice(text, [part]) !== undefined,
        ),
    )
    .slice(0, 3);
}

export function briefingQuestions(profile: DecisionConstraintsDto): string[] {
  const questions: string[] = [];
  if (!profile.budgetMax)
    questions.push('Qual é o seu limite para a compra do carro?');
  if (!profile.bodyType)
    questions.push(
      'Qual carroceria combina com sua rotina: hatch, sedã, SUV ou picape?',
    );
  if (!profile.transmission)
    questions.push('Você prefere câmbio manual ou automático?');
  if (!questions.length)
    questions.push(
      'Qual modelo e ano você quer colocar lado a lado na comparação?',
    );
  return questions;
}

export function briefingSummary(profile: DecisionConstraintsDto): string {
  const choices = [profile.bodyType, profile.transmission]
    .filter(Boolean)
    .join(', ');
  const budget = profile.budgetMax?.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const preference = [choices, budget ? `até ${budget}` : 'orçamento a definir']
    .filter(Boolean)
    .join(', ');
  return `Seu ponto de partida: ${preference}. Escolha uma versão e um ano para consultar a referência e comparar custos. Nenhuma oferta de estoque foi presumida.`;
}
