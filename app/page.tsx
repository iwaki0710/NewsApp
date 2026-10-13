import type { Metadata } from "next";
import { ensureTerrandipAccount } from "../db/accounts";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "./chatgpt-auth";
import { NewsExplorer } from "./NewsExplorer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TERRANDIP — 世界のニュースを、偶然から。",
  description:
    "世界中のニュースから、今まで知らなかった一本にランダムで出会えるニュースルーレット。",
};

export default async function Home() {
  const user = await getChatGPTUser();
  let accountCreatedAt: string | null = null;
  let accountStorageReady = true;

  if (user) {
    try {
      const account = await ensureTerrandipAccount(user);
      accountCreatedAt = account.createdAt;
    } catch (error) {
      accountStorageReady = false;
      console.error("TERRANDIP account storage is unavailable", error);
    }
  }

  return (
    <NewsExplorer
      auth={{
        user: user ? { displayName: user.displayName, email: user.email } : null,
        signInPath: chatGPTSignInPath("/"),
        signOutPath: chatGPTSignOutPath("/"),
        accountCreatedAt,
        accountStorageReady,
      }}
    />
  );
}
