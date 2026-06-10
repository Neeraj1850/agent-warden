import { createHash } from "node:crypto";

export function hashBoundRequest(route: string, body: unknown): `0x${string}` {
  const canonical = stableStringify({
    route: normalizeRoute(route),
    body
  });

  return `0x${createHash("sha256").update(canonical).digest("hex")}`;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeValue(entry)])
    );
  }

  return value;
}
