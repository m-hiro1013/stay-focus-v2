# =====================================
# 🗄️ DATABASE.md
# =====================================
#
# 【このファイルの役割】
# データベースの設計（テーブル定義・カラム・リレーション）を記録するドキュメント。
# プロジェクトの「データ構造がどうなっているか」の正（Single Source of Truth）。
# 実際のSupabaseのテーブルとこのファイルの内容は常に一致している必要がある。
#
# =====================================

> ⚠️ このファイルはプロジェクトのデータベース設計の「正」です
> テーブル変更時は必ずここを更新してください

---

## 📋 基本情報

| 項目 | 値 |
|------|-----|
| データベース | Supabase (PostgreSQL) |
| 最終更新日 | 2025-12-30 |
| 更新者 | - |

---

## 📊 テーブル一覧

| テーブル名 | 説明 | RLS |
|-----------|------|-----|
| teams | チーム/ワークスペース | ✅ |
| team_members | チームとユーザーの紐付け | ✅ |
| projects | プロジェクト | ✅ |
| tasks | タスク | ✅ |
| members | メンバー（担当者） | ✅ |
| settings | システム設定 | ✅ |

---

## 🗂️ テーブル詳細

### ① teams（チーム）

**概要**: チーム/ワークスペースの管理。サインアップ時にトリガーで自動作成される。

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 主キー |
| name | TEXT | NOT NULL | チーム名 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新日時 |

**RLSポリシー**: 
- SELECT: チームメンバーのみ閲覧可能
- INSERT: 認証済みユーザーが作成可能 <!-- 修正: 実際のポリシーに合わせて追加 -->
- UPDATE: チームメンバーのみ更新可能

**トリガー**:
- `on_auth_user_created`: サインアップ時にチームを自動作成
- `update_teams_updated_at`: 更新時にupdated_atを自動更新

---

### ② team_members（チームメンバー）

**概要**: ユーザーとチームの紐付け中間テーブル

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 主キー |
| team_id | UUID | FK → teams(id) ON DELETE CASCADE | チームID |
| user_id | UUID | | ユーザーID（auth.usersを参照） | <!-- 修正: FK制約なし -->
| role | TEXT | DEFAULT 'member' | 役割（owner / member） | <!-- 修正: デフォルト値 -->
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |

**ユニーク制約**: <!-- 修正: 追加 -->
- `team_id` + `user_id` の組み合わせでユニーク

**RLSポリシー**:
- SELECT: 自分のuser_idのレコードのみ閲覧可能 <!-- 修正: 実際のポリシーに合わせて修正 -->
- INSERT: 認証済みユーザーが追加可能

**備考**:
- user_idはauth.usersを参照するが、外部キー制約は設定されていない <!-- 修正: 追加 -->
- サインアップ時のトリガーでownerとして自動追加
- 将来のチーム招待機能で member として追加予定

---

### ③ projects（プロジェクト）

**概要**: プロジェクト（タスクのグループ）の管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 主キー |
| team_id | UUID | FK → teams(id) ON DELETE CASCADE | チームID |
| project_name | TEXT | NOT NULL | プロジェクト名 |
| description | TEXT | | プロジェクトの説明 |
| color_code | TEXT | DEFAULT '#FF69B4' | プロジェクトカラー（HEX） |
| is_completed | BOOLEAN | DEFAULT false | 完了フラグ |
| is_archived | BOOLEAN | DEFAULT false | アーカイブフラグ |
| completed_at | TIMESTAMPTZ | | 完了日時 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新日時 |

**RLSポリシー**:
- SELECT: チームメンバーのみ閲覧可能
- INSERT: チームメンバーのみ追加可能
- UPDATE: チームメンバーのみ更新可能
- DELETE: チームメンバーのみ削除可能

**トリガー**:
- `update_projects_updated_at`: 更新時にupdated_atを自動更新

**備考**:
- `is_completed=true`のプロジェクトはタブに表示されない
- `is_archived=true`のプロジェクトはアーカイブ一覧に表示

---

### ④ tasks（タスク）

**概要**: タスクの管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 主キー |
| team_id | UUID | FK → teams(id) ON DELETE CASCADE | チームID |
| project_id | UUID | FK → projects(id) ON DELETE SET NULL | プロジェクトID |
| task_name | TEXT | NOT NULL | タスク名 |
| memo | TEXT | | メモ |
| due_date | DATE | | 期日（日付のみ） |
| due_time | TIME | | 期限時間 | <!-- 修正: TEXT → TIME -->
| priority_time_frame | TEXT | DEFAULT '今日' | 時間枠（今日/明日/今週/来週/来月以降） |
| is_completed | BOOLEAN | DEFAULT false | 完了フラグ |
| is_important | BOOLEAN | DEFAULT false | 重要マーク |
| is_pinned | BOOLEAN | DEFAULT false | ピン留め |
| sort_order | INTEGER | DEFAULT 0 | 表示順 |
| assignees | JSONB | DEFAULT '[]' | 担当者ID配列（JSON） |
| completed_at | TIMESTAMPTZ | | 完了日時 |
| result_memo | TEXT | | 振り返りコメント |
| event_id | TEXT | | Googleカレンダー連携用（未使用） |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新日時 |

**RLSポリシー**:
- SELECT: チームメンバーのみ閲覧可能
- INSERT: チームメンバーのみ追加可能
- UPDATE: チームメンバーのみ更新可能
- DELETE: チームメンバーのみ削除可能

**トリガー**:
- `update_tasks_updated_at`: 更新時にupdated_atを自動更新

**備考**:
- `priority_time_frame`の選択肢: 今日/明日/今週/来週/来月以降
- `assignees`はJSON配列（例: `["uuid1", "uuid2"]`）、members.idを参照
- 並び順: sort_orderのみ（ピン留め・重要マークは並び順に影響しない）

---

### ⑤ members（メンバー）

**概要**: タスクの担当者（チーム内のメンバー）管理

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 主キー |
| team_id | UUID | FK → teams(id) ON DELETE CASCADE | チームID |
| name | TEXT | NOT NULL | メンバー名 |
| email | TEXT | NOT NULL | メールアドレス |
| color | TEXT | DEFAULT '#FF69B4' | メンバーカラー（HEX） |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新日時 |

**RLSポリシー**:
- SELECT: チームメンバーのみ閲覧可能
- INSERT: チームメンバーのみ追加可能
- UPDATE: チームメンバーのみ更新可能
- DELETE: チームメンバーのみ削除可能

**トリガー**:
- `update_members_updated_at`: 更新時にupdated_atを自動更新

**備考**:
- tasksテーブルのassigneesカラムにこのテーブルのidを配列で保存

---

### ⑥ settings（システム設定）

**概要**: チームごとの設定値管理（キー・バリュー形式）

<!-- 修正: テーブル構造を全面修正 -->
| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| team_id | UUID | PK（複合）, NOT NULL, FK → teams(id) ON DELETE CASCADE | チームID |
| key | TEXT | PK（複合）, NOT NULL | 設定キー |
| value | TEXT | | 設定値 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新日時 |

**主キー**: `team_id` + `key`（複合主キー） <!-- 修正: 追加 -->

**RLSポリシー**:
- SELECT: チームメンバーのみ閲覧可能
- INSERT: チームメンバーのみ追加可能
- UPDATE: チームメンバーのみ更新可能

**トリガー**:
- `update_settings_updated_at`: 更新時にupdated_atを自動更新

---

## 🔗 リレーション

### 外部キー一覧

<!-- 修正: team_members.user_idのFK削除、ON DELETE明記 -->
| FROM テーブル | FROM カラム | TO テーブル | TO カラム | ON DELETE |
|--------------|-------------|-------------|-----------|-----------|
| team_members | team_id | teams | id | CASCADE |
| projects | team_id | teams | id | CASCADE |
| tasks | team_id | teams | id | CASCADE |
| tasks | project_id | projects | id | SET NULL |
| members | team_id | teams | id | CASCADE |
| settings | team_id | teams | id | CASCADE |

**備考**: team_members.user_id は auth.users(id) を参照するが、外部キー制約は設定されていない <!-- 修正: 追加 -->

### リレーション図

auth.users │ │ user_id（FK制約なし） ▼ team_members ────► teams │ │ team_id ┌─────────────┼─────────────┐ ▼ ▼ ▼ projects members settings │ │ project_id ▼ tasks


---

## 🔑 RLSポリシー設計方針

### 基本ルール

- **チームベースのアクセス制御**: ユーザーは所属チームのデータのみアクセス可能
- **team_members経由での認可**: `team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())`

### ポリシー数

- **20個のRLSポリシー設定済み** <!-- 修正: 19 → 20 -->
- 全テーブルでSELECT/INSERT/UPDATE/DELETEのポリシーを設定

---

## 🛠️ Functions / Triggers

### Triggers

| トリガー名 | テーブル | 発火タイミング | 処理内容 |
|-----------|---------|--------------|---------|
| on_auth_user_created | auth.users | AFTER INSERT | チーム自動作成・team_members追加 |
| update_tasks_updated_at | tasks | BEFORE UPDATE | updated_at自動更新 |
| update_projects_updated_at | projects | BEFORE UPDATE | updated_at自動更新 |
| update_members_updated_at | members | BEFORE UPDATE | updated_at自動更新 |
| update_settings_updated_at | settings | BEFORE UPDATE | updated_at自動更新 |
| update_teams_updated_at | teams | BEFORE UPDATE | updated_at自動更新 |

---

## 📝 変更履歴

| 日付 | 変更内容 | 理由 |
|------|---------|------|
| 2025-xx-xx | 初期6テーブル作成 | GAS版からの移行 |
| 2025-xx-xx | RLS有効化・20ポリシー追加 | マルチユーザー対応 | <!-- 修正: 19 → 20 -->
| 2025-xx-xx | サインアップ時のチーム自動作成トリガー追加 | ユーザー登録フロー改善 |
| 2025-12-30 | 実DBとの差分を修正（settings複合PK、due_time型、roleデフォルト値等） | DB検証による整合性確保 | <!-- 修正: 追加 -->

---

## 💡 補足・注意事項

- **チームベースのマルチテナント**: 全データはteam_idで分離
- **サインアップ時の自動処理**: トリガーでチーム作成・メンバー追加が自動実行
- **assigneesの形式**: JSON配列（`["uuid1", "uuid2"]`）、members.idを参照
- **時間枠の種類**: 今日/明日/今週/来週/来月以降 の5種類固定
- **settingsテーブル**: idカラムなし、team_id + key の複合主キーで管理 <!-- 修正: 追加 -->
- **将来の拡張**: team_invitesテーブル追加でチーム招待機能を実装予定