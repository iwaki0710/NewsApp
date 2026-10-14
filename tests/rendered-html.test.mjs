import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sanitizeBookmarkArticle } from "../lib/bookmark-validation.js";
import { articleCountryForMode, normalizeArticleCountries } from "../lib/news-country.js";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("uses Supabase email-code and Google authentication", async () => {
  const [page, authContext, accountPanel] = await Promise.all([
    source("app/page.tsx"),
    source("app/auth-context.tsx"),
    source("app/AccountPanel.tsx"),
  ]);

  assert.match(page, /<AuthProvider>/);
  assert.match(authContext, /signInWithOtp/);
  assert.match(authContext, /provider:\s*"google"/);
  assert.match(accountPanel, /6桁の認証コード/);
  assert.doesNotMatch(page, /chatgpt-auth|ChatGPT/);
});

test("keeps external API credentials on server routes", async () => {
  const [newsRoute, translateRoute, envExample] = await Promise.all([
    source("app/api/news/route.ts"),
    source("app/api/translate/route.ts"),
    source(".env.example"),
  ]);

  assert.match(newsRoute, /process\.env\.NEWSDATA_API_KEY/);
  assert.match(translateRoute, /process\.env\.DEEPL_API_KEY/);
  assert.match(newsRoute, /isSameOriginRequest/);
  assert.match(translateRoute, /takeRateLimit/);
  assert.doesNotMatch(envExample, /^NEWSDATA_API_KEY=.+$/m);
  assert.doesNotMatch(envExample, /^DEEPL_API_KEY=.+$/m);
});

test("preserves the two distinct exploration modes", async () => {
  const explorer = await source("app/NewsExplorer.tsx");

  assert.match(explorer, /1カ国深掘り/);
  assert.match(explorer, /世界ミックス/);
  assert.match(explorer, /scrollToNewsListTop/);
  assert.match(explorer, /記事を翻訳/);
});

test("single-country mode rejects missing, foreign, and multi-country metadata", () => {
  assert.deepEqual(normalizeArticleCountries(["Japan", "japan", "unknown"]), ["jp"]);
  assert.equal(articleCountryForMode(["japan"], ["jp"], "single"), "jp");
  assert.equal(articleCountryForMode(["japan", "united states"], ["jp"], "single"), null);
  assert.equal(articleCountryForMode(["united states"], ["jp"], "single"), null);
  assert.equal(articleCountryForMode([], ["jp"], "single"), null);
  assert.equal(articleCountryForMode(undefined, ["jp"], "single"), null);
});

test("mix mode still accepts an article matching any selected country", () => {
  assert.equal(articleCountryForMode(["japan", "germany"], ["jp", "us"], "mix"), "jp");
  assert.equal(articleCountryForMode(["france"], ["jp", "us"], "mix"), null);
});

test("protects bookmarks with verified Supabase identity and per-user D1 queries", async () => {
  const [route, schema, database, explorer] = await Promise.all([
    source("app/api/bookmarks/route.ts"),
    source("db/schema.ts"),
    source("db/index.ts"),
    source("app/NewsExplorer.tsx"),
  ]);

  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /eq\(bookmarks\.userId, auth\.user\.id\)/);
  assert.match(route, /MAX_BOOKMARKS_PER_USER/);
  assert.match(schema, /primaryKey\(\{ columns: \[table\.userId, table\.articleId\] \}\)/);
  assert.match(route, /await ensureBookmarkSchema\(\)/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS bookmarks/);
  assert.match(database, /CREATE INDEX IF NOT EXISTS bookmarks_user_created_at_idx/);
  assert.match(explorer, /auth\.user && \(/);
  assert.match(explorer, /\/api\/bookmarks/);
  assert.match(explorer, /bookmark-toast/);
  assert.doesNotMatch(explorer, /localStorage|sessionStorage/);
});

test("rejects unsafe or incomplete bookmark payloads", () => {
  const valid = sanitizeBookmarkArticle({
    id: "article-1",
    title: "Example",
    description: "Summary",
    url: "https://example.com/story",
    imageUrl: "javascript:alert(1)",
    source: "Example News",
    sourceUrl: "https://example.com",
    publishedAt: "2026-10-14 00:00:00",
    country: ["jp", "jp"],
    category: ["top"],
    language: "japanese",
  });

  assert.equal(valid?.imageUrl, null);
  assert.deepEqual(valid?.country, ["jp"]);
  assert.equal(sanitizeBookmarkArticle({ id: "x", title: "No URL", source: "Source" }), null);
  assert.equal(sanitizeBookmarkArticle({ id: "x", title: "Bad URL", source: "Source", url: "file:///tmp/a" }), null);
});
