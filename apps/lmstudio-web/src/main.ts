import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'fs';
import { join } from 'path';
import express from 'express';

async function bootstrap() {
  mkdirSync(join(__dirname, 'data'), { recursive: true });
  const app = await NestFactory.create(AppModule);

  const distRoot = join(__dirname);

  app.setGlobalPrefix('api', {
    exclude: ['ui', 'ui/*'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LM Studio WebUI API')
    .setDescription('Server-centric API for a custom LM Studio WebUI (REST + SSE).')
    .setVersion('1.0.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const configService = app.get(ConfigService);

  app.enableShutdownHooks();

  // Expose OpenAPI JSON explicitly
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  app.use('/api/openapi.json', (_req, res) => res.json(document));

  app.use('/ui', express.static(join(distRoot, 'ui', 'browser')));

  app.use(/^\/ui(\/.*)?$/, (req, res) => {
    res.sendFile(join(distRoot, 'ui', 'browser', 'index.html'));
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(configService.get<number>('PORT', 3000));

  console.log(`LMStudio WebUI listening at http://localhost:3000`);
  console.log(`OpenAPI listening at http://localhost:3000/api/openapi.json`);
  console.log(`Swagger UI listening at http://localhost:3000/api/docs`);
  console.log(`Web UI listening at http://localhost:3000/ui`);
}

bootstrap();
