import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import { json } from "express";
import {
  RedactingLogger,
  ApiExceptionFilter,
  requestIdMiddleware,
} from "@loccoc/common";
import { AppModule } from "./app.module.js";

const app = await NestFactory.create(AppModule, {
  logger: new RedactingLogger(),
  bodyParser: false,
});
app.use(json({ limit: "16kb" }));
app.use(requestIdMiddleware);
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  }),
);
app.useGlobalFilters(new ApiExceptionFilter());
app.enableShutdownHooks();
await app.listen(
  app.get(ConfigService).get<number>("MOMENT_PORT", 8088),
  app.get(ConfigService).get<string>("SERVICE_BIND_HOST", "127.0.0.1"),
);
