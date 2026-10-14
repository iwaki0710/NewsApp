import type { Metadata } from "next";
import { AuthProvider } from "./auth-context";
import { NewsExplorer } from "./NewsExplorer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TERRANDIP — 世界のニュースを、偶然から。",
  description:
    "世界中のニュースから、今まで知らなかった一本にランダムで出会えるニュースルーレット。",
};

export default function Home() {
  return (
    <AuthProvider>
      <NewsExplorer />
    </AuthProvider>
  );
}
