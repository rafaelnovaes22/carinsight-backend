import { randomBytes } from 'node:crypto';

type JwtSecretName = 'JWT_SECRET' | 'JWT_REFRESH_SECRET';
const developmentSecrets = new Map<JwtSecretName, string>();

export function jwtSecret(name: JwtSecretName): string {
  const configured = process.env[name];
  if (
    configured &&
    configured.length >= 32 &&
    !/dev-secret|change-me|placeholder/i.test(configured)
  ) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${name} deve conter um segredo próprio com pelo menos 32 caracteres`,
    );
  }
  const ephemeral =
    developmentSecrets.get(name) ?? randomBytes(32).toString('hex');
  developmentSecrets.set(name, ephemeral);
  return ephemeral;
}

export function validateJwtSecrets(): void {
  if (jwtSecret('JWT_SECRET') === jwtSecret('JWT_REFRESH_SECRET')) {
    throw new Error('JWT_SECRET e JWT_REFRESH_SECRET devem ser diferentes');
  }
}
