/*
 * spo-explorer.js から配布物を生成する。
 *
 *   node build.mjs
 *
 * 出力
 *   bookmarklet.txt … javascript: URL（ブックマークの URL 欄に直接貼る用）
 *   install.html    … ブックマークレットを埋め込み済みの導入ページ
 *
 * spo-explorer.js を直したら必ず実行すること。忘れると配布物が古いままになる。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('./spo-explorer.js', import.meta.url), 'utf8');

// 圧縮はしない。javascript: URL は改行やコメントを含んだままでも動く。
// 全体を percent-encode するだけで済ませるのが一番壊れにくい。
// encodeURIComponent は & " < > を必ずエンコードするので、
// 結果をそのまま HTML の href 属性に埋めても壊れない。
const bookmarklet = 'javascript:' + encodeURIComponent(src + '\nvoid 0;');

writeFileSync(new URL('./bookmarklet.txt', import.meta.url), bookmarklet);

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>SPO Explorer — 導入</title>
<style>
  body { font: 15px/1.8 -apple-system, "Segoe UI", "Yu Gothic UI", sans-serif;
         max-width: 760px; margin: 0 auto; padding: 40px 24px 80px; color: #222; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .lead { color: #666; margin-top: 0; }
  h2 { font-size: 16px; margin-top: 36px; padding-bottom: 5px; border-bottom: 1px solid #ddd; }
  ol { padding-left: 1.4em; }
  li { margin: 8px 0; }
  .drag { margin: 24px 0; padding: 28px; border: 2px dashed #b9c2d0;
          border-radius: 10px; text-align: center; background: #fafbfc; }
  .drag a { display: inline-block; padding: 12px 32px; background: #2f4f8f; color: #fff;
            text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;
            cursor: grab; }
  .drag a:active { cursor: grabbing; }
  .drag p { margin: 14px 0 0; font-size: 13px; color: #666; }
  .note { background: #f6f6f6; border-left: 3px solid #999; padding: 10px 16px; font-size: 13px; }
  .warn { background: #fff6f2; border-left: 3px solid #d2703a; padding: 10px 16px; font-size: 13px; }
  code { background: #f0f0f0; padding: 1px 5px; border-radius: 3px; font-size: 13px; }
  details { margin-top: 10px; font-size: 13px; }
  summary { cursor: pointer; color: #2f4f8f; }
  textarea { width: 100%; height: 90px; font-family: ui-monospace, Menlo, monospace;
             font-size: 10px; border: 1px solid #ccc; border-radius: 4px; padding: 8px; margin-top: 8px; }
</style>
</head>
<body>

<h1>SPO Explorer</h1>
<p class="lead">SharePoint Online の REST API を、申請なしでブラウザから試すツールです。</p>

<h2>1. 導入</h2>

<p>下のボタンを<strong>ブックマークバーにドラッグ</strong>してください。それだけで終わりです。</p>

<div class="drag">
  <a href="${bookmarklet}">SPO Explorer</a>
  <p>↑ このボタンをブックマークバーへドラッグ</p>
</div>

<p class="note">
  ブックマークバーが出ていない場合は <code>Cmd + Shift + B</code>（Windows は <code>Ctrl + Shift + B</code>）で表示できます。<br>
  クリックしてもこのページでは何も起きません。SharePoint のページで押してください。
</p>

<details>
  <summary>ドラッグできないとき（手動で登録する）</summary>
  <p>ブックマークを新規作成し、URL 欄に下の文字列を貼り付けてください。</p>
  <textarea readonly onclick="this.select()">${bookmarklet.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>
</details>

<h2>2. 動作確認</h2>

<p><strong>検証用のサイト</strong>、または自分で作ったサイトで試してください。</p>

<ol>
  <li>SharePoint のサイトを開く</li>
  <li>ブックマークバーの「SPO Explorer」をクリック → 画面右上にパネルが出る</li>
  <li>まず <strong>「ライブラリ一覧」</strong> を押す（読み取りだけなので安全）。表が出れば成功</li>
  <li>「リスト名」を確認して <strong>「リスト作成」</strong> → <strong>「アイテム追加」</strong> → <strong>「アイテム一覧」</strong></li>
  <li>ファイルを見るときは、3 で出たパスを「フォルダ」欄に貼って <strong>「ファイル一覧」</strong></li>
</ol>

<p class="warn">
  <strong>リスト作成とアイテム追加は本当に作られます。</strong>
  本番サイトでいきなり試さないでください。削除する機能はあえて入れていません。<br>
  自分の権限で見えるものしか見えず、アクセスは通常の操作と同じように監査ログに残ります。
</p>

<h2>3. 動かないとき</h2>

<p>
  ボタンを押しても何も起きない場合は、ページの CSP 設定でブックマークレットが
  ブロックされている可能性があります。
  その場合は <code>spo-explorer.js</code> を開発者ツールの Snippets に登録してください
  （手順は <code>README.md</code> の「方法B」）。同じコードがそのまま動きます。
</p>

<p style="margin-top:40px;font-size:13px;color:#888">
  詳しい使い方・API の解説・トラブルシュートは <code>README.md</code> にあります。
</p>

</body>
</html>
`;

writeFileSync(new URL('./install.html', import.meta.url), html);

console.log(`bookmarklet.txt … ${bookmarklet.length.toLocaleString()} 文字`);
console.log(`install.html    … ${html.length.toLocaleString()} 文字`);
