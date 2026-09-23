import { config } from 'dotenv';
import { join } from 'path';

// Carregar variáveis de ambiente de teste
config({ path: join(__dirname, '..', '.env.test') });

// Estes testes apagam fixtures. Recusar qualquer banco que não seja isolado e local.
const testDatabase = new URL(
  process.env.DATABASE_URL ?? 'postgresql://invalid',
);
if (
  !['127.0.0.1', 'localhost'].includes(testDatabase.hostname) ||
  !testDatabase.pathname.endsWith('_test')
) {
  throw new Error('E2E exige PostgreSQL local com nome terminado em _test');
}
