import { randomUUID } from "node:crypto";

export type ChallengeFailure =
  | "unknown"
  | "expired"
  | "consumed"
  | "locked"
  | "route_mismatch"
  | "request_hash_mismatch";

export interface PaymentChallenge {
  challenge: string;
  requestHash: string;
  route: string;
  expiresAt: number;
}

interface StoredChallenge extends PaymentChallenge {
  state: "pending" | "locked" | "consumed";
  lockId?: string;
}

export type ChallengeResult =
  | { ok: true; challenge: PaymentChallenge; lockId?: string }
  | { ok: false; reason: ChallengeFailure };

export class InMemoryPaymentChallengeStore {
  constructor(
    private readonly ttlMs = 5 * 60_000,
    private readonly now: () => number = Date.now
  ) {}

  issue(challenge: string, requestHash: string, route: string): ChallengeResult {
    this.pruneExpired();
    const existing = this.entries.get(challenge);

    if (existing) {
      return this.validate(existing, requestHash, route);
    }

    const entry: StoredChallenge = {
      challenge,
      requestHash,
      route,
      expiresAt: this.now() + this.ttlMs,
      state: "pending"
    };
    this.entries.set(challenge, entry);
    return { ok: true, challenge: publicChallenge(entry) };
  }

  lock(challenge: string, requestHash: string, route: string): ChallengeResult {
    const entry = this.entries.get(challenge);
    if (!entry) {
      return { ok: false, reason: "unknown" };
    }

    const validation = this.validate(entry, requestHash, route);
    if (!validation.ok) {
      return validation;
    }

    if (entry.state === "locked") {
      return { ok: false, reason: "locked" };
    }

    if (entry.state === "consumed") {
      return { ok: false, reason: "consumed" };
    }

    const lockId = randomUUID();
    entry.state = "locked";
    entry.lockId = lockId;
    return {
      ok: true,
      challenge: publicChallenge(entry),
      lockId
    };
  }

  consume(challenge: string, lockId: string): boolean {
    const entry = this.entries.get(challenge);
    if (!entry || entry.state !== "locked" || entry.lockId !== lockId) {
      return false;
    }

    entry.state = "consumed";
    delete entry.lockId;
    return true;
  }

  release(challenge: string, lockId: string): boolean {
    const entry = this.entries.get(challenge);
    if (!entry || entry.state !== "locked" || entry.lockId !== lockId) {
      return false;
    }

    entry.state = "pending";
    delete entry.lockId;
    return true;
  }

  private readonly entries = new Map<string, StoredChallenge>();

  private validate(
    entry: StoredChallenge,
    requestHash: string,
    route: string
  ): ChallengeResult {
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(entry.challenge);
      return { ok: false, reason: "expired" };
    }

    if (entry.route !== route) {
      return { ok: false, reason: "route_mismatch" };
    }

    if (entry.requestHash !== requestHash) {
      return { ok: false, reason: "request_hash_mismatch" };
    }

    if (entry.state === "consumed") {
      return { ok: false, reason: "consumed" };
    }

    return { ok: true, challenge: publicChallenge(entry) };
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [challenge, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(challenge);
      }
    }
  }
}

function publicChallenge(entry: StoredChallenge): PaymentChallenge {
  return {
    challenge: entry.challenge,
    requestHash: entry.requestHash,
    route: entry.route,
    expiresAt: entry.expiresAt
  };
}
