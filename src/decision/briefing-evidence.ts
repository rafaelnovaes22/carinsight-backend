import { CatalogChoice } from '../catalog/catalog.types';
import { DecisionConstraintsDto } from './decision-request.dto';
import { normalizedWords } from './briefing-rules';

export function groundedPhrase(message: string, phrase: string): boolean {
  const text = normalizedWords(message);
  const literal = normalizedWords(phrase).trim();
  if (!literal) return false;
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const match of text.matchAll(new RegExp(`\\b${escaped}\\b`, 'g'))) {
    const clause =
      text
        .slice(0, match.index)
        .split(/[,.;!?]|\bmas\b/)
        .at(-1) ?? '';
    if (!/\b(?:nao|sem|evitar)\b/.test(clause)) return true;
  }
  return false;
}

export function rejectedBrand(message: string, brand: CatalogChoice): boolean {
  const text = normalizedWords(message);
  const aliases = normalizedWords(brand.name)
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 2);
  return aliases.some(
    (alias) =>
      new RegExp(`\\b${alias}\\b`).test(text) &&
      !groundedPhrase(message, alias),
  );
}

export function groundedProfile(
  profile: DecisionConstraintsDto,
  message: string,
): DecisionConstraintsDto {
  const grounded: DecisionConstraintsDto = {};
  // Filters with numeric or normalized meanings are accepted only by rules or explicit form edits.
  if (profile.make && groundedPhrase(message, profile.make))
    grounded.make = profile.make;
  if (profile.model && groundedPhrase(message, profile.model))
    grounded.model = profile.model;
  if (profile.priorities)
    grounded.priorities = profile.priorities.filter((priority) =>
      groundedPhrase(message, priority),
    );
  return grounded;
}
