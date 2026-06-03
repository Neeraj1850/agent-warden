import express from "express";
import { randomUUID } from "node:crypto";
import type { ApiEnv } from "./config/env.js";
import { createAnalyzeRouter } from "./routes/analyze.route.js";
import { createHealthRouter } from "./routes/health.route.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { installX402Middleware } from "./middleware/x402.middleware.js";

export async function createApiServer(env: ApiEnv): Promise<express.Express> {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use(noStoreMiddleware);
  app.use(requestLogMiddleware);
  await installX402Middleware(app, env);
  app.use(createHealthRouter());
  app.use(createAnalyzeRouter());
  app.use(errorMiddleware);

  return app;
}

function noStoreMiddleware(
  _request: express.Request,
  response: express.Response,
  next: express.NextFunction
): void {
  response.setHeader("cache-control", "no-store");
  next();
}

function requestLogMiddleware(
  request: express.Request,
  _response: express.Response,
  next: express.NextFunction
): void {
  const requestId =
    typeof request.headers["x-request-id"] === "string"
      ? request.headers["x-request-id"]
      : randomUUID();

  responseLocals(request).requestId = requestId;
  console.log(`[api] request ${requestId} ${request.method} ${request.path}`);
  next();
}

export function responseLocals(request: express.Request): {
  requestId: string;
} {
  return request.res?.locals as { requestId: string };
}

export function jsonStringify(value: unknown): string {
  return JSON.stringify(value, bigintJsonReplacer, 2);
}

function bigintJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
