<!-- 
=====================================
💡 TIPS_GAS.md
=====================================

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ このコメント部分は編集禁止 ⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【このファイルの役割】
Google Apps Script (GAS) 固有のtips・ハマりポイント・ベストプラクティスを蓄積

【固定/カスタマイズ】
カスタマイズ（知見を随時追加）

【更新タイミング】
- バグ修正完了時に「これ他でも使える」と判断したとき
- 新しいハマりポイントを発見したとき
- ベストプラクティスを見つけたとき

【書くこと】
- GAS固有の問題と解決策
- サーバー・クライアント間通信のtips
- スプレッドシートAPI、パフォーマンス、テンプレートエンジン等のtips
- コード例（NG/OKの両方）

【書かないこと】
- プロジェクト固有の注意点 → WORKFLOW.yamlのcautions
- 環境に依存しない汎用tips → SYSTEM.yamlの汎用tips

【セルフチェック（ファイル編集時に必ず確認）】
□ このコメント部分を変更していないか
□ GAS固有の内容か（汎用ならSYSTEM.yamlへ）
□ 症状・原因・解決が明確か
□ コード例があると分かりやすいか

=====================================
-->

# Google Apps Script (GAS) Tips

## 📋 目次

1. [サーバー・クライアント間通信](#1-サーバークライアント間通信)
2. [データ型とIDの扱い](#2-データ型とidの扱い)
3. [スプレッドシートAPI・パフォーマンス](#3-スプレッドシートapiパフォーマンス)
4. [テンプレートエンジン・include](#4-テンプレートエンジンinclude)
5. [WebアプリのURL・ページ遷移](#5-webアプリのurlページ遷移)
6. [キャッシュ・プロパティ](#6-キャッシュプロパティ)
7. [デバッグ・ログ出力](#7-デバッグログ出力)
8. [clasp・開発環境](#8-clasp開発環境)

---

## 1. サーバー・クライアント間通信

### google.script.runの戻り値がnullになる

| 項目 | 内容 |
|-----|------|
| **症状** | サーバー側ログでは正常だが、クライアントで`null`や欠損が発生 |
| **原因** | Dateオブジェクトをそのまま返すとシリアライズに失敗する |
| **解決** | サーバーから返す前にDateは必ず文字列（`toISOString()`）に変換 |

```javascript
// ❌ NG: Dateをそのまま返す
function getData() {
  const data = sheet.getDataRange().getValues();
  return data; // Dateが含まれていると全体がnullになることがある
}

// ✅ OK: Dateを文字列に変換してから返す
function getData() {
  const data = sheet.getDataRange().getValues();
  const serializedData = data.map(row =>
    row.map(cell => cell instanceof Date ? cell.toISOString() : cell)
  );
  return serializedData;
}
絵文字や特殊文字でシリアライズ失敗
項目	内容
症状	特定のデータを返すとnullになる
原因	絵文字や特殊なマルチバイト文字がシリアライズを壊す
解決	問題のセル・文字列を特定するログを入れて原因を切り分ける
Copy// デバッグ用：1行ずつ返して問題の行を特定
function debugData() {
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    console.log(`Row ${i}:`, JSON.stringify(data[i]));
  }
}
google.script.runをPromise化（async/await対応）
項目	内容
症状	コールバック地獄になる、async/awaitで書きたい
原因	google.script.runはコールバック形式
解決	Promiseでラップする関数を用意
Copy// ✅ OK: Promiseでラップ
const ServerScript = {};
for (const methodName in google.script.run) {
  const method = google.script.run[methodName];
  if (typeof method !== "function") continue;
  if (methodName === method.prototype.constructor.name) continue;
  ServerScript[methodName] = (...args) => new Promise(
    (resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        [methodName](...args);
    }
  );
}

// 使用例
async function loadData() {
  const data1 = await ServerScript.getData();
  const data2 = await ServerScript.processData(data1);
  console.log(data2);
}
2. データ型とIDの扱い
IDの比較で不一致が起きる
項目	内容
症状	同じ値なのに検索・比較でヒットしない
原因	スプレッドシートから取得した値は見た目が同じでも型が違う（数値123 vs 文字列"123"）
解決	IDやキー用途の値は必ずString()で文字列型に統一
Copy// ❌ NG: 型を意識せずに比較
const key = criteriaId; // 数値かもしれない
const value = progressMap.get(key); // 文字列キーのMapだとヒットしない

// ✅ OK: 文字列に統一
const key = String(criteriaId);
const value = progressMap.get(key);
3. スプレッドシートAPI・パフォーマンス
ループ内でgetValue/setValueを呼んで激重
項目	内容
症状	処理が非常に遅い、タイムアウトする
原因	ループの中でgetValue(), setValue(), getRange()を直接呼んでいる
解決	一括取得 → メモリ上で処理 → 一括書き込み
Copy// ❌ NG: ループ内でAPI呼び出し
for (let i = 1; i <= 100; i++) {
  const value = sheet.getRange(i, 1).getValue();
  sheet.getRange(i, 2).setValue(value * 2);
}

// ✅ OK: 一括処理
const data = sheet.getRange(1, 1, 100, 1).getValues();
const result = data.map(row => [row[0] * 2]);
sheet.getRange(1, 2, 100, 1).setValues(result);
4. テンプレートエンジン・include
includeしたファイルでが動かない
項目	内容
症状	include('script')で読み込んだファイル内の<?= ?>がエラー
原因	GASテンプレート構文はメインHTMLでのみ有効
解決	includeするファイルは純粋なJavaScript/CSS/HTMLのみにする
Copy<!-- ❌ NG: script.html内でGASテンプレ構文 -->
<script>
  const url = '<?= getAppUrl() ?>'; // エラーになる
</script>

<!-- ✅ OK: メインHTMLで変数を渡す -->
<!-- index.html -->
<script>
  const APP_URL = '<?= getAppUrl() ?>';
</script>
<?!= include('script'); ?>

<!-- script.html -->
<script>
  // APP_URLはグローバル変数として使える
  console.log(APP_URL);
</script>
includeでパラメータを渡す
項目	内容
症状	includeしたファイルに変数を渡したい
原因	createHtmlOutputFromFileではパラメータを渡せない
解決	createTemplateFromFileを使うinclude関数を用意
Copy// Code.gs
function include(filename, params) {
  const template = HtmlService.createTemplateFromFile(filename);
  if (params) {
    for (const key in params) {
      template[key] = params[key];
    }
  }
  return template.evaluate().getContent();
}

// index.html
<?!= include('hello', { name: "Taro" }); ?>

// hello.html
<h1>Hello, <?= name ?>!</h1>
外部ライブラリはメインHTMLに直接書く
項目	内容
症状	includeで外部CDNを読み込もうとすると動かない
原因	GASはレンダリング後に別ファイルを参照できない
解決	<script src="...">はメインHTMLに直接記述
Copy<!-- ✅ OK: index.htmlに直接記述 -->
<script src="https://cdn.example.com/library.js"></script>

<!-- ❌ NG: includeで読み込もうとする -->
<?!= include('external-libs'); ?>
5. WebアプリのURL・ページ遷移
相対パスでページ遷移できない
項目	内容
症状	<a href="?page=xxx">が動かない
原因	GASはiframe内で動作するため相対パスが効かない
解決	window.top.location.hrefでフルURLを指定
Copy<!-- ❌ NG: 相対パス -->
<a href="?page=check">評価入力</a>

<!-- ✅ OK: フルURL + window.top -->
<a href="javascript:void(0)"
   onclick="window.top.location.href='<?= getAppUrl() ?>?page=check'">
  評価入力
</a>
クエリパラメータでページ分岐
項目	内容
症状	GASでページ遷移を実現したい
原因	GASはパスを切れない
解決	クエリパラメータで分岐
Copy// Code.gs
function doGet(e) {
  const page = e.parameter.page || "index";
  return HtmlService.createTemplateFromFile(page).evaluate();
}

function getAppUrl() {
  return ScriptApp.getService().getUrl();
}
自分のURLを取得する
項目	内容
症状	デプロイ後のURLをコード内で使いたい
原因	-
解決	ScriptApp.getService().getUrl()
Copyfunction getAppUrl() {
  return ScriptApp.getService().getUrl();
}
6. キャッシュ・プロパティ
キャッシュの使い方
項目	内容
症状	重い処理を毎回実行したくない
原因	-
解決	CacheServiceを使う（最長6時間）
Copyfunction makeScriptCache() {
  const scriptCache = CacheService.getScriptCache();
  return {
    get: function(key) {
      const value = scriptCache.get(key);
      return value ? JSON.parse(value) : null;
    },
    put: function(key, value, sec = 600) {
      scriptCache.put(key, JSON.stringify(value), sec);
      return value;
    }
  };
}

// 使用例
function getData() {
  const cache = makeScriptCache();
  let result = cache.get('myData');
  if (!result) {
    result = heavyProcess();
    cache.put('myData', result, 3600); // 1時間キャッシュ
  }
  return result;
}
スクリプトプロパティの使い方
項目	内容
症状	APIキーなどコードに書きたくない情報を保存したい
原因	-
解決	PropertiesServiceを使う（永続保存）
Copy// 設定
function setProperty() {
  PropertiesService.getScriptProperties().setProperty("API_KEY", "xxx");
}

// 取得
function getProperty() {
  return PropertiesService.getScriptProperties().getProperty("API_KEY");
}
7. デバッグ・ログ出力
サーバー側ログ
項目	内容
症状	サーバー側の処理をデバッグしたい
原因	-
解決	console.log()を使う（GASエディタの実行ログで確認）
Copyfunction myFunction() {
  console.log("引数:", args);
  console.log("中間データ:", data);
  console.log("戻り値:", result);
}
クライアント側ログ
項目	内容
症状	ブラウザ側の処理をデバッグしたい
原因	-
解決	ブラウザの開発者ツール（F12）でコンソールを確認
Copy// script.html内
console.log("クライアント側のログ");
応答ハック（サーバーログが見れない場合）
項目	内容
症状	サーバー側のログを直接見れない環境
原因	-
解決	戻り値として内部状態を文字列化して返し、画面上で確認
Copy// デバッグ用：一時的に状態を返す
function debugFunction() {
  const debugInfo = {
    data: someData,
    processedData: processedData,
    error: null
  };
  return JSON.stringify(debugInfo, null, 2);
}
8. clasp・開発環境
claspの基本コマンド
項目	内容
症状	ローカル開発環境を構築したい
原因	-
解決	claspを使う
Copy# インストール
npm install @google/clasp -g
npm install @types/google-apps-script

# ログイン
clasp login --no-localhost

# プロジェクト作成
clasp create

# プッシュ
clasp push

# GASを開く
clasp open
pushするディレクトリを指定
項目	内容
症状	srcディレクトリ以下だけpushしたい
原因	-
解決	.clasp.jsonのrootDirを設定
Copy{
  "scriptId": "スクリプトのID",
  "rootDir": "src"
}
ファイルの読み込み順を指定
項目	内容
症状	ファイルの読み込み順を制御したい
原因	GASはファイルを上から順に読み込む
解決	.clasp.jsonのfilePushOrderを設定
Copy{
  "scriptId": "スクリプトのID",
  "filePushOrder": ["config.js", "utils.js", "main.js"]
}
📝 追加履歴
日付	追加内容
2025-12-30	初期作成（サーバー・クライアント通信、パフォーマンス、テンプレート、URL、キャッシュ、デバッグ、clasp）