export interface JsonRpcClient {
  request<T>(method: string, params?: unknown[]): Promise<T>;
}

export interface FetchJsonRpcClientOptions {
  rpcUrl: string;
  timeoutMs?: number;
}

export class FetchJsonRpcClient implements JsonRpcClient {
  private requestId = 0;

  constructor(private readonly options: FetchJsonRpcClientOptions) {}

  async request<T>(method: string, params: unknown[] = []): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 10_000
    );

    try {
      const response = await fetch(this.options.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++this.requestId,
          method,
          params
        })
      });
      const body = (await response.json()) as {
        result?: T;
        error?: { message?: string; data?: unknown };
      };

      if (!response.ok || body.error) {
        throw new JsonRpcError(
          body.error?.message ?? `JSON-RPC request failed: ${response.status}`,
          body.error?.data
        );
      }

      return body.result as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class JsonRpcError extends Error {
  constructor(
    message: string,
    readonly data?: unknown
  ) {
    super(message);
    this.name = "JsonRpcError";
  }
}

export function toRpcQuantity(
  value: bigint | number | string | undefined
): `0x${string}` {
  if (value === undefined) {
    return "0x0";
  }

  return `0x${BigInt(value).toString(16)}`;
}

export function optionalRpcQuantity(
  value: bigint | number | string | undefined
): `0x${string}` | undefined {
  if (value === undefined || value === "0" || value === 0 || value === 0n) {
    return undefined;
  }

  return toRpcQuantity(value);
}

export function parseRpcQuantity(value: string | undefined): bigint {
  if (!value) {
    return 0n;
  }

  return BigInt(value);
}
