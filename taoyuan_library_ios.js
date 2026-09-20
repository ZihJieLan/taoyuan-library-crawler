// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: book;

/**
 * 桃園市立圖書館 - 在館書目智慧檢索 (iPhone Scriptable 專用版 v2.0)
 * 
 * 特色：
 * 1. 100% 於 iPhone 本機獨立運作，不經任何第三方伺服器。
 * 2. 採用桃園圖書館官方 GraphQL API，單本查詢僅需 0.2 秒。
 * 3. 完整 Session Cookie 與 CSRF Token 管理，並啟用 SSL 信任與 10s 超時保護。
 * 4. 採用 iframe 雙向通訊協議，徹底解決 iOS WKWebView 導航中斷與卡死問題。
 * 5. 自由切換分館，精準篩選「在館可借」之書目與索書號。
 */

// 所有分館清單
const BRANCHES = [
  "中壢分館", "新總館", "青埔智慧科技分館", "龍岡分館", "內壢分館",
  "平鎮分館", "八德分館", "八德三號社宅分館", "大湳分館",
  "蘆竹分館", "龜山分館", "大溪分館", "楊梅分館", "龍潭分館",
  "大園分館", "觀音分館", "新屋分館", "會稽分館", "大林分館"
];

// 書名清理與候選詞產生
function cleanTitleCandidates(raw) {
  raw = (raw || "").trim();
  if (!raw) return [];
  const candidates = [];

  // 1. 過濾尾隨頁碼 (p.120, 88, 50頁)
  const noPage = raw.replace(/[\s\-_—,，:：]*([pP]\.?\s*\d+|\d+\s*[頁页]|\b\d{1,4}\b)\s*$/, '').trim();
  if (noPage && !candidates.includes(noPage)) candidates.push(noPage);
  if (!candidates.includes(raw)) candidates.push(raw);

  // 2. 移除年份括號 (2018), 【2020年版】
  for (const b of [...candidates]) {
    const noYear = b.replace(/[\(（\[【]\s*[\d年版民國\s]+\s*[\)）\]】]/g, '').trim();
    if (noYear && !candidates.includes(noYear)) candidates.push(noYear);
  }

  // 3. 標點替換
  for (const b of [...candidates]) {
    if (/[，,；;！!、]/.test(b)) {
      const spaceVer = b.replace(/[，,；;！!、]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (spaceVer && !candidates.includes(spaceVer)) candidates.push(spaceVer);
      const cleanVer = b.replace(/[，,；;！!、\s]+/g, '').trim();
      if (cleanVer && !candidates.includes(cleanVer)) candidates.push(cleanVer);
    }
  }

  // 4. 副標題切除 (冒號、破折號之後)
  for (const b of [...candidates]) {
    for (const sep of [':', '：', ' - ', '-', '——', '—', '? ', '？']) {
      if (b.includes(sep)) {
        let main = b.split(sep)[0].trim().replace(/^[《〈(（\[【]+|[》〉)）\]】]+$/g, '').trim();
        if (main && main.length >= 2 && !candidates.includes(main)) candidates.push(main);
      }
    }
  }

  // 5. 提取括號內核心詞
  const bm = raw.match(/[\(（《〈](.+?)[\)）》〉]/);
  if (bm) {
    const inner = bm[1].trim();
    if (inner.length >= 2 && !/^\d+$/.test(inner) && !candidates.includes(inner)) {
      candidates.push(inner);
    }
  }

  if (noPage && candidates.includes(noPage)) {
    candidates.splice(candidates.indexOf(noPage), 1);
    candidates.unshift(noPage);
  }
  return candidates;
}

// 標題相似度比對（防張冠李戴）
function normalizeTitle(t) {
  return (t || '')
    .replace(/[\(（\[【].*?[\)）\]】]/g, '')
    .replace(/\b(hyread|ebook|電子書)\b/gi, '')
    .replace(/[\s\W_]+/gu, '')
    .toLowerCase();
}

function isTitleMatch(rawTitle, foundTitle, queryCand) {
  const normRaw = normalizeTitle(rawTitle);
  const normFound = normalizeTitle(foundTitle);
  if (!normRaw || !normFound) return false;
  if (normRaw.includes(normFound) || normFound.includes(normRaw)) return true;

  const cands = queryCand ? [queryCand] : cleanTitleCandidates(rawTitle);
  for (const c of cands) {
    const nc = normalizeTitle(c);
    if (nc && nc.length >= 2 && (nc.includes(normFound) || normFound.includes(nc))) {
      return true;
    }
  }
  return false;
}

// 桃園圖書館 API 模組
class TyLibClient {
  constructor() {
    this.graphqlUrl = "https://webpac.typl.gov.tw/api/HyLibWS/graphql";
    this.baseUrl = "https://webpac.typl.gov.tw/";
    this.csrfToken = "";
    this.cookieHeader = "";
  }

  async initSession() {
    if (this.csrfToken && this.cookieHeader) return;
    try {
      const req = new Request(this.baseUrl);
      req.allowInsecureRequest = true;
      req.timeoutInterval = 10;
      req.headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      };
      const html = await req.loadString();
      const m = html.match(/"csrfToken":"([^"]+)"/);
      if (m) this.csrfToken = m[1];

      // 提取 Session Cookie
      if (req.response && req.response.cookies && req.response.cookies.length > 0) {
        this.cookieHeader = req.response.cookies.map(c => `${c.name}=${c.value}`).join('; ');
      } else if (req.response && req.response.headers) {
        const sc = req.response.headers["Set-Cookie"] || req.response.headers["set-cookie"];
        if (sc) {
          this.cookieHeader = sc.split(',').map(s => s.split(';')[0].trim()).join('; ');
        }
      }
    } catch (e) {
      console.error("Init session error: " + e);
    }
  }

  async searchBook(rawTitle) {
    await this.initSession();
    const candidates = cleanTitleCandidates(rawTitle);

    const query = `
    query search($searchForm: SearchForm) {
      search(Input: $searchForm) {
        list {
          values {
            ref {
              key
              value
            }
          }
        }
      }
    }`;

    for (const cand of candidates) {
      const encoded = encodeURIComponent(cand);
      const payload = {
        operationName: "search",
        query: query,
        variables: {
          searchForm: {
            searchField: ["FullText"],
            searchInput: [cand],
            op: [],
            keepsite: [],
            cln: [],
            queryString: `searchField=FullText&searchInput=${encoded}`
          }
        }
      };

      try {
        const req = new Request(this.graphqlUrl);
        req.method = "POST";
        req.allowInsecureRequest = true;
        req.timeoutInterval = 10;
        req.headers = {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          "Referer": "https://webpac.typl.gov.tw/search",
          "x-csrf-token": this.csrfToken || "",
          "Cookie": this.cookieHeader || ""
        };
        req.body = JSON.stringify(payload);
        const res = await req.loadJSON();
        const values = res?.data?.search?.list?.values || [];

        for (const item of values.slice(0, 5)) {
          const ref = {};
          for (const kv of item.ref || []) ref[kv.key] = kv.value;
          const foundTitle = (ref.title || "").trim();
          const sid = ref.sid || "";

          if (foundTitle && sid && isTitleMatch(rawTitle, foundTitle, cand)) {
            return {
              searchedQuery: cand,
              foundTitle: foundTitle,
              sid: sid,
              author: ref.author || "",
              isbn: ref.isbn || "",
              detailUrl: `https://webpac.typl.gov.tw/bookDetail/${sid}`
            };
          }
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  async getHoldings(sid, targetBranch = "中壢分館") {
    await this.initSession();
    const query = `
    query getHoldByKeepSite($HoldForm: HoldForm) {
      getHoldByKeepSite(Input: $HoldForm) {
        list {
          values {
            ref {
              key
              value
            }
          }
        }
      }
    }`;

    const payload = {
      operationName: "getHoldByKeepSite",
      query: query,
      variables: {
        HoldForm: {
          marcId: parseInt(sid),
          pageNo: 1,
          limit: 100,
          sort: "",
          order: "",
          keepSiteId: 0,
          canShowHoldLendAndRead: 0,
          keepSiteIdList: "",
          holdVolumnDesc: ""
        }
      }
    };

    try {
      const req = new Request(this.graphqlUrl);
      req.method = "POST";
      req.allowInsecureRequest = true;
      req.timeoutInterval = 10;
      req.headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Referer": `https://webpac.typl.gov.tw/bookDetail/${sid}`,
        "x-csrf-token": this.csrfToken || "",
        "Cookie": this.cookieHeader || ""
      };
      req.body = JSON.stringify(payload);
      const res = await req.loadJSON();
      const values = res?.data?.getHoldByKeepSite?.list?.values || [];

      const cleanTarget = targetBranch.replace("分館", "").trim();
      const targetHoldings = [];
      const otherBranches = new Set();

      for (const item of values) {
        const ref = {};
        for (const kv of item.ref || []) ref[kv.key] = kv.value;
        const branchName = (ref.keepSiteLabelName || "").trim();
        const roomName = (ref.keepRoomLabelName || "").trim();
        const callNum = (ref.callNumber || "").trim();
        const status = (ref.bookStatusLabelName || "").trim();
        const barcode = (ref.barcode || "").trim();

        const isAvailable = (status.includes("在館") || status.includes("可借")) &&
          !["外借", "借出", "預約", "移送", "通閱", "遺失", "破損"].some(x => status.includes(x));

        const itemData = {
          branch: branchName,
          room: roomName,
          location: roomName ? `${branchName}/${roomName}` : branchName,
          callNumber: callNum,
          status: status,
          barcode: barcode,
          isAvailable: isAvailable
        };

        if (branchName.includes(cleanTarget)) {
          targetHoldings.push(itemData);
        } else if (branchName) {
          otherBranches.add(branchName);
        }
      }

      const availableItems = targetHoldings.filter(h => h.isAvailable);

      return {
        hasTarget: targetHoldings.length > 0,
        availableItems: availableItems,
        targetHoldings: targetHoldings,
        otherBranches: Array.from(otherBranches)
      };
    } catch (e) {
      return { hasTarget: false, availableItems: [], targetHoldings: [], otherBranches: [] };
    }
  }
}

// 產生前端 HTML 介面
function generateHTML() {
  const branchOptions = BRANCHES.map(b => 
    `<option value="${b}" ${b === "中壢分館" ? "selected" : ""}>${b}</option>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>桃園圖書館在館書目查詢</title>
<style>
  :root {
    --bg-color: #f2f2f7;
    --card-bg: #ffffff;
    --text-primary: #1c1c1e;
    --text-secondary: #8e8e93;
    --accent-color: #007aff;
    --success-color: #34c759;
    --border-color: #e5e5ea;
    --callno-bg: #fff9e6;
    --callno-text: #b25e00;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg-color: #000000;
      --card-bg: #1c1c1e;
      --text-primary: #ffffff;
      --text-secondary: #8e8e93;
      --accent-color: #0a84ff;
      --success-color: #30d158;
      --border-color: #2c2c2e;
      --callno-bg: #332600;
      --callno-text: #ffd60a;
    }
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0;
    padding: env(safe-area-inset-top, 20px) 16px env(safe-area-inset-bottom, 20px) 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: var(--bg-color);
    color: var(--text-primary);
  }
  .header {
    text-align: center;
    padding: 12px 0 16px 0;
  }
  .header h1 {
    font-size: 1.3rem;
    font-weight: 700;
    margin: 0 0 4px 0;
  }
  .header p {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin: 0;
  }
  .card {
    background: var(--card-bg);
    border-radius: 14px;
    padding: 16px;
    margin-bottom: 14px;
    border: 1px solid var(--border-color);
  }
  .form-group {
    margin-bottom: 12px;
  }
  label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 6px;
    color: var(--text-secondary);
  }
  select, textarea {
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--border-color);
    background: var(--bg-color);
    color: var(--text-primary);
    font-size: 0.95rem;
    outline: none;
    transition: border-color 0.2s;
  }
  select:focus, textarea:focus {
    border-color: var(--accent-color);
  }
  textarea {
    height: 120px;
    resize: none;
    line-height: 1.4;
  }
  button {
    width: 100%;
    padding: 12px;
    border-radius: 10px;
    border: none;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
  }
  button:active {
    opacity: 0.8;
    transform: scale(0.98);
  }
  .btn-primary {
    background-color: var(--accent-color);
    color: #ffffff;
  }
  .btn-secondary {
    background-color: var(--border-color);
    color: var(--text-primary);
    font-size: 0.85rem;
    padding: 8px 12px;
    width: auto;
  }
  .btn-copy {
    background-color: var(--success-color);
    color: #ffffff;
    margin-top: 10px;
    display: none;
  }
  .progress-wrap {
    display: none;
    margin-top: 14px;
  }
  .progress-bar-bg {
    height: 6px;
    background: var(--border-color);
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    width: 0%;
    background: var(--accent-color);
    transition: width 0.2s ease;
  }
  .progress-text {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin-top: 6px;
    text-align: center;
  }
  .result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .result-title {
    font-size: 1.05rem;
    font-weight: 700;
  }
  .badge-count {
    background: var(--success-color);
    color: #ffffff;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .book-item {
    background: var(--bg-color);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 10px;
    border: 1px solid var(--border-color);
  }
  .book-title {
    font-size: 1rem;
    font-weight: 700;
    margin-bottom: 4px;
    line-height: 1.3;
  }
  .callno-box {
    display: inline-block;
    background: var(--callno-bg);
    color: var(--callno-text);
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 700;
    margin: 4px 0;
  }
  .meta-text {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin-top: 2px;
  }
  .empty-state {
    text-align: center;
    color: var(--text-secondary);
    padding: 30px 10px;
    font-size: 0.9rem;
  }
  .toast {
    position: fixed;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.85);
    color: #fff;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 0.85rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    z-index: 100;
  }
  .toast.show { opacity: 1; }
</style>
</head>
<body>
  <div class="header">
    <h1>📚 桃園圖書館在館查書</h1>
    <p>純 iPhone 本機執行 · 官方高速直連</p>
  </div>

  <div class="card">
    <div class="form-group">
      <label for="branchSelect">🎯 目標分館</label>
      <select id="branchSelect">${branchOptions}</select>
    </div>

    <div class="form-group">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <label style="margin: 0;">📖 查詢書單（每行一本）</label>
        <button type="button" class="btn-secondary" id="btnSample">填入範例</button>
      </div>
      <textarea id="bookListInput" placeholder="請在此貼上欲查詢書名，例如：\n原子習慣\n七堂簡單物理課\n被討厭的勇氣\n投資金律"></textarea>
    </div>

    <button type="button" class="btn-primary" id="btnStart">開始查詢（在館可借）</button>

    <div class="progress-wrap" id="progressWrap">
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" id="progressFill"></div>
      </div>
      <div class="progress-text" id="progressText">準備查詢...</div>
    </div>
  </div>

  <div class="card" id="resultCard" style="display: none;">
    <div class="result-header">
      <div class="result-title">🎉 在館可借清單</div>
      <div class="badge-count" id="availableCount">0 本</div>
    </div>
    <div id="resultList"></div>
    <button type="button" class="btn-copy" id="btnCopy">📋 一鍵複製在館書單與索書號</button>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const sampleBooks = [
      "原子習慣",
      "七堂簡單物理課",
      "投資金律",
      "被討厭的勇氣",
      "精準回饋",
      "蒙格之道"
    ];

    const btnSample = document.getElementById('btnSample');
    const bookInput = document.getElementById('bookListInput');
    const branchSelect = document.getElementById('branchSelect');
    const btnStart = document.getElementById('btnStart');
    const btnCopy = document.getElementById('btnCopy');
    const progressWrap = document.getElementById('progressWrap');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const resultCard = document.getElementById('resultCard');
    const resultList = document.getElementById('resultList');
    const availableCount = document.getElementById('availableCount');
    const toast = document.getElementById('toast');

    let currentAvailableBooks = [];

    function showToast(msg) {
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }

    // 使用 iframe 發送協議，徹底避免主頁面導航中斷或被取消的問題
    function sendToScriptable(scheme, data) {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = scheme + '://' + encodeURIComponent(typeof data === 'string' ? data : JSON.stringify(data));
      document.body.appendChild(iframe);
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch(e) {}
      }, 300);
    }

    btnSample.addEventListener('click', () => {
      bookInput.value = sampleBooks.join('\\n');
      showToast('已填入 6 本範例書目');
    });

    btnCopy.addEventListener('click', () => {
      if (currentAvailableBooks.length === 0) return;
      const lines = currentAvailableBooks.map((b, i) => 
        \`\${i + 1}. \${b.title} [索書號: \${b.callNumber}] (\${b.room || b.branch})\`
      );
      const text = \`📚 \${branchSelect.value} 在館可借書單 (\${currentAvailableBooks.length} 本)：\\n\\n\` + lines.join('\\n');
      
      navigator.clipboard.writeText(text).then(() => {
        showToast('✅ 已複製書單到剪貼簿！');
      }).catch(() => {
        sendToScriptable('scriptable-copy', text);
      });
    });

    btnStart.addEventListener('click', () => {
      const text = bookInput.value.trim();
      if (!text) {
        showToast('請先貼上或輸入書名！');
        return;
      }
      const books = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
      if (books.length === 0) {
        showToast('請輸入有效書名！');
        return;
      }

      btnStart.disabled = true;
      progressWrap.style.display = 'block';
      progressFill.style.width = '0%';
      progressText.innerText = \`正在準備查詢 \${books.length} 本書...\`;
      resultCard.style.display = 'none';
      resultList.innerHTML = '';
      currentAvailableBooks = [];

      sendToScriptable('scriptable-query', {
        targetBranch: branchSelect.value,
        books: books
      });
    });

    // 接收來自 Scriptable 的進度回傳
    window.onProgress = function(data) {
      progressFill.style.width = data.percent + '%';
      progressText.innerText = \`[\${data.index}/\${data.total}] \${data.message}\`;
    };

    // 接收來自 Scriptable 的錯誤回傳
    window.onError = function(err) {
      btnStart.disabled = false;
      progressText.innerText = '查詢異常：' + err;
      showToast('查詢過程發生異常');
    };

    // 接收來自 Scriptable 的完成回傳
    window.onFinished = function(availableBooks) {
      btnStart.disabled = false;
      progressWrap.style.display = 'none';
      resultCard.style.display = 'block';
      currentAvailableBooks = availableBooks;
      availableCount.innerText = \`\${availableBooks.length} 本\`;

      if (availableBooks.length === 0) {
        resultList.innerHTML = \`
          <div class="empty-state">
            <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
            <div>目前目標分館無「在館可借」之書目</div>
            <div style="font-size: 0.8rem; margin-top: 4px; color: var(--text-secondary);">（可能藏書在外借中，或僅於其他分館有藏書）</div>
          </div>\`;
        btnCopy.style.display = 'none';
      } else {
        btnCopy.style.display = 'block';
        resultList.innerHTML = availableBooks.map((b, i) => \`
          <div class="book-item">
            <div class="book-title">\${i + 1}. \${b.title}</div>
            <div class="callno-box">索書號：\${b.callNumber || '未提供'}</div>
            <div class="meta-text">📍 \${b.location} · 條碼: \${b.barcode || '-'}</div>
          </div>
        \`).join('');
      }
    };
  </script>
</body>
</html>`;
}

// 主執行流程
async function run() {
  const client = new TyLibClient();
  const webView = new WebView();
  const html = generateHTML();
  await webView.loadHTML(html);

  // 攔截 WebView 的自訂 URL 協議以進行雙向通訊
  webView.shouldAllowRequest = (req) => {
    const url = req.url;

    if (url.startsWith("scriptable-query://")) {
      const payloadStr = decodeURIComponent(url.replace("scriptable-query://", ""));
      let payload = {};
      try {
        payload = JSON.parse(payloadStr);
      } catch (e) {
        return false;
      }

      (async () => {
        try {
          const targetBranch = payload.targetBranch || "中壢分館";
          const books = payload.books || [];
          const total = books.length;
          const availableResults = [];

          for (let i = 0; i < total; i++) {
            const rawTitle = books[i];
            const percent = Math.round(((i + 1) / total) * 100);

            // 安全更新進度到 WebView
            const progressData = JSON.stringify({
              index: i + 1,
              total: total,
              percent: percent,
              message: "正在查詢：" + rawTitle
            });
            await webView.evaluateJavaScript(`window.onProgress(${progressData});`).catch(() => {});

            // 1. 搜尋書籍
            const searchRes = await client.searchBook(rawTitle);
            if (searchRes && searchRes.sid) {
              // 2. 查詢館藏狀態
              const holdInfo = await client.getHoldings(searchRes.sid, targetBranch);
              if (holdInfo && holdInfo.availableItems && holdInfo.availableItems.length > 0) {
                for (const item of holdInfo.availableItems) {
                  availableResults.push({
                    title: searchRes.foundTitle,
                    callNumber: item.callNumber,
                    location: item.location,
                    room: item.room,
                    branch: item.branch,
                    barcode: item.barcode,
                    detailUrl: searchRes.detailUrl
                  });
                }
              }
            }
            // 輕量保護間隔 (使用 Scriptable 原生 Timer)
            await new Promise(resolve => {
              try {
                Timer.schedule(100, false, resolve);
              } catch (e) {
                resolve();
              }
            });
          }

          // 完成通知與震動
          try { Haptic.success(); } catch (e) {}
          try {
            const n = new Notification();
            n.title = "桃園圖書館查書完成！";
            n.body = `【${targetBranch}】共找到 ${availableResults.length} 本在館可借書籍。`;
            n.schedule();
          } catch (e) {}

          // 回傳結果至 WebView
          const safeJson = JSON.stringify(availableResults);
          await webView.evaluateJavaScript(`window.onFinished(${safeJson});`).catch(() => {});
        } catch (err) {
          console.error("Query loop error: " + err);
          await webView.evaluateJavaScript(`window.onError(${JSON.stringify(String(err))});`).catch(() => {});
        }
      })();

      return false;
    } else if (url.startsWith("scriptable-copy://")) {
      const textToCopy = decodeURIComponent(url.replace("scriptable-copy://", ""));
      Pasteboard.copy(textToCopy);
      return false;
    }

    return true;
  };

  await webView.present(true);
}

await run();
