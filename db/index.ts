import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let bookmarkSchemaPromise: Promise<void> | null = null;

function getD1() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return env.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export function ensureBookmarkSchema() {
  if (!bookmarkSchemaPromise) {
    const d1 = getD1();
    bookmarkSchemaPromise = d1.batch([
      d1.prepare(`CREATE TABLE IF NOT EXISTS bookmarks (
        user_id TEXT NOT NULL,
        article_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        url TEXT NOT NULL,
        image_url TEXT,
        source TEXT NOT NULL,
        source_url TEXT,
        published_at TEXT,
        country TEXT NOT NULL,
        category TEXT NOT NULL,
        language TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, article_id)
      )`),
      d1.prepare(
        "CREATE INDEX IF NOT EXISTS bookmarks_user_created_at_idx ON bookmarks (user_id, created_at)"
      ),
    ])
      .then(() => undefined)
      .catch((error) => {
        bookmarkSchemaPromise = null;
        throw error;
      });
  }

  return bookmarkSchemaPromise;
}
