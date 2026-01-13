import { config } from 'dotenv';
import { join } from 'path';

// Carregar variáveis de ambiente de teste
config({ path: join(__dirname, '..', '.env.test') });

// Configurações globais de teste
beforeAll(() => {
  console.log('🚀 Iniciando testes E2E...');
  console.log(`📦 Database: ${process.env.DATABASE_URL}`);
  console.log(`🔴 Redis: ${process.env.REDIS_URL}`);
});

afterAll(() => {
  console.log('✅ Testes E2E finalizados');
});
