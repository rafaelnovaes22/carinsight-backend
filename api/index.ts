import express from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { corsOrigins, validateRuntime } from '../src/runtime-config';

// Vercel Function: app única reusada entre invocações para amortizar o cold start
let readyServer: Promise<express.Express> | null = null;

async function createExpressServer(): Promise<express.Express> {
  validateRuntime();
  const server = express();
  const adapter = new ExpressAdapter(server);
  const app = await NestFactory.create(AppModule, adapter, { logger: false });
  app.enableCors({
    origin: corsOrigins(),
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
    methods: 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  return server;
}

export default async function vercelHandler(
  req: express.Request,
  res: express.Response,
): Promise<void> {
  readyServer ??= createExpressServer();
  try {
    const server = await readyServer;
    server(req, res);
  } catch (error) {
    // Boot quebrado não pode envenenar o container: descarta e loga estruturado
    readyServer = null;
    console.error(
      JSON.stringify({ event: 'cold_start_failed', error: String(error) }),
    );
    res.status(500).json({ statusCode: 500, message: 'cold_start_failed' });
  }
}
