import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Authentication itself is owned by the Sites dispatcher. This table stores
// only the WORLDHOP profile linked to that verified identity—never passwords,
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
