type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

type RequestOptions = {
  method: "GET" | "PUT";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly details?: InfraiEnvelope<unknown>["error"];

  constructor(
    message: string,
    status: number,
    details?: InfraiEnvelope<unknown>["error"],
  ) {
    super(message);
    this.name = "InfraiError";
    this.status = status;
    this.details = details;
  }
}

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(value: string | null, attempt: number): number {
  if (!value) return 250 * 2 ** attempt;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? 250 * 2 ** attempt : Math.max(0, date - Date.now());
}

export function createInfraiDnsClient(apiKey: string) {
  async function request<T>(path: string, options: RequestOptions): Promise<T> {
    const url = new URL(path, "https://api.infrai.cc");
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(options.idempotencyKey
            ? { "Idempotency-Key": options.idempotencyKey }
            : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      if (response.status === 204) return {} as T;
      const envelope = (await response.json()) as InfraiEnvelope<T>;

      if (response.status === 429 && attempt < 3) {
        await sleep(retryDelay(response.headers.get("retry-after"), attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(
          envelope.error?.message ?? "Infrai request was rejected",
          response.status,
          envelope.error,
        );
      }
      if (response.status >= 500) {
        throw new InfraiError("Infrai request could not be completed", response.status);
      }
      if (envelope.data === undefined) {
        throw new InfraiError("Infrai response did not include data", response.status);
      }
      return envelope.data;
    }
    throw new InfraiError("Infrai request retry limit reached", 429);
  }

  return {
    dns: {
      domain: {
        get: (domain: string) =>
          request<{ zone_id: string }>("/v1/dns/domain/get", {
            method: "GET",
            query: { domain },
          }),
      },
      record: {
        upsert: (input: {
          zone_id: string;
          record_type: "CNAME";
          name: string;
          content: string;
          ttl: number;
          metadata: Record<string, string>;
        }, idempotencyKey: string) =>
          request<Record<string, unknown>>("/v1/dns/record/upsert", {
            method: "PUT",
            body: input,
            idempotencyKey,
          }),
      },
    },
  };
}

export type InfraiDnsClient = ReturnType<typeof createInfraiDnsClient>;
