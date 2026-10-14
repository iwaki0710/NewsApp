import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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
