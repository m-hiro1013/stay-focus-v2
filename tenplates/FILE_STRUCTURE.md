<!-- 
=====================================
📁 FILE_STRUCTURE.md
=====================================

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ このコメント部分は編集禁止 ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【このファイルの役割】
プロジェクトのファイル構成・依存関係を記録
AIが「どのファイルがあるか」を正確に把握するための正

【固定/カスタマイズ】
カスタマイズ（プロジェクトごとに作成・更新）

【更新タイミング】
ファイル変更時に即更新（後回しにしない）
- 新しいファイルを作成したとき
- ファイルを削除したとき
- ファイル名を変更したとき
- ディレクトリ構成を変更したとき

【書くこと】
- ディレクトリ構成（ツリー形式）
- 各ファイルの役割
- ファイル間の依存関係
- 変更履歴

【書かないこと】
- AIの振る舞い → SYSTEM.yaml
- 運用ルール → RULES.yaml
- プロジェクト固有情報 → PROJECT.yaml
- 進捗状況 → WORKFLOW.yaml
- DB設計 → DATABASE.md
- コードの中身・実装詳細

【重要】
⚠️ 変更したら即座に更新すること
⚠️ このファイルが実際の構成と一致していないとAIが誤認識する
⚠️ 後回しにしない

【セルフチェック（ファイル編集時に必ず確認）】
□ このコメント部分を変更していないか
□ 書くことに該当する内容のみ追加/編集したか
□ 書かないことに該当する内容を書いていないか
□ 実際のファイル構成と一致しているか
□ 依存関係は正確か
□ 変更履歴を追記したか

=====================================
-->

## 📋 基本情報

| 項目 | 値 |
|------|-----|
| 最終更新日 | 2025-12-30 |
| ルートディレクトリ | ~/Desktop/stay-focus-v2 |

---

## 🗂️ ディレクトリ構成

stay-focus-v2/ ├── index.html # メイン画面 ├── auth.html # 認証画面 ├── vite.config.js # Vite設定（複数HTML対応） ├── package.json # 依存関係 ├── .env # 環境変数（Git管理外） ├── .gitignore # Git除外設定 │ ├── src/ │ ├── main.js # メイン画面ロジック │ ├── auth.js # 認証画面ロジック │ └── supabase.js # Supabase初期化 │ ├── public/ │ ├── manifest.json # PWAマニフェスト │ └── icons/ │ ├── icon-192.png │ ├── icon-512.png │ └── icon-512-maskable.png │ └── prompts/ ├── SYSTEM.yaml # AIの振る舞い ├── RULES.yaml # 運用ルール ├── PROJECT.yaml # プロジェクト固有情報 ├── WORKFLOW.yaml # 進捗管理 ├── FILE_STRUCTURE.md # ファイル構成（このファイル） ├── DATABASE.md # DB設計 └── tips/ └── TIPS_SUPABASE.md # Supabase tips


---

## 📄 ファイル詳細

### ルート

| ファイル | 役割 | 備考 |
|---------|------|------|
| index.html | メイン画面（タスク一覧・全モーダル） | CSS内包 |
| auth.html | 認証画面（ログイン/サインアップ） | CSS内包 |
| vite.config.js | Vite設定 | 複数HTML対応（rollupOptions.input） |
| package.json | 依存関係 | @supabase/supabase-js |
| .env | 環境変数 | Git管理外、VITE_SUPABASE_URL等 |
| .gitignore | Git除外設定 | .env, node_modules等 |

### src/

| ファイル | 役割 | 依存先 |
|---------|------|--------|
| main.js | メイン画面の全ロジック | supabase.js |
| auth.js | 認証処理 | supabase.js |
| supabase.js | Supabaseクライアント初期化 | なし |

### public/

| ファイル | 役割 | 備考 |
|---------|------|------|
| manifest.json | PWAマニフェスト | アプリ名・アイコン・テーマ色 |
| icons/icon-192.png | PWAアイコン（小） | 192x192 |
| icons/icon-512.png | PWAアイコン（大） | 512x512 |
| icons/icon-512-maskable.png | PWAアイコン（マスカブル） | 512x512 |

### prompts/

| ファイル | 役割 | 更新頻度 |
|---------|------|---------|
| SYSTEM.yaml | AIの振る舞い | ほぼ変えない |
| RULES.yaml | 運用ルール | 変更しない |
| PROJECT.yaml | プロジェクト固有情報 | 要件定義後は固定 |
| WORKFLOW.yaml | 進捗管理 | 毎セッション |
| FILE_STRUCTURE.md | ファイル構成 | ファイル変更時 |
| DATABASE.md | DB設計 | DB変更時 |
| tips/TIPS_SUPABASE.md | Supabase tips | 知見追加時 |

---

## 🔗 依存関係

index.html └── src/main.js └── src/supabase.js

auth.html └── src/auth.js └── src/supabase.js


---

## 📝 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2025-12-30 | 初期構成作成（React版から移行） |
| 2025-12-30 | PWA対応（manifest.json, icons/） |
| 2025-12-30 | プロンプト体系を新形式に移行 |

---

## 💡 補足

- CSSは各HTMLファイル内の`<style>`タグに記述（外部CSSファイルなし）
- Service Worker（sw.js）は未実装（F053で対応予定）
- vite.config.jsで複数HTMLのビルドに対応済み