import { and, count, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ensureBookmarkSchema, getDb } from "../../../db";
import { bookmarks } from "../../../db/schema";
import { sanitizeBookmarkArticle } from "../../../lib/bookmark-validation.js";
import { isSameOriginRequest, takeRateLimit } from "../../../lib/server-protection";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_BOOKMARKS_PER_USER = 200;
const MAX_REQUEST_BYTES = 50_000;

function json(data: unknown, status = 200, retryAfterSeconds?: number) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
    },
  });
}

function error(message: string, errorCode: string, status: number, retryAfterSeconds?: number) {
  return json({ error: message, errorCode, retryAfterSeconds }, status, retryAfterSeconds);
}

async function verifiedUser(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return { response: error("このサイト以外からの操作は受け付けていません。", "INVALID_ORIGIN", 403) };
  }

  const visitorLimit = takeRateLimit(request, "bookmarks", 90, 60_000);
  if (!visitorLimit.allowed) {
    return {
      response: error(
        `短時間の操作回数が多いため、一時停止しています。約${visitorLimit.retryAfterSeconds}秒後にお試しください。`,
        "RATE_LIMITED",
        429,
        visitorLimit.retryAfterSeconds,
      ),
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { response: error("認証サービスの設定が完了していません。", "CONFIGURATION", 503) };
  }

  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) {
    return { response: error("ブックマークを利用するにはログインしてください。", "UNAUTHORIZED", 401) };
  }

  return { user: data.user };
}

function parseStoredArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rowToArticle(row: typeof bookmarks.$inferSelect) {
  return {
    id: row.articleId,
    title: row.title,
    description: row.description,
    url: row.url,
    imageUrl: row.imageUrl,
    source: row.source,
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt,
    country: parseStoredArray(row.country),
    category: parseStoredArray(row.category),
    language: row.language,
    savedAt: row.createdAt,
  };
}

export async function GET(request: NextRequest) {
  const auth = await verifiedUser(request);
  if (auth.response) return auth.response;

  try {
    await ensureBookmarkSchema();
    const rows = await getDb()
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, auth.user.id))
      .orderBy(desc(bookmarks.createdAt))
      .limit(MAX_BOOKMARKS_PER_USER);

    return json({ bookmarks: rows.map(rowToArticle) });
  } catch (databaseError) {
    console.error("Bookmark read failed", databaseError);
    return error("ブックマークを読み込めませんでした。時間をおいて再度お試しください。", "DATABASE_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifiedUser(request);
  if (auth.response) return auth.response;

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return error("保存するデータが大きすぎます。", "INVALID_REQUEST", 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("保存内容の形式が正しくありません。", "INVALID_REQUEST", 400);
  }

  if (JSON.stringify(body).length > MAX_REQUEST_BYTES) {
    return error("保存するデータが大きすぎます。", "INVALID_REQUEST", 413);
  }

  const article = sanitizeBookmarkArticle(body);
  if (!article) {
    return error("この記事はブックマークできません。", "INVALID_REQUEST", 400);
  }

  try {
    await ensureBookmarkSchema();
    const db = getDb();
    const existing = await db
      .select({ articleId: bookmarks.articleId })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, auth.user.id), eq(bookmarks.articleId, article.id)))
      .limit(1);

    if (!existing.length) {
      const [result] = await db
        .select({ value: count() })
        .from(bookmarks)
        .where(eq(bookmarks.userId, auth.user.id));
      if ((result?.value || 0) >= MAX_BOOKMARKS_PER_USER) {
        return error(`ブックマークは最大${MAX_BOOKMARKS_PER_USER}件まで保存できます。`, "BOOKMARK_LIMIT", 409);
      }
    }

    await db
      .insert(bookmarks)
      .values({
        userId: auth.user.id,
        articleId: article.id,
        title: article.title,
        description: article.description,
        url: article.url,
        imageUrl: article.imageUrl,
        source: article.source,
        sourceUrl: article.sourceUrl,
        publishedAt: article.publishedAt,
        country: JSON.stringify(article.country),
        category: JSON.stringify(article.category),
        language: article.language,
      })
      .onConflictDoUpdate({
        target: [bookmarks.userId, bookmarks.articleId],
        set: {
          title: article.title,
          description: article.description,
          url: article.url,
          imageUrl: article.imageUrl,
          source: article.source,
          sourceUrl: article.sourceUrl,
          publishedAt: article.publishedAt,
          country: JSON.stringify(article.country),
          category: JSON.stringify(article.category),
          language: article.language,
        },
      });

    const [saved] = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, auth.user.id), eq(bookmarks.articleId, article.id)))
      .limit(1);

    return json({ bookmark: saved ? rowToArticle(saved) : { ...article, savedAt: new Date().toISOString() } }, 201);
  } catch (databaseError) {
    console.error("Bookmark write failed", databaseError);
    return error("ブックマークを保存できませんでした。時間をおいて再度お試しください。", "DATABASE_ERROR", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await verifiedUser(request);
  if (auth.response) return auth.response;

  const articleId = request.nextUrl.searchParams.get("articleId")?.trim().slice(0, 240) || "";
  if (!articleId) {
    return error("削除する記事が指定されていません。", "INVALID_REQUEST", 400);
  }

  try {
    await ensureBookmarkSchema();
    await getDb()
      .delete(bookmarks)
      .where(and(eq(bookmarks.userId, auth.user.id), eq(bookmarks.articleId, articleId)));
    return json({ ok: true });
  } catch (databaseError) {
    console.error("Bookmark delete failed", databaseError);
    return error("ブックマークを削除できませんでした。時間をおいて再度お試しください。", "DATABASE_ERROR", 500);
  }
}
