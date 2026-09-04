import "server-only";

import { randomUUID } from "node:crypto";

type LogContext = Record<
  string,
  boolean | number | string | null | undefined
>;

export function createOperationId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function logOperationalInfo(
  event: string,
  context: LogContext = {},
): void {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event,
      ...withoutUndefined(context),
    }),
  );
}

export function logOperationalError(
  event: string,
  error: unknown,
  context: LogContext = {},
): void {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event,
      ...withoutUndefined(context),
      error: serializeError(error),
    }),
  );
}

function serializeError(error: unknown, depth = 0): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  const extended = error as Error & {
    code?: unknown;
    $metadata?: {
      httpStatusCode?: unknown;
      requestId?: unknown;
      attempts?: unknown;
    };
  };
  return {
    name: error.name,
    message: error.message,
    ...(extended.code !== undefined ? { code: String(extended.code) } : {}),
    ...(extended.$metadata
      ? {
          aws: {
            httpStatusCode: extended.$metadata.httpStatusCode,
            requestId: extended.$metadata.requestId,
            attempts: extended.$metadata.attempts,
          },
        }
      : {}),
    ...(depth === 0 && error.stack ? { stack: error.stack } : {}),
    ...(error.cause !== undefined
      ? { cause: serializeError(error.cause, depth + 1) }
      : {}),
  };
}

function withoutUndefined(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined),
  );
}
