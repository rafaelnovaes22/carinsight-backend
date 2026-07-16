import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  console.log('Starting application...');
  console.log('Environment:');
  console.log(`PORT: ${process.env.PORT || '3000 (default)'}`);
  console.log(
    `DATABASE_URL: ${process.env.DATABASE_URL ? 'Defined (Starts with ' + process.env.DATABASE_URL.substring(0, 10) + '...)' : 'UNDEFINED'}`,
  );

  if (!process.env.DATABASE_URL) {
    console.error(
      'CRITICAL: DATABASE_URL is not defined. The application will likely fail to connect to the database.',
    );
  }

  const app = await NestFactory.create(AppModule);

  // Habilitar CORS - origens do site + header de sessão anônima (favoritos)
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? ['https://carinsight.com.br', 'https://www.carinsight.com.br']
        : true,
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
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api`);
}
void bootstrap();
