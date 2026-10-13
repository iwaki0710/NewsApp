import { NextRequest, NextResponse } from "next/server";
import {
  isSameOriginRequest,
  safeHttpUrl,
  takeGlobalBudget,
  takeRateLimit,
  TtlCache,
} from "../../../lib/server-protection";

export const dynamic = "force-dynamic";

const regionCountries: Record<string, string[]> = {
  world: ["jp", "us", "gb", "in", "de", "fr", "br", "au", "ca", "za", "ng", "sg", "ae", "mx", "it", "se", "nz", "ar", "eg", "id", "kr", "ke", "sa", "es", "cn"],
  asia: ["jp", "in", "sg", "id", "kr", "cn"],
  europe: ["gb", "de", "fr", "it", "se", "es"],
  americas: ["us", "ca", "br", "mx", "ar"],
  africa: ["za", "ng", "eg", "ke"],
  "middle-east": ["ae", "sa", "eg"],
  oceania: ["au", "nz"],
};

const allowedCategories = new Set([
  "top", "business", "technology", "science", "health", "environment",
  "politics", "sports", "entertainment",
]);
const allowedLanguages = new Set(["ja", "en", "es", "fr", "de", "pt", "zh", "ar"]);
const allowedCountryCodes = new Set(Object.values(regionCountries).flat());
const countryCodeAliases: Record<string, string> = {
  "united arab emirates": "ae", uae: "ae", argentina: "ar", australia: "au",
  brazil: "br", canada: "ca", china: "cn", germany: "de", egypt: "eg",
  spain: "es", france: "fr", "united kingdom": "gb", uk: "gb",
  indonesia: "id", india: "in", italy: "it", japan: "jp", kenya: "ke",
  "south korea": "kr", korea: "kr", mexico: "mx", nigeria: "ng",
  "new zealand": "nz", "saudi arabia": "sa", sweden: "se",
  singapore: "sg", "united states": "us", "united states of america": "us",
  usa: "us", "south africa": "za",
};
const newsCache = new TtlCache<NewsPayload>(400);
const NEWS_CACHE_MS = 10 * 60 * 1_000;

type RawArticle = {
  article_id?: string;
  title?: string;
  description?: string;
  link?: string;
  image_url?: string | null;
  source_name?: string;
  source_id?: string;
  source_url?: string | null;
  pubDate?: string | null;
  country?: string[];
  category?: string[];
  language?: string | null;
  duplicate?: boolean;
};

type NewsDataResponse = {
  status?: string;
  results?: RawArticle[];
  message?: string;
  nextPage?: string | null;
};

type Article = {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl: string | null;
  source: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  country: string[];
  category: string[];
  language: string | null;
};

type NewsPayload = {
  articles: Article[];
  pickedCountry: string;
  pickedCountries: string[];
  nextPage: string | null;
  cached?: boolean;
};

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function shuffled<T>(values: T[]) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function normalizeCountryCodes(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => safeText(value).toLowerCase())
    .map((value) => countryCodeAliases[value] || value)
    .filter((value, index, all) => allowedCountryCodes.has(value) && all.indexOf(value) === index);
}

function articleCountryForMode(
  rawCountries: unknown,
  pickedCountries: string[],
  mode: "single" | "mix",
) {
  const normalizedCountries = normalizeCountryCodes(rawCountries);
  const matchedCountry = pickedCountries.find((country) => normalizedCountries.includes(country));
  if (matchedCountry) return matchedCountry;

  // The upstream country filter remains authoritative when no country metadata
  // is supplied. Explicitly conflicting metadata is rejected below.
  if (!normalizedCountries.length && (!Array.isArray(rawCountries) || rawCountries.length === 0)) {
    return mode === "single" ? pickedCountries[0] : null;
  }
  return null;
}

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

function successResponse(payload: NewsPayload, cacheStatus: "HIT" | "MISS") {
  return NextResponse.json(
    { ...payload, cached: cacheStatus === "HIT" },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=120",
        "CDN-Cache-Control": "public, s-maxage=600, stale-while-revalidate=120",
        "X-TERRANDIP-Cache": cacheStatus,
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function GET(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return jsonError("このサイト以外からのリクエストは受け付けていません。", "INVALID_ORIGIN", 403);
  }

  const visitorLimit = takeRateLimit(request, "news", 40, 60_000);
  if (!visitorLimit.allowed) {
    return jsonError(
      `短時間の取得回数が多いため、一時停止しています。約${visitorLimit.retryAfterSeconds}秒後にお試しください。`,
      "RATE_LIMITED",
      429,
      visitorLimit.retryAfterSeconds,
    );
  }

  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) {
    return jsonError(
      "ニュースAPIの設定がまだ完了していません。管理者が NEWSDATA_API_KEY を設定する必要があります。",
      "CONFIGURATION",
      503,
    );
  }

  const requestedRegion = request.nextUrl.searchParams.get("region") || "world";
  const region = regionCountries[requestedRegion] ? requestedRegion : "world";
  const countries = regionCountries[region];
  const mode = request.nextUrl.searchParams.get("mode") === "mix" ? "mix" : "single";
  const requestedCountry = request.nextUrl.searchParams.get("country")?.toLowerCase() || "";
  const requestedCountries = (request.nextUrl.searchParams.get("countries") || "")
    .split(",")
    .map((country) => country.trim().toLowerCase())
    .filter((country, index, values) => countries.includes(country) && values.indexOf(country) === index)
    .slice(0, 5);
  const pickedCountries = mode === "mix"
    ? requestedCountries.length >= 2
      ? requestedCountries
      : shuffled(countries).slice(0, Math.min(5, countries.length))
    : [countries.includes(requestedCountry)
      ? requestedCountry
      : countries[Math.floor(Math.random() * countries.length)]];
  const pickedCountry = pickedCountries[0];
  const rawPage = request.nextUrl.searchParams.get("page") || "";
  const requestedPage = /^[A-Za-z0-9_-]{1,500}$/.test(rawPage) ? rawPage : "";
  const category = request.nextUrl.searchParams.get("category") || "all";
  const language = request.nextUrl.searchParams.get("language") || "auto";

  if (rawPage && !requestedPage) {
    return jsonError("ページ情報の形式が正しくありません。最初のページからやり直してください。", "INVALID_REQUEST", 400);
  }

  const cacheKey = JSON.stringify({
    mode,
    pickedCountries: [...pickedCountries].sort(),
    requestedPage,
    category: allowedCategories.has(category) ? category : "all",
    language: allowedLanguages.has(language) ? language : "auto",
  });
  const cachedPayload = newsCache.get(cacheKey);
  if (cachedPayload) return successResponse(cachedPayload, "HIT");

  // NewsData.io's free plan allows 30 credits per 15 minutes. Keep a margin for
  // retries and manual checks; cached responses do not consume this budget.
  const upstreamBudget = takeGlobalBudget("news-upstream", 24, 15 * 60_000);
  if (!upstreamBudget.allowed) {
    return jsonError(
      `ニュース取得枠を保護するため一時停止しています。約${upstreamBudget.retryAfterSeconds}秒後にお試しください。`,
      "SERVICE_BUDGET",
      429,
      upstreamBudget.retryAfterSeconds,
    );
  }

  const upstream = new URL("https://newsdata.io/api/1/latest");
  upstream.searchParams.set("apikey", apiKey);
  upstream.searchParams.set("country", pickedCountries.join(","));
  upstream.searchParams.set("size", "10");
  upstream.searchParams.set("removeduplicate", "1");
  if (requestedPage) upstream.searchParams.set("page", requestedPage);
  if (allowedCategories.has(category)) upstream.searchParams.set("category", category);
  if (allowedLanguages.has(language)) upstream.searchParams.set("language", language);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(upstream, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const data = (await response.json()) as NewsDataResponse;

    if (!response.ok || data.status === "error") {
      if (response.status === 401 || response.status === 403) {
        return jsonError("ニュースAPIの認証に失敗しました。管理者がAPIキーを確認してください。", "CONFIGURATION", 503);
      }
      if (response.status === 429) {
        return jsonError("ニュースAPIの利用上限に達しました。上限が回復してから再度お試しください。", "UPSTREAM_QUOTA", 429, 900);
      }
      return jsonError("ニュース配信サービスが一時的に応答していません。", "UPSTREAM_UNAVAILABLE", 502);
    }

    const seen = new Set<string>();
    const articles = (data.results || [])
      .filter((item) => !item.duplicate && safeText(item.title) && safeHttpUrl(item.link))
      .map((item, index): Article | null => {
        const url = safeHttpUrl(item.link);
        if (!url) return null;
        const title = safeText(item.title);
        const duplicateKey = `${url.replace(/\/$/, "").toLowerCase()}|${title.toLocaleLowerCase()}`;
        if (seen.has(duplicateKey)) return null;
        seen.add(duplicateKey);

        const articleCountry = articleCountryForMode(item.country, pickedCountries, mode);
        if (!articleCountry) return null;

        return {
          id: safeText(item.article_id, `${pickedCountries.join("-")}-${requestedPage || "first"}-${index}`),
          title,
          description: safeText(item.description).slice(0, 5_000),
          url,
          imageUrl: safeHttpUrl(item.image_url),
          source: safeText(item.source_name, safeText(item.source_id, "Unknown source")).slice(0, 200),
          sourceUrl: safeHttpUrl(item.source_url),
          publishedAt: safeText(item.pubDate).slice(0, 80) || null,
          // One canonical country keeps the two exploration modes unambiguous:
          // single-country pages can never be labelled as another country, while
          // mix pages only show countries that were selected for that mix.
          country: [articleCountry],
          category: Array.isArray(item.category) ? item.category.slice(0, 5).map((value) => safeText(value).slice(0, 80)) : [],
          language: safeText(item.language).slice(0, 20) || null,
        };
      })
      .filter((item): item is Article => item !== null);

    if (!articles.length) {
      return jsonError("この条件ではニュースが見つかりませんでした。国・カテゴリ・言語を変えてお試しください。", "NO_RESULTS", 404);
    }

    const payload: NewsPayload = {
      articles,
      pickedCountry,
      pickedCountries,
      nextPage: safeText(data.nextPage) || null,
    };
    newsCache.set(cacheKey, payload, NEWS_CACHE_MS);
    return successResponse(payload, "MISS");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError("ニュース配信サービスの応答に時間がかかっています。少し待ってからお試しください。", "UPSTREAM_TIMEOUT", 504);
    }
    return jsonError("ニュースサービスに接続できませんでした。通信環境をご確認ください。", "NETWORK_ERROR", 502);
  } finally {
    clearTimeout(timeout);
  }
}
