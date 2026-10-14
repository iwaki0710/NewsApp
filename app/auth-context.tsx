"use client";

import type { User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getBrowserSupabaseClient } from "../lib/supabase/client";

type AuthResult = { ok: true } | { ok: false; message: string };

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  displayName: string | null;
  providerLabel: string | null;
  sendEmailCode(email: string): Promise<AuthResult>;
  verifyEmailCode(email: string, code: string): Promise<AuthResult>;
  signInWithGoogle(): Promise<AuthResult>;
  signOut(): Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate") || normalized.includes("too many")) {
    return "短時間の送信回数が多いため、少し待ってからお試しください。";
  }
  if (normalized.includes("expired") || normalized.includes("invalid")) {
    return "認証コードが正しくないか、有効期限が切れています。";
  }
  if (normalized.includes("provider") || normalized.includes("unsupported")) {
    return "このログイン方法はまだ有効になっていません。管理者設定をご確認ください。";
  }
  return "認証処理を完了できませんでした。時間をおいてもう一度お試しください。";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => getBrowserSupabaseClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(data.user ?? null);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const sendEmailCode = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: "認証サービスの設定が完了していません。" };
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || normalizedEmail.length > 320) {
      return { ok: false, message: "正しいメールアドレスを入力してください。" };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: true },
    });
    return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true };
  }, [supabase]);

  const verifyEmailCode = useCallback(async (email: string, code: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: "認証サービスの設定が完了していません。" };
    const token = code.replace(/\D/g, "").slice(0, 6);
    if (token.length !== 6) {
      return { ok: false, message: "メールに届いた6桁の認証コードを入力してください。" };
    }
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "email",
    });
    return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true };
  }, [supabase]);

  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: "認証サービスの設定が完了していません。" };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
    return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true };
  }, [supabase]);

  const signOut = useCallback(async (): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: "認証サービスの設定が完了していません。" };
    const { error } = await supabase.auth.signOut({ scope: "local" });
    return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true };
  }, [supabase]);

  const displayName = user
    ? String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || "TERRANDIP USER")
    : null;
  const provider = user?.app_metadata?.provider;
  const providerLabel = provider === "google" ? "Google" : provider === "email" ? "メール認証コード" : provider || null;

  return (
    <AuthContext.Provider value={{
      configured: Boolean(supabase),
      loading,
      user,
      displayName,
      providerLabel,
      sendEmailCode,
      verifyEmailCode,
      signInWithGoogle,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useTerrandipAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useTerrandipAuth must be used inside AuthProvider");
  return value;
}
