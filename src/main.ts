import './instrument';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // rawBody keeps the exact bytes Paystack signed, for webhook verification.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  // Render sits in front of the app; trust its proxy so rate limits key on the real client IP.
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  const isProd = process.env.NODE_ENV === 'production';
  const origins = process.env.ALLOWED_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (isProd && !origins?.length) {
    throw new Error('ALLOWED_ORIGINS must be set in production');
  }
  app.enableCors({ origin: origins?.length ? origins : true, credentials: true });

  const swaggerEnabled = process.env.SWAGGER_ENABLED
    ? process.env.SWAGGER_ENABLED === 'true'
    : !isProd;
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Arena API')
      .setDescription('Arena gaming platform backend API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`Arena API running on port ${port}`);
  if (swaggerEnabled) logger.log(`Swagger: http://localhost:${port}/docs`);
}

bootstrap();
