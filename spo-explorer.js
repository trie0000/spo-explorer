/*!
 * SPO Explorer — SharePoint Online の REST API をブラウザだけで試すサンプル
 *
 * できること
 *   1. リストの新規作成（カスタムリスト + テキスト列 Note を1本追加）
 *   2. リストへのアイテム追加
 *   3. リストアイテムの一覧表示
 *   4. ドキュメントライブラリの指定フォルダのファイル一覧
 *   5. ライブラリ上の JSON ファイルの読み込み
 *
 * 動作条件
 *   - SharePoint のページを開いたタブで実行すること（同一オリジンでないと認証が乗らない）
 *   - 実行者の権限でそのまま動く。作成系は「本当に作られる」ので検証用サイトで試すこと
 *
 * 使い方は README.md を参照。
 */
(() => {
  'use strict';

  const PANEL_ID = 'spo-explorer-panel';

  // 2回目の実行で閉じる（トグル）
  const existing = document.getElementById(PANEL_ID);
  if (existing) { existing.remove(); return; }

  // ------------------------------------------------------------------
  // 1. 接続先の Web（サイト）URL を決める
  // ------------------------------------------------------------------
  // モダンページでは _spPageContextInfo が使えることが多い。
  // 無い場合は URL から /sites/xxx ・ /teams/xxx を切り出す。
  // サブサイトを使っている場合はここを手で直すこと。
  const WEB = (window._spPageContextInfo && window._spPageContextInfo.webAbsoluteUrl)
    || (location.origin + ((location.pathname.match(/^\/(sites|teams)\/[^/]+/) || [''])[0]));

  const WEB_PATH = new URL(WEB).pathname.replace(/\/$/, '');

  // ------------------------------------------------------------------
  // 2. REST 呼び出しの共通処理
  // ------------------------------------------------------------------

  /** OData の文字列リテラル用エスケープ。' は '' にする */
  const q = (s) => String(s).replace(/'/g, "''");

  /** $filter や $select をそのまま URL に載せるためのエスケープ */
  const p = (s) => encodeURIComponent(s);

  // 更新系（POST）に必要なリクエストダイジェスト。有効期限まで使い回す。
  let digestValue = null;
  let digestExpiresAt = 0;

  async function getDigest() {
    if (digestValue && Date.now() < digestExpiresAt) return digestValue;
    const res = await fetch(WEB + '/_api/contextinfo', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!res.ok) throw new Error('contextinfo の取得に失敗: ' + res.status);
    const json = await res.json();
    digestValue = json.FormDigestValue;
    digestExpiresAt = Date.now() + (json.FormDigestTimeoutSeconds - 60) * 1000;
    return digestValue;
  }

  /**
   * REST 呼び出し本体。
   * @param {string} path  /_api/... から始まるパス（絶対 URL も可）
   * @param {object} opt   { method, body, raw }
   *                       raw:true でレスポンスを JSON parse せず文字列で返す（$value 用）
   */
  async function api(path, opt = {}) {
    const method = opt.method || 'GET';
    const headers = { Accept: opt.raw ? '*/*' : 'application/json;odata=nometadata' };

    if (method !== 'GET') headers['X-RequestDigest'] = await getDigest();
    if (opt.body !== undefined) headers['Content-Type'] = 'application/json;odata=nometadata';

    const res = await fetch(/^https?:/.test(path) ? path : WEB + path, {
      method,
      credentials: 'include',
      headers,
      body: opt.body === undefined ? undefined : JSON.stringify(opt.body),
    });

    if (!res.ok) {
      let detail = await res.text();
      try {
        const e = JSON.parse(detail);
        detail = (e['odata.error'] && e['odata.error'].message && e['odata.error'].message.value) || detail;
      } catch (_) { /* JSON でなければ生テキストのまま */ }
      throw new Error(`${res.status} ${res.statusText}\n${String(detail).slice(0, 400)}`);
    }
    if (res.status === 204) return null;
    return opt.raw ? res.text() : res.json();
  }

  // ------------------------------------------------------------------
  // 3. 各機能
  // ------------------------------------------------------------------

  /**
   * テキスト列 Note が無ければ作る。既にあれば何もしない。
   * リスト作成が途中でこけた場合に「リストはあるが列が無い」状態になるため、
   * 列の追加は独立した冪等な処理として切り出しておく。
   */
  async function ensureNoteField(listTitle) {
    const base = `/_api/web/lists/getbytitle('${q(listTitle)}')`;

    const found = await api(`${base}/fields?$select=InternalName&$filter=${p("InternalName eq 'Note'")}`);
    if (found.value.length) return false;

    // FieldTypeKind 2 = 1行テキスト（既定で 255 文字）
    //
    // ここで MaxLength などを一緒に渡すと 400 になる。
    // odata=nometadata で POST した本文は基底の SP.Field として解釈されるため、
    // サブクラス（SP.FieldText など）固有のプロパティは受け付けられない。
    // 文字数や既定値まで指定したい場合は CreateFieldAsXml を使う：
    //   POST ${base}/fields/CreateFieldAsXml
    //   { parameters: { SchemaXml: "<Field Type='Text' DisplayName='Note' Name='Note' MaxLength='128'/>" } }
    await api(`${base}/fields`, {
      method: 'POST',
      body: { Title: 'Note', FieldTypeKind: 2 },
    });

    // 追加した列は既定ビューに自動では出ない。ここは失敗しても
    // アイテムの追加・取得には影響しないので、握りつぶして先に進む。
    try {
      await api(`${base}/DefaultView/ViewFields/addviewfield('Note')`, { method: 'POST' });
    } catch (e) {
      console.warn('[SPO Explorer] 既定ビューへの列追加に失敗（列自体は作成済み）', e);
    }
    return true;
  }

  /** 1. リストの新規作成 */
  async function createList(title) {
    // 同名リストの有無を先に確認する（同名で POST すると 400 になる）
    const found = await api(`/_api/web/lists?$select=Id,Title&$filter=${p(`Title eq '${q(title)}'`)}`);

    if (found.value.length) {
      // 既にある場合も、Note 列だけ無い中途半端な状態を直せるようにしておく
      const added = await ensureNoteField(title);
      return {
        結果: `リスト「${title}」は既に存在します`,
        Note列: added ? '無かったので追加しました' : '既にあります',
        Url: await getListUrl(title),
      };
    }

    // BaseTemplate 100 = カスタムリスト（101 がドキュメントライブラリ）
    const list = await api('/_api/web/lists', {
      method: 'POST',
      body: {
        Title: title,
        BaseTemplate: 100,
        Description: 'SPO Explorer から作成',
        ContentTypesEnabled: false,
      },
    });

    await ensureNoteField(title);

    return { Title: list.Title, Id: list.Id, Url: await getListUrl(title) };
  }

  /**
   * リストの実 URL を取得する。
   * 日本語だけのタイトルで REST からリストを作ると URL が Lists/List, List1 …
   * のようになるため、タイトルから URL を組み立ててはいけない。
   */
  async function getListUrl(title) {
    const info = await api(
      `/_api/web/lists/getbytitle('${q(title)}')?$select=${p('RootFolder/ServerRelativeUrl')}&$expand=${p('RootFolder')}`
    );
    return location.origin + info.RootFolder.ServerRelativeUrl;
  }

  /** 2. アイテム追加 */
  async function addItem(listTitle, fields) {
    const post = () => api(`/_api/web/lists/getbytitle('${q(listTitle)}')/items`, {
      method: 'POST',
      body: fields,
    });

    try {
      return await post();
    } catch (e) {
      // 「プロパティ 'Note' は型 'SP.Data.XxxListItem' に存在しません」が返るのは、
      // リストはあるが Note 列が無いとき。列を作って1度だけ再試行する。
      if (/'Note'/.test(e.message) && /(存在しません|does not exist)/.test(e.message)) {
        await ensureNoteField(listTitle);
        return post();
      }
      throw e;
    }
  }

  /** 2-b. リストの列一覧（$select に何を書けるか調べる用） */
  async function getFields(listTitle) {
    // Hidden / ReadOnlyField は $filter が効かないテナントがあるので、取ってから絞る
    const json = await api(
      `/_api/web/lists/getbytitle('${q(listTitle)}')/fields` +
      `?$select=${p('Title,InternalName,TypeAsString,Required,Hidden,ReadOnlyField')}`
    );
    return json.value
      .filter((f) => !f.Hidden && !f.ReadOnlyField)
      .map((f) => ({
        表示名: f.Title,
        内部名: f.InternalName,
        型: f.TypeAsString,
        必須: f.Required ? '○' : '',
      }));
  }

  /** 3. アイテム一覧 */
  async function getItems(listTitle, select, top) {
    const query = [
      `$select=${p(select)}`,
      `$orderby=${p('Id desc')}`,
      `$top=${Number(top) || 50}`,
    ].join('&');
    const json = await api(`/_api/web/lists/getbytitle('${q(listTitle)}')/items?${query}`);
    return json.value;
  }

  /** 4-a. ドキュメントライブラリの一覧（フォルダのパスを調べる用） */
  async function getLibraries() {
    const filter = 'BaseTemplate eq 101 and Hidden eq false';
    const json = await api(
      `/_api/web/lists?$select=${p('Title,RootFolder/ServerRelativeUrl,ItemCount')}` +
      `&$expand=${p('RootFolder')}&$filter=${p(filter)}`
    );
    return json.value.map((l) => ({
      Title: l.Title,
      Path: l.RootFolder.ServerRelativeUrl,
      ItemCount: l.ItemCount,
    }));
  }

  /** 4-b. 指定フォルダのファイル・サブフォルダ一覧 */
  async function getFiles(folderPath) {
    const base = `/_api/web/GetFolderByServerRelativePath(decodedurl='${q(folderPath)}')`;

    const [files, folders] = await Promise.all([
      api(`${base}/Files?$select=${p('Name,ServerRelativeUrl,Length,TimeLastModified')}&$orderby=${p('Name')}`),
      api(`${base}/Folders?$select=${p('Name,ServerRelativeUrl,ItemCount')}&$orderby=${p('Name')}`),
    ]);

    const rows = folders.value
      // Forms は各ライブラリに必ずある内部フォルダなので隠す
      .filter((f) => f.Name !== 'Forms')
      .map((f) => ({ 種別: 'フォルダ', 名前: f.Name, サイズ: `${f.ItemCount} 件`, 更新日時: '', パス: f.ServerRelativeUrl }))
      .concat(files.value.map((f) => ({
        種別: 'ファイル',
        名前: f.Name,
        サイズ: formatBytes(f.Length),
        更新日時: String(f.TimeLastModified).replace('T', ' ').replace('Z', ''),
        パス: f.ServerRelativeUrl,
      })));

    if (!rows.length) throw new Error('このフォルダは空か、パスが違います');
    return rows;
  }

  /** 5. JSON ファイルの読み込み */
  async function readJson(filePath) {
    const text = await api(
      `/_api/web/GetFileByServerRelativePath(decodedurl='${q(filePath)}')/$value`,
      { raw: true }
    );
    // SharePoint に置いた JSON は BOM 付きのことがあるので落としてから parse する
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  }

  function formatBytes(n) {
    const b = Number(n) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  // ------------------------------------------------------------------
  // 4. 画面
  // ------------------------------------------------------------------
  // SharePoint 側の CSS に干渉されないよう Shadow DOM に閉じ込める
  const host = document.createElement('div');
  host.id = PANEL_ID;
  host.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
<style>
  :host, * { box-sizing: border-box; }
  .panel {
    width: 460px; max-height: 86vh; overflow: auto;
    background: #1f2430; color: #e6e6e6;
    font: 13px/1.6 -apple-system, "Segoe UI", "Yu Gothic UI", sans-serif;
    border: 1px solid #3a4152; border-radius: 8px;
    box-shadow: 0 8px 28px rgba(0,0,0,.4); padding: 14px;
  }
  h1 { font-size: 14px; margin: 0 0 2px; display: flex; justify-content: space-between; align-items: center; }
  h2 { font-size: 12px; margin: 16px 0 6px; color: #8fb8ff; border-bottom: 1px solid #3a4152; padding-bottom: 4px; }
  .site { font-size: 11px; color: #98a2b8; word-break: break-all; margin-bottom: 4px; }
  label { display: block; font-size: 11px; color: #98a2b8; margin-top: 6px; }
  input { width: 100%; padding: 5px 7px; background: #12151c; color: #e6e6e6;
          border: 1px solid #3a4152; border-radius: 4px; font: inherit; font-size: 12px; }
  .row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .row > * { flex: 1; }
  button { padding: 6px 10px; background: #2f4f8f; color: #fff; border: 0;
           border-radius: 4px; cursor: pointer; font: inherit; font-size: 12px; white-space: nowrap; }
  button:hover { background: #3a63b0; }
  button.write { background: #8f4a2f; }
  button.write:hover { background: #b05c3a; }
  button.x { background: transparent; color: #98a2b8; font-size: 16px; padding: 0 4px; flex: 0; }
  .out { margin-top: 12px; background: #12151c; border: 1px solid #3a4152; border-radius: 4px;
         padding: 8px; max-height: 300px; overflow: auto; font-size: 11px; }
  .out pre { margin: 0; white-space: pre-wrap; word-break: break-all; font-family: ui-monospace, Menlo, monospace; }
  .out .err { color: #ff9c9c; }
  .out .ok { color: #9cffb0; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border: 1px solid #3a4152; padding: 3px 5px; text-align: left; vertical-align: top;
           max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  th { background: #262c3a; position: sticky; top: 0; }
  .hint { font-size: 10px; color: #7c869b; margin-top: 2px; }
</style>

<div class="panel">
  <h1>SPO Explorer <button class="x" data-act="close">×</button></h1>
  <div class="site">${WEB}</div>

  <h2>リスト</h2>
  <label>リスト名</label>
  <input data-f="listTitle" value="検証用リスト">
  <div class="row">
    <button class="write" data-act="createList">リスト作成</button>
    <button data-act="getItems">アイテム一覧</button>
    <button data-act="getFields">列一覧</button>
  </div>
  <label>アイテムの Title / Note</label>
  <div class="row">
    <input data-f="itemTitle" value="サンプル1">
    <input data-f="itemNote" value="メモ">
    <button class="write" data-act="addItem">アイテム追加</button>
  </div>
  <label>一覧の $select ／ 取得件数</label>
  <div class="row">
    <input data-f="select" value="Id,Title,Note,Created,Modified">
    <input data-f="top" value="50" style="flex:0 0 60px">
  </div>
  <div class="hint">$select には「列一覧」で出る<b>内部名</b>を書きます（表示名ではありません）</div>

  <h2>ドキュメントライブラリ</h2>
  <label>フォルダ（サーバー相対パス）</label>
  <input data-f="folder" value="${WEB_PATH}/Shared Documents">
  <div class="row">
    <button data-act="getFiles">ファイル一覧</button>
    <button data-act="getLibraries">ライブラリ一覧</button>
  </div>
  <label>JSON ファイル（サーバー相対パス）</label>
  <input data-f="jsonPath" value="${WEB_PATH}/Shared Documents/sample.json">
  <div class="row">
    <button data-act="readJson">JSON 読み込み</button>
  </div>
  <div class="hint">パスが分からないときは「ライブラリ一覧」で調べられます</div>

  <div class="out" data-out><pre>ボタンを押すと結果がここに出ます（console にも出力します）</pre></div>
</div>`;

  document.body.appendChild(host);

  const val = (name) => root.querySelector(`[data-f="${name}"]`).value.trim();
  const out = root.querySelector('[data-out]');

  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function show(html) { out.innerHTML = html; out.scrollTop = 0; }

  function showJson(label, data) {
    console.log('[SPO Explorer] ' + label, data);
    show(`<pre class="ok">${esc(label)}</pre><pre>${esc(JSON.stringify(data, null, 2))}</pre>`);
  }

  function showTable(label, rows) {
    console.table(rows);
    if (!rows.length) return show(`<pre>${esc(label)}：0 件</pre>`);
    const cols = Object.keys(rows[0]);
    const head = cols.map((c) => `<th>${esc(c)}</th>`).join('');
    const body = rows.map((r) =>
      `<tr>${cols.map((c) => `<td title="${esc(r[c])}">${esc(r[c] == null ? '' : r[c])}</td>`).join('')}</tr>`
    ).join('');
    show(`<pre class="ok">${esc(label)}：${rows.length} 件</pre><table><tr>${head}</tr>${body}</table>`);
  }

  function showError(e) {
    console.error('[SPO Explorer]', e);
    show(`<pre class="err">エラー\n${esc(e.message || e)}</pre>`);
  }

  const actions = {
    close: () => host.remove(),

    createList: async () => {
      const title = val('listTitle');
      if (!confirm(`リスト「${title}」をこのサイトに作成します。よろしいですか？`)) return;
      showJson('リストを作成しました', await createList(title));
    },

    addItem: async () => {
      const fields = { Title: val('itemTitle') };
      if (val('itemNote')) fields.Note = val('itemNote');
      const item = await addItem(val('listTitle'), fields);
      showJson('アイテムを追加しました', { Id: item.Id, Title: item.Title, Note: item.Note });
    },

    getItems: async () => {
      const rows = await getItems(val('listTitle'), val('select'), val('top'));
      showTable(`${val('listTitle')} のアイテム`, rows);
    },

    getFields: async () => showTable(`${val('listTitle')} の列`, await getFields(val('listTitle'))),

    getFiles: async () => showTable(val('folder'), await getFiles(val('folder'))),

    getLibraries: async () => showTable('ドキュメントライブラリ', await getLibraries()),

    readJson: async () => showJson(val('jsonPath'), await readJson(val('jsonPath'))),
  };

  root.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      if (act !== 'close') show('<pre>実行中…</pre>');
      try {
        await actions[act]();
      } catch (e) {
        showError(e);
      }
    });
  });

  console.log('[SPO Explorer] 起動しました。接続先:', WEB);
})();
