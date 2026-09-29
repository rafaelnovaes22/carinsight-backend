import { validateJwtSecrets } from './auth/jwt-secrets';

export function frontendOrigin(): string {
  return readHttpOrigin(
    process.env.FRONTEND_URL ?? 'https://carinsight.com.br',
  );
}

export function corsOrigins(): string[] {
  const configured =
    process.env.CORS_ORIGINS ??
    'https://carinsight.com.br,https://www.carinsight.com.br,https://frontend-production-74e7.up.railway.app';
  return configured.split(',').map((origin) => readHttpOrigin(origin.trim()));
}

export function validateRuntime(): void {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatória');
  validateJwtSecrets();
  corsOrigins();
  frontendOrigin();
}

function readHttpOrigin(input: string): string {
  const url = new URL(input);
  const loopback = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
  ) {
    throw new Error(
      'Configure uma origem HTTPS sem caminho, credenciais ou parâmetros',
    );
  }
  return url.origin;
}
