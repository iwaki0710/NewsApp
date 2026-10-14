# TERRANDIP

世界各国のニュースを偶然から発見できる、Sites / Vinext対応のニュースアプリです。記事全文は複製せず、配信元が提供する見出しと短い概要だけを表示します。

## 主な機能

- 1カ国深掘りと、最大5カ国の世界ミックス
- 10件単位のページ移動と並べ替え
- DeepLによる任意言語への翻訳切り替え
- サイト内の概要表示と配信元リンク
- Supabase Authによるメール認証コードとGoogleログイン

## 必要な環境変数

`.env.example`を参考に、ローカルでは`.env.local`へ設定します。`.env.local`はGitへ追加しません。

- `NEWSDATA_API_KEY`: NewsData.ioのサーバー用キー
- `DEEPL_API_KEY`: DeepLのサーバー用キー
- `NEXT_PUBLIC_SUPABASE_URL`: SupabaseプロジェクトURL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase Publishable key

`service_role`キーをブラウザ向け変数へ設定しないでください。

## 開発と確認

Node.js 22.13.0以上を使用します。

```bash
npm install
npm run lint
npm test
npm run dev
```

## 認証設定

- Supabaseのメールテンプレートは`{{ .Token }}`を使用して6桁コードを送信します。
- SupabaseとGoogle OAuthの許可URLには、ローカルURLと公開URLの`/auth/callback`を登録します。
- 公開時はResendの独自ドメインを確認し、Google OAuthを本番公開状態へ切り替えます。

## 公開基盤

`.openai/hosting.json`、Vinext、Cloudflare Worker向け設定を保持しています。公開用の環境変数はSites側で管理してください。

## 安全設計

- ニュース・翻訳APIキーはサーバールートだけで利用します。
- API入力に上限、許可リスト、タイムアウト、利用回数制限を設定しています。
- Supabaseの`service_role`キー、パスワード、OAuthトークンをアプリ側へ保存しません。
- OAuth後の遷移先は同一サイト内の相対パスだけを許可します。
