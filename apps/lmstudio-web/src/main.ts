import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'fs';
import { join } from 'path';
import express, { type Request, type Response } from 'express';
import { getNetworkAddresses } from './utils/getNetworkAdress';

async function bootstrap() {
  mkdirSync(join(__dirname, 'data'), { recursive: true });
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
  app.use('/api/openapi.json', (_req: Request, res: Response) => res.json(document));

  app.use('/ui', express.static(join(distRoot, 'ui', 'browser')));

  app.use(/^\/ui(\/.*)?$/, (_req: Request, res: Response) => {
    res.sendFile(join(distRoot, 'ui', 'browser', 'index.html'));
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = configService.get<number>('PORT', 3000);
  const host = configService.get<string>('HOST', '0.0.0.0');

  await app.listen(port, host);

  const isLan = host === '0.0.0.0' || host === '::';
  const localUrl = `http://localhost:${port}`;

  console.log('');
  console.log('🚀 LMStudio WebUI started');
  console.log('────────────────────────────');
  console.log(`Local:       ${localUrl}`);
  console.log(`UI:          ${localUrl}/ui`);
  console.log(`API:         ${localUrl}/api`);
  console.log(`Swagger:     ${localUrl}/api/docs`);

  if (isLan) {
    const ips = getNetworkAddresses();
    for (const ip of ips) {
      console.log(`Network:     http://${ip}:${port}`);
      console.log(`Network UI:  http://${ip}:${port}/ui`);
    }
  }

  console.log('────────────────────────────');
}

void bootstrap();
