<!-- 
=====================================
💡 TIPS_SUPABASE.md
=====================================

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ このコメント部分は編集禁止 ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【このファイルの役割】
Supabase固有のtips・ハマりポイント・ベストプラクティスを蓄積

【固定/カスタマイズ】
カスタマイズ（知見を随時追加）

【更新タイミング】
- バグ修正完了時に「これ他でも使える」と判断したとき
- 新しいハマりポイントを発見したとき
- ベストプラクティスを見つけたとき

【書くこと】
- Supabase固有の問題と解決策
- RLS、Auth、クエリ、リアルタイム等のtips
- コード例（NG/OKの両方）

【書かないこと】
- プロジェクト固有の注意点 → WORKFLOW.yamlのcautions
- 環境に依存しない汎用tips → SYSTEM.yamlの汎用tips

【セルフチェック（ファイル編集時に必ず確認）】
□ このコメント部分を変更していないか
□ Supabase固有の内容か（汎用ならSYSTEM.yamlへ）
□ 症状・原因・解決が明確か
□ コード例があると分かりやすいか

=====================================
-->

# Supabase Tips

## 📋 目次

1. [RLS（Row Level Security）](#1-rlsrow-level-security)
2. [認証（Auth）](#2-認証auth)
3. [クエリ・CRUD](#3-クエリcrud)
4. [接続・初期化](#4-接続初期化)

---

## 1. RLS（Row Level Security）

### データが取得できない（空配列が返る）

| 項目 | 内容 |
|-----|------|
| **症状** | `data`が空配列`[]`で返ってくる、データがあるはずなのに取れない |
| **原因** | RLSポリシーでフィルタされている。team_idの指定漏れ |
| **解決** | クエリに`.eq('team_id', currentTeamId)`を追加 |

```javascript
// ❌ NG: team_idフィルタなし
const { data } = await supabase.from('tasks').select('*');

// ✅ OK: team_idフィルタあり
const { data } = await supabase.from('tasks').select('*').eq('team_id', currentTeamId);
RLSポリシーの基本パターン
項目	内容
症状	RLSポリシーの書き方が分からない
原因	-
解決	team_members経由でアクセス制御するパターンを使う
Copy-- チームメンバーのみアクセス可能にするポリシー
CREATE POLICY "チームメンバーのみ閲覧可能" ON tasks
  FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid()
    )
  );
2. 認証（Auth）
ログイン状態の監視
項目	内容
症状	ログアウト後もページが表示されたままになる
原因	認証状態の変更を監視していない
解決	onAuthStateChangeでリダイレクト処理を入れる
Copy// ✅ OK: 認証状態を監視してリダイレクト
supabase.auth.onAuthStateChange((event, session) => {
  if (!session) {
    window.location.href = '/auth.html';
  }
});
セッション取得
項目	内容
症状	ページ読み込み時にログイン状態が分からない
原因	セッションを取得していない
解決	getSession()で現在のセッションを取得
Copy// ✅ OK: 初期化時にセッション確認
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  window.location.href = '/auth.html';
  return;
}
3. クエリ・CRUD
Undo後にid重複エラー
項目	内容
症状	削除をUndoしようとするとduplicate keyエラー
原因	同じIDでINSERTしようとしている
解決	idを除外して新規INSERTする（新しいIDが自動生成される）
Copy// ❌ NG: idを含めてINSERT
await supabase.from('tasks').insert(deletedTask);

// ✅ OK: idを除外してINSERT
const { id, created_at, updated_at, ...taskData } = deletedTask;
await supabase.from('tasks').insert(taskData);
複合主キーテーブルへのINSERT
項目	内容
症状	settingsテーブルにINSERTするとエラー
原因	idカラムがないのにidを指定している、または複合PKの理解不足
解決	team_id + key を指定する。idは不要
Copy// ❌ NG: idを指定
await supabase.from('settings').insert({ id: 'xxx', key: 'theme', value: 'dark' });

// ✅ OK: team_id + key を指定
await supabase.from('settings').insert({ team_id: currentTeamId, key: 'theme', value: 'dark' });
UPSERT（あれば更新、なければ挿入）
項目	内容
症状	設定値を保存したいが、既存チェックが面倒
原因	-
解決	upsertを使う。onConflictで競合キーを指定
Copy// ✅ OK: upsertで一発
await supabase.from('settings').upsert(
  { team_id: currentTeamId, key: 'theme', value: 'dark' },
  { onConflict: 'team_id,key' }
);
4. 接続・初期化
環境変数が読めない
項目	内容
症状	supabaseUrlやsupabaseAnonKeyがundefined
原因	環境変数のプレフィックスが間違っている、または.envがない
解決	Viteの場合はVITE_プレフィックスが必須
Copy// ❌ NG: プレフィックスなし（Viteでは読めない）
const supabaseUrl = import.meta.env.SUPABASE_URL;

// ✅ OK: VITE_プレフィックスあり
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
クライアント初期化の一元管理
項目	内容
症状	複数ファイルでSupabaseクライアントを初期化している
原因	各ファイルでcreateClientしている
解決	1ファイルで初期化してexportする
Copy// src/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 他のファイルからimport
import { supabase } from './supabase.js';
📝 追加履歴
日付	追加内容
2025-12-30	初期作成（RLS、Auth、クエリ、接続のtips）