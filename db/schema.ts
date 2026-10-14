import { sql } from "drizzle-orm";
import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Authentication itself is owned by the Sites dispatcher. This table stores
// only the TERRANDIP profile linked to that verified identity—never passwords,
// OAuth tokens, cookies, or session secrets.
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSignedInAt: text("last_signed_in_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("users_last_signed_in_at_idx").on(table.lastSignedInAt)],
);

// A bookmark belongs to the Supabase user verified by the server route. Only
// article metadata already shown by TERRANDIP is stored; no session tokens or
// provider credentials are persisted.
export const bookmarks = sqliteTable(
  "bookmarks",
  {
    userId: text("user_id").notNull(),
    articleId: text("article_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    url: text("url").notNull(),
    imageUrl: text("image_url"),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    publishedAt: text("published_at"),
    country: text("country").notNull(),
    category: text("category").notNull(),
    language: text("language"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.articleId] }),
    index("bookmarks_user_created_at_idx").on(table.userId, table.createdAt),
  ],
);
