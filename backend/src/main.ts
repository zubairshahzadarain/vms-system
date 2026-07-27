import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app.module';
import { MEDIA_ROOT } from './media/media.paths';
import { mediaAuthMiddleware } from './media/media-auth.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();

  // Serialize BigInt (recording file sizes) in JSON responses
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };

  // Protected static media (HLS live streams, recordings, snapshots, keyframes).
  // Auth via httpOnly cookie or Authorization header; viewers restricted to assigned cameras.
  app.use('/media', mediaAuthMiddleware(app), express.static(MEDIA_ROOT, { fallthrough: false }));

  const config = new DocumentBuilder()
    .setTitle('VMS API')
    .setDescription(
      'Video Management System REST API — authentication, RBAC, camera management, live streaming (HLS), recording & playback, keyframes, events, search and audit logs.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('vms_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'VMS API Docs',
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  Logger.log(`VMS backend listening on :${port}`, 'Bootstrap');
}
bootstrap();
