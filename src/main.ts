import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('Starting application...');
  console.log('Environment:');
  console.log(`PORT: ${process.env.PORT || '3000 (default)'}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'Defined (Starts with ' + process.env.DATABASE_URL.substring(0, 10) + '...)' : 'UNDEFINED'}`);

  if (!process.env.DATABASE_URL) {
    console.error('CRITICAL: DATABASE_URL is not defined. The application will likely fail to connect to the database.');
  }

  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
