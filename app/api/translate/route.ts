import { NextRequest, NextResponse } from "next/server";
import {
  isSameOriginRequest,
  sha256,
  takeGlobalBudget,
  takeRateLimit,
  TtlCache,
} from "../../../lib/server-protection";

export const dynamic = "force-dynamic";

const allowedTargets = new Set(["JA", "EN-US", "ES", "FR", "DE", "IT", "PT-BR", "ZH", "KO"]);
const translationCache = new TtlCache<string>(2_000);
const TRANSLATION_CACHE_MS = 24 * 60 * 60 * 1_000;

type DeepLResponse = {
  translations?: Array<{ detected_source_language?: string; text?: string }>;
};

function jsonError(
  error: string,
  errorCode: string,
  status: number,
  retryAfterSeconds?: number,
) {
  return NextResponse.json(
    { error, errorCode, retryAfterSeconds },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
      },
    },
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return jsonError("このサイト以外からの翻訳リクエストは受け付けていません。", "INVALID_ORIGIN", 403);
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonError("翻訳リクエストの形式が正しくありません。", "INVALID_REQUEST", 415);
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 50_000) {
    return jsonError("一度に翻訳できる文章量を超えています。", "INVALID_REQUEST", 413);
  }

  const visitorLimit = takeRateLimit(request, "translate", 12, 10 * 60_000);
  if (!visitorLimit.allowed) {
    return jsonError(
      `短時間の翻訳回数が多いため、一時停止しています。約${visitorLimit.retryAfterSeconds}秒後にお試しください。`,
      "RATE_LIMITED",
      429,
      visitorLimit.retryAfterSeconds,
    );
  }

  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    return jsonError(
      "翻訳APIの設定がまだ完了していません。管理者が DEEPL_API_KEY を設定する必要があります。",
      "CONFIGURATION",
      503,
    );
  }

  let body: { texts?: unknown; targetLanguage?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("翻訳リクエストの形式が正しくありません。", "INVALID_REQUEST", 400);
  }

  const texts = Array.isArray(body.texts)
    ? body.texts
      .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
      .map((text) => text.trim())
      .slice(0, 20)
    : [];
  const targetLanguage = typeof body.targetLanguage === "string" ? body.targetLanguage.toUpperCase() : "";
  const totalCharacters = texts.reduce((total, text) => total + text.length, 0);

  if (
    !texts.length
    || texts.some((text) => text.length > 5_000)
    || totalCharacters > 30_000
    || !allowedTargets.has(targetLanguage)
  ) {
    return jsonError("翻訳する文章または言語の指定が正しくありません。", "INVALID_REQUEST", 400);
  }

  const cacheKeys = await Promise.all(texts.map((text) => sha256(`${targetLanguage}\u0000${text}`)));
  const resolved = new Map<string, string>();
  const pending = new Map<string, string>();
  cacheKeys.forEach((key, index) => {
    const cached = translationCache.get(key);
    if (cached !== null) resolved.set(key, cached);
    else if (!pending.has(key)) pending.set(key, texts[index]);
  });

  if (!pending.size) {
    return NextResponse.json(
      { translations: cacheKeys.map((key) => resolved.get(key) || ""), detectedLanguage: null, cached: true },
      { headers: { "Cache-Control": "private, no-store, max-age=0", "X-TERRANDIP-Cache": "HIT", "X-Content-Type-Options": "nosniff" } },
    );
  }

  const upstreamBudget = takeGlobalBudget("translate-upstream", 30, 15 * 60_000);
  if (!upstreamBudget.allowed) {
    return jsonError(
      `翻訳APIの利用枠を保護するため一時停止しています。約${upstreamBudget.retryAfterSeconds}秒後にお試しください。`,
      "SERVICE_BUDGET",
      429,
      upstreamBudget.retryAfterSeconds,
    );
  }

  const endpoint = apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
  const pendingEntries = Array.from(pending.entries());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ text: pendingEntries.map(([, text]) => text), target_lang: targetLanguage }),
      cache: "no-store",
      signal: controller.signal,
    });
    const data = (await response.json()) as DeepLResponse;

    if (!response.ok || data.translations?.length !== pendingEntries.length) {
      if (response.status === 401 || response.status === 403) {
        return jsonError("翻訳APIの認証に失敗しました。管理者がAPIキーを確認してください。", "CONFIGURATION", 503);
      }
      if (response.status === 429 || response.status === 456) {
        return jsonError("翻訳APIの利用上限に達しました。上限が回復してから再度お試しください。", "UPSTREAM_QUOTA", 429, 900);
      }
      return jsonError("翻訳サービスが一時的に応答していません。原文のままお読みください。", "UPSTREAM_UNAVAILABLE", 502);
    }

    pendingEntries.forEach(([key], index) => {
      const translatedText = data.translations?.[index]?.text || "";
      resolved.set(key, translatedText);
      translationCache.set(key, translatedText, TRANSLATION_CACHE_MS);
    });

    return NextResponse.json(
      {
        translations: cacheKeys.map((key) => resolved.get(key) || ""),
        detectedLanguage: data.translations?.[0]?.detected_source_language || null,
        cached: false,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0", "X-TERRANDIP-Cache": "MISS", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError("翻訳サービスの応答に時間がかかっています。原文のままお読みください。", "UPSTREAM_TIMEOUT", 504);
    }
    return jsonError("翻訳サービスに接続できませんでした。原文のままお読みください。", "NETWORK_ERROR", 502);
  } finally {
    clearTimeout(timeout);
  }
}
