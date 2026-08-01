# SPO Explorer

SharePoint Online の REST API を、ブラウザだけで試すためのサンプルです。
アプリ登録も追加の認証も不要で、**開いているページのログインセッションをそのまま使います**。

| ファイル | 中身 |
|---|---|
| **`install.html`** | **まずこれを開く。** ボタンをブックマークバーにドラッグすれば導入完了 |
| `spo-explorer.js` | 本体。これ1本で完結しています |
| `bookmarklet.txt` | 上を `javascript:` URL に変換したもの（ブックマークの URL 欄に直接貼る用） |
| `sample.json` | JSON 読み込みの動作確認用。ライブラリに置いて使う |
| `build.mjs` | `.js` を編集したあと `install.html` と `bookmarklet.txt` を再生成する（Node が要る） |
| `bookmarklet-builder.html` | 同上を Node なしで行うためのページ |

---

## 1. できること

パネルのボタンに対応した、5つの操作です。

1. **リスト作成** — カスタムリストを作り、テキスト列 `Note` を1本足して既定ビューに表示する
2. **アイテム追加** — `Title` と `Note` を指定して1件追加する
3. **アイテム一覧** — `$select` と件数を指定して取得し、表で表示する
4. **ファイル一覧** — ドキュメントライブラリの指定フォルダの、ファイルとサブフォルダを一覧する
5. **JSON 読み込み** — ライブラリ上の `.json` を取得してパースする

補助として「ライブラリ一覧」ボタンがあります。
フォルダのサーバー相対パスが分からないときは、まずこれを押してください。

結果はパネルにも出ますが、**ブラウザの開発者ツールの Console にも同じものを出しています**。
`console.table()` で整形されるので、件数が多いときはそちらのほうが見やすいです。

---

## 2. 使い方

**まず方法Aを試してください。** 動かない場合だけ方法B・Cに切り替えます。
どの方法でも、実行されるコードは同じです。

### 方法A：ブックマークレット（まずはこれ）

1. **`install.html` をブラウザで開く**
2. 「SPO Explorer」ボタンを**ブックマークバーにドラッグ**

以上です。以後は SharePoint のページでボタンを1回押すだけで、パネルが出ます。

ブックマークレットは `install.html` に埋め込み済みなので、`spo-explorer.js` を読み込ませる操作は要りません。
ドラッグできない環境では、`bookmarklet.txt` の中身をブックマークの URL 欄に直接貼っても同じです。

**動作確認**（検証用サイトで）

1. ブックマークをクリック → 画面右上にパネルが出る
2. まず「ライブラリ一覧」を押す（読み取りだけなので安全）。表が出れば成功
3. 「リスト作成」→「アイテム追加」→「アイテム一覧」の順に試す
4. 2 で出たパスを「フォルダ」欄に貼って「ファイル一覧」

> **無反応のときは方法Bへ。**
> ページの CSP（Content-Security-Policy）設定によっては、ブックマークレットが
> 動かないことがあります。仕様上はブックマークレットは CSP の対象外ですが、
> ブラウザやテナントの設定によって挙動が違います。

### 方法B：Snippets に登録する（方法Aが動かないとき）

開発者ツールに JavaScript を保存しておき、どのページでも実行できる機能です。
CSP の影響を受けません。

1. `Cmd + Option + I`（Windows は `F12`）で開発者ツールを開く
2. 上部タブの **Sources** → 左ペインの **Snippets**
   - 見当たらなければ、左ペインのタブ列の `»` を押すと出てきます
3. `+ New snippet` をクリックし、名前を `spo-explorer` などに変更
4. 右側のエディタに `spo-explorer.js` の中身を貼って `Cmd + S`（`Ctrl + S`）で保存
5. 以後は、ファイル名を右クリック → **Run**（またはエディタ上で `Cmd + Enter`）

一度登録すればブラウザに残るので、貼り直しは要りません。

> **実行の起点は開発者ツールですが、操作は違います。**
> Run で行われるのは「パネルをページに差し込む」ことだけなので、
> **そのあと開発者ツールは閉じてかまいません。** パネルはページ上に残り、
> ボタン操作もそのまま動きます。
> ただし Console の出力を見たい場合は開いたままにしてください
> （閉じている間の `console.log` は Chrome では保持されません）。

### 方法C：Console に貼る（その場かぎり）

1. SharePoint のサイトを開く
2. 開発者ツール → **Console** タブ
3. `spo-explorer.js` の中身を全部貼り付けて Enter

初回は Chrome / Edge が貼り付けをブロックすることがあります。
その場合は指示どおり `allow pasting` と入力してから、もう一度貼ってください。

タブを閉じると消えるので、繰り返し使うなら方法A・Bにしてください。

### 選び方

| | 起動の手数 | 動かない環境 |
|---|---|---|
| **A. ブックマークレット** | ボタン1回 | CSP の設定次第で無反応 |
| **B. Snippets** | 開発者ツールを開いて Run | 開発者ツールがポリシーで無効な場合 |
| **C. Console に貼る** | 毎回コピペ | 同上 |

チームに配るときは、まずAを案内し、
「無反応だった人は B」と添えておくのが摩擦が少ないです。

---

## 3. 動かすときの前提

- **SharePoint のページを開いたタブで実行すること。**
  ブックマークレットはそのページのオリジンで動くので、認証 Cookie がそのまま効きます。
  逆に、別サイト（`about:blank` など）では絶対に動きません。
- **オリジンが違うと届きません。** 同じテナントの `/sites/A` と `/sites/B` は同一オリジンなので
  どちらからでも読めますが、OneDrive（`＜テナント＞-my.sharepoint.com`）は別オリジンです。
  その場合は OneDrive のタブで実行し直してください。
- **サブサイトを使っている場合**は、スクリプト冒頭の `WEB` の決め方を直す必要があります
  （`_spPageContextInfo` が使えれば自動で正しくなります）。
- **自分の権限を超えることはできません。** 見えないものは API でも見えません。
  アクセスは通常の操作と同様に監査ログに残ります。

---

## 4. 注意（作成系を試す前に）

**リスト作成・アイテム追加は本当に作られます。**
UI を経由しないぶん確認ダイアログもないので、まず検証用サイトか、自分で作ったサイトで試してください。
リスト作成だけは、誤操作防止のため確認ダイアログを入れてあります。

削除系はあえて実装していません。必要になっても、まず参照系だけで確認してから足してください。

---

## 5. コードのポイント

### 認証

何もしていません。`fetch` に `credentials: 'include'` を付けるだけで、
ブラウザが持っているセッション Cookie が自動で乗ります。

### `Accept` ヘッダ

```
Accept: application/json;odata=nometadata
```

これを付けないと、レスポンスに `__metadata` などの余分な情報が大量に混ざります。
`nometadata` にすると素直な JSON になり、POST するときも `__metadata` を書かずに済みます。

### リクエストダイジェスト

GET には不要ですが、**POST には `X-RequestDigest` ヘッダが要ります**。

```js
const res = await fetch(WEB + '/_api/contextinfo', { method: 'POST', ... });
const digest = (await res.json()).FormDigestValue;
```

有効期限（既定 30分程度）があるので、`FormDigestTimeoutSeconds` を見て使い回しています。
403 が返ってきたときは、まずここを疑ってください。

### パスの指定

`GetFolderByServerRelativePath(decodedurl='...')` を使っています。
古い記事によく出てくる `GetFolderByServerRelativeUrl('...')` でも動きますが、
**日本語のフォルダ名やファイル名が混ざると `decodedurl` のほうが安全です。**

いずれの場合も、パス中の `'`（シングルクォート）は `''` と二重にしてエスケープします。

---

## 6. API 早見表

| やりたいこと | エンドポイント |
|---|---|
| リスト一覧 | `GET /_api/web/lists?$select=Title,Id` |
| ドキュメントライブラリだけ | `GET /_api/web/lists?$filter=BaseTemplate eq 101` |
| リスト作成 | `POST /_api/web/lists` — `{Title, BaseTemplate: 100}` |
| 列の追加 | `POST /_api/web/lists/getbytitle('X')/fields` — `{Title, FieldTypeKind: 2}` |
| アイテム取得 | `GET /_api/web/lists/getbytitle('X')/items?$select=...&$top=100` |
| アイテム追加 | `POST /_api/web/lists/getbytitle('X')/items` |
| アイテム更新 | `POST .../items(1)` + ヘッダ `X-HTTP-Method: MERGE`, `IF-MATCH: *` |
| フォルダ内のファイル | `GET /_api/web/GetFolderByServerRelativePath(decodedurl='/sites/A/Shared Documents')/Files` |
| ファイルの中身 | `GET /_api/web/GetFileByServerRelativePath(decodedurl='...')/$value` |
| ファイルのアップロード | `POST .../Files/add(url='a.json',overwrite=true)` + 本文にバイト列 |

### 落とし穴

| 症状 | 原因 |
|---|---|
| `_spPageContextInfo is not defined` | ページによっては未定義。URL から組み立てるか `/_api/web?$select=Url` で取る |
| 403 | POST でダイジェスト不足、または権限不足 |
| `$select` でエラー | 列の**表示名**ではなく内部名を指定する。「列一覧」ボタンで調べられる。日本語列は `OData__x30d1...` のようになっている |
| 一覧が5000件で頭打ち | リストビューのしきい値。`@odata.nextLink` を辿ってページングする |
| 作成者などを出したい | `$select=Author/Title&$expand=Author` のように `$expand` が必要 |

### `プロパティ 'X' は型 'Y' に存在しません` と言われたら

400 でこのメッセージが返るパターンは 2 通りあります。**型名 `Y` を見れば区別できます。**

**(1) 型名が `SP.Data.〜ListItem` のとき** — その列がリストに無い。

```
プロパティ 'Note' は型 'SP.Data.List2ListItem' に存在しません。
```

「列一覧」ボタンで内部名を確認してください。
リスト作成が途中でこけると「リストはあるが列が無い」状態になります。
その場合は同じリスト名で**もう一度「リスト作成」を押せば、足りない列だけ追加します**
（アイテム追加時にも自動でリカバリするようにしてあります）。

なお型名の `List2` は、そのリストの URL が `Lists/List2` であることを意味します。
**日本語だけのタイトルで REST からリストを作ると、URL は `List` `List1` `List2` … になります。**
タイトルから URL を組み立てないでください（このツールは `RootFolder/ServerRelativeUrl` を読んで返します）。

**(2) 型名が `SP.Field` などの基底クラスのとき** — プロパティは実在するが、サブクラスのもの。

```
プロパティ 'MaxLength' は型 'SP.Field' に存在しません。
```

`odata=nometadata` で POST した本文は基底クラスとして解釈されるため、
`SP.FieldText` の `MaxLength` や `SP.FieldChoice` の `Choices` は渡せません。
基底クラスにあるプロパティ（`Title`, `FieldTypeKind`, `Required`, `Description` など）だけで足りるなら、
**そのプロパティを削るのが一番簡単です**（テキスト列の `MaxLength` は既定 255）。

どうしても必要なら `CreateFieldAsXml` を使います。

```js
await api(`/_api/web/lists/getbytitle('X')/fields/CreateFieldAsXml`, {
  method: 'POST',
  body: { parameters: { SchemaXml: "<Field Type='Text' DisplayName='Note' Name='Note' MaxLength='128'/>" } },
});
```

または `Accept` / `Content-Type` を `odata=verbose` にして `__metadata: { type: 'SP.FieldText' }` を明示します。
ただし verbose にするとレスポンスも冗長になるので、このツールでは前者を勧めます。

5000件超のページングはこう書きます。

```js
let next = url, all = [];
while (next) {
  const j = await (await fetch(next, { headers: { Accept: 'application/json;odata=nometadata' } })).json();
  all.push(...j.value);
  next = j['@odata.nextLink'];
}
```
