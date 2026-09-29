import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { corsOrigins, validateRuntime } from './runtime-config';

async function bootstrap(): Promise<void> {
  validateRuntime();
  const app = await NestFactory.create(AppModule);

  // Habilitar CORS - origens do site + header de sessão anônima (favoritos)
  app.enableCors({
    origin: corsOrigins(),
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Configurar ValidationPipe global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Remove propriedades não decoradas
      forbidNonWhitelisted: true, // Lança erro se houver propriedades não permitidas
      transform: true, // Transforma automaticamente payloads para DTOs
      transformOptions: {
        enableImplicitConversion: true, // Converte tipos automaticamente
      },
    }),
  );

  // Configurar ExceptionFilter global
  app.useGlobalFilters(new HttpExceptionFilter());

  // Configurar Swagger/OpenAPI
  const config = new DocumentBuilder()
    .setTitle('CarInsight API')
    .setDescription(
      'API para o CarInsight - Plataforma de busca e comparação de veículos',
    )
    .setVersion('1.0')
    .addTag('vehicles', 'Operações relacionadas a veículos')
    .addTag('users', 'Operações relacionadas a usuários')
    .addTag('dealers', 'Operações relacionadas a concessionárias')
    .addTag('interactions', 'Operações relacionadas a interações de usuários')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    customSiteTitle: 'CarInsight API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');

  console.log(JSON.stringify({ event: 'http.listening', port }));
}
void bootstrap();
