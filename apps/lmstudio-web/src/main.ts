import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // optional but recommended:
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LM Studio WebUI API')
    .setDescription('Server-centric API for a custom LM Studio WebUI (REST + SSE).')
    .setVersion('1.0.0')
    // later: cookie/session auth or bearer
    // .addCookieAuth("session", { type: "apiKey", in: "cookie", name: "sessionId" })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Expose raw OpenAPI JSON explicitly
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
  app.use('/api/openapi.json', (_req, res) => res.json(document));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);

  console.log(`LMStudio WebUI listening at http://localhost:3000`);
  console.log(`OpenAPI listening at http://localhost:3000/api/openapi.json`);
  console.log(`Swagger UI listening at http://localhost:3000/api/docs`);
  console.log(`Web UI listening at http://localhost:3000/ui`);
}

bootstrap();
