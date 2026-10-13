import { sql } from "drizzle-orm";
import type { ChatGPTUser } from "../app/chatgpt-auth";
import { getDb } from ".";
import { users } from "./schema";

export type TerrandipAccount = {
  id: string;
  createdAt: string;
};

export async function ensureTerrandipAccount(user: ChatGPTUser): Promise<TerrandipAccount> {
  const email = user.email.trim().toLowerCase().slice(0, 320);
  const displayName = user.displayName.trim().slice(0, 200) || email;
  if (!email || !email.includes("@")) {
    throw new Error("Verified account email is unavailable.");
  }

  const db = getDb();
  const [account] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email,
      displayName,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        displayName,
        lastSignedInAt: sql`CURRENT_TIMESTAMP`,
      },
    })
    .returning({ id: users.id, createdAt: users.createdAt });

  if (!account) throw new Error("Account could not be created.");
  return account;
}
