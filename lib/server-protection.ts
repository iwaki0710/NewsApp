import type { NextRequest } from "next/server";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type RateWindow = {
  count: number;
  resetAt: number;
};

const rateWindows = new Map<string, RateWindow>();
const MAX_RATE_WINDOWS = 5_000;

export class TtlCache<T> {
  private entries = new Map<string, CacheEntry<T>>();

  constructor(private readonly maxEntries: number) {}

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    // Refresh insertion order so frequently used entries stay in the cache.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number) {
    this.entries.delete(key);
    this.entries.set(key, { expiresAt: Date.now() + ttlMs, value });
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey !== "string") break;
      this.entries.delete(oldestKey);
    }
  }
}

function clientIdentifier(request: NextRequest) {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp.slice(0, 80);

  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedIp) return forwardedIp.slice(0, 80);

  return "local-client";
}

export function takeRateLimit(
  request: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
) {
  return takeWindow(`${scope}:${clientIdentifier(request)}`, limit, windowMs);
}

export function takeGlobalBudget(scope: string, limit: number, windowMs: number) {
  return takeWindow(`global:${scope}`, limit, windowMs);
}

function takeWindow(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  let window = rateWindows.get(key);
  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + windowMs };
  }
  window.count += 1;
  rateWindows.set(key, window);

  if (rateWindows.size > MAX_RATE_WINDOWS) {
    for (const [entryKey, entry] of rateWindows) {
      if (entry.resetAt <= now || rateWindows.size > MAX_RATE_WINDOWS) {
        rateWindows.delete(entryKey);
      }
      if (rateWindows.size <= MAX_RATE_WINDOWS) break;
    }
  }

  return {
    allowed: window.count <= limit,
    limit,
    remaining: Math.max(0, limit - window.count),
    retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1_000)),
  };
}

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = request.nextUrl;
    return originUrl.host === requestUrl.host && originUrl.protocol === requestUrl.protocol;
  } catch {
    return false;
  }
}

export function safeHttpUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
