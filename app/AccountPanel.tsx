"use client";

import { useState, type FormEvent } from "react";
import { useTerrandipAuth } from "./auth-context";

function formatAccountDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function AccountPanel({ onClose }: { onClose(): void }) {
  const auth = useTerrandipAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const result = await auth.sendEmailCode(email);
    setSubmitting(false);
    setIsError(!result.ok);
    if (result.ok) {
      setCodeSent(true);
      setMessage("6桁の認証コードをメールへ送信しました。");
    } else {
      setMessage(result.message);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const result = await auth.verifyEmailCode(email, code);
    setSubmitting(false);
    setIsError(!result.ok);
    setMessage(result.ok ? "ログインしました。" : result.message);
  }

  async function googleLogin() {
    setSubmitting(true);
    setMessage(null);
    const result = await auth.signInWithGoogle();
    if (!result.ok) {
      setSubmitting(false);
      setIsError(true);
      setMessage(result.message);
    }
  }

  async function logout() {
    setSubmitting(true);
    const result = await auth.signOut();
    setSubmitting(false);
    setIsError(!result.ok);
    setMessage(result.ok ? "ログアウトしました。" : result.message);
  }

  return (
    <div className="account-backdrop" onMouseDown={onClose}>
      <section
        className="account-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="account-close" onClick={onClose} aria-label="アカウント画面を閉じる">×</button>
        <span className="account-kicker">TERRANDIP ACCOUNT</span>

        {auth.loading ? (
          <div className="account-auth-loading" role="status">ログイン状態を確認しています…</div>
        ) : auth.user ? (
          <>
            <div className="account-identity">
              <i>{(auth.displayName || "T").slice(0, 1).toUpperCase()}</i>
              <div>
                <span>ログイン中</span>
                <h2 id="account-title">{auth.displayName}</h2>
                <p>{auth.user.email}</p>
              </div>
            </div>
            <div className="account-security-grid">
              <div><span>ACCOUNT CREATED</span><b>{formatAccountDate(auth.user.created_at)}</b></div>
              <div><span>LOGIN METHOD</span><b>{auth.providerLabel || "安全な外部認証"}</b></div>
            </div>
            <div className="account-safe-note">
              <b>パスワードを保存しない設計</b>
              <p>本人確認はSupabase Authが担当します。TERRANDIPはパスワードを収集・保存しません。</p>
            </div>
            {message && <p className={`auth-message ${isError ? "is-error" : ""}`} role="status">{message}</p>}
            <button className="account-signout" type="button" onClick={() => void logout()} disabled={submitting}>
              ログアウト <span>→</span>
            </button>
          </>
        ) : (
          <>
            <h2 id="account-title">アカウント作成<br />またはログイン</h2>
            <p className="account-lead">メールに届く6桁のコード、またはGoogleアカウントで安全に続行できます。</p>

            {!auth.configured ? (
              <p className="account-local-notice" role="status">
                認証サービスの接続設定がまだ完了していません。Supabaseの接続後に利用できます。
              </p>
            ) : (
              <>
                <button className="google-auth-button" type="button" onClick={() => void googleLogin()} disabled={submitting}>
                  <span className="google-mark" aria-hidden="true">G</span>
                  Googleで続ける
                  <span>→</span>
                </button>
                <div className="auth-divider"><span>または</span></div>
                <form className="email-auth-form" onSubmit={codeSent ? verifyCode : sendCode}>
                  <label>
                    <span>メールアドレス</span>
                    <input
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={codeSent || submitting}
                      required
                    />
                  </label>
                  {codeSent && (
                    <label>
                      <span>6桁の認証コード</span>
                      <input
                        className="otp-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={code}
                        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                        required
                        autoFocus
                      />
                    </label>
                  )}
                  <button className="account-primary" type="submit" disabled={submitting}>
                    {submitting ? "処理しています…" : codeSent ? "コードを確認してログイン" : "認証コードを送信"}
                    <span>→</span>
                  </button>
                </form>
                {codeSent && (
                  <button
                    className="auth-change-email"
                    type="button"
                    onClick={() => { setCodeSent(false); setCode(""); setMessage(null); }}
                    disabled={submitting}
                  >
                    別のメールアドレスを使う
                  </button>
                )}
              </>
            )}
            {message && <p className={`auth-message ${isError ? "is-error" : ""}`} role="status">{message}</p>}
            <small>初回認証時にTERRANDIPアカウントが自動で作成されます。</small>
          </>
        )}
      </section>
    </div>
  );
}
