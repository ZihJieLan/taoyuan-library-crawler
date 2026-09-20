// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: book;

/**
 * 桃園市立圖書館 - 在館書目智慧檢索 (iPhone Scriptable 專用版 v3.1)
 * 
 * v3.1 更新重點：
 * 1. 【重大修復】修復 JavaScript 正則表達式 Unicode 陷阱：
 *    原先前導的 [\s\W_]+ 在 JS 中會將所有中文字元視為 \W 誤殺抹除成空字串，
 *    導致比對書名失敗並判定為「查無此書」。現已全面改用 Unicode 屬性 [^\p{L}\p{N}]+，
 *    完整保留繁簡中文、英數字並支援跨語言書名。
 * 2. 【比對增強】加入 LCS 序列相似度比對演算法（相似度 >= 0.65），完全同步 Python 端邏輯。
 * 3. 【網路穩健】修復 iOS Request 空白 Cookie Header 覆蓋問題，確保 Session 正常維持。
 * 4. 【版本標示】於介面頂端與標題明確標註版本號碼 v3.1，便於手機端即時辨識。
 * 5. 【跨平台斷行】支援 \r\n 與 \n 自動識別，貼上書單遇到空白行時自動截斷後續已讀書目。
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

  // 1. 過濾尾隨頁碼 (p.120, 88, 50頁, -298)
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
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase();
}

// LCS 序列相似度比對（防張冠李戴，同步 Python 端 SequenceMatcher 效果）
function similarityRatio(s1, s2) {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  const l1 = s1.length;
  const l2 = s2.length;
  const dp = Array(l2 + 1).fill(0);
  for (let i = 1; i <= l1; i++) {
    let prev = 0;
    for (let j = 1; j <= l2; j++) {
      const temp = dp[j];
      if (s1[i - 1] === s2[j - 1]) {
        dp[j] = prev + 1;
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return (2.0 * dp[l2]) / (l1 + l2);
}

function isTitleMatch(rawTitle, foundTitle, queryCand) {
  const normRaw = normalizeTitle(rawTitle);
  const normFound = normalizeTitle(foundTitle);
  if (!normRaw || !normFound) return false;
  if (normRaw.includes(normFound) || normFound.includes(normRaw)) return true;
  if (similarityRatio(normRaw, normFound) >= 0.65) return true;

  const cands = queryCand ? [queryCand] : cleanTitleCandidates(rawTitle);
  for (const c of cands) {
    const nc = normalizeTitle(c);
    if (nc && nc.length >= 2) {
      if (nc.includes(normFound) || normFound.includes(nc)) return true;
      if (nc.length >= 3 && similarityRatio(nc, normFound) >= 0.65) return true;
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
        const reqHeaders = {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          "Referer": "https://webpac.typl.gov.tw/search",
          "x-csrf-token": this.csrfToken || ""
        };
        if (this.cookieHeader) {
          reqHeaders["Cookie"] = this.cookieHeader;
        }
        req.headers = reqHeaders;
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
      const reqHeaders = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Referer": `https://webpac.typl.gov.tw/bookDetail/${sid}`,
        "x-csrf-token": this.csrfToken || ""
      };
      if (this.cookieHeader) {
        reqHeaders["Cookie"] = this.cookieHeader;
      }
      req.headers = reqHeaders;
      req.body = JSON.stringify(payload);
      const res = await req.loadJSON();
      const values = res?.data?.getHoldByKeepSite?.list?.values || [];

      const cleanTarget = targetBranch.replace("分館", "").trim();
      const targetHoldings = [];
      const otherBranches = new Set();
      const allHoldings = [];

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

        allHoldings.push(itemData);

        if (branchName.includes(cleanTarget)) {
          targetHoldings.push(itemData);
        } else if (branchName) {
          otherBranches.add(branchName);
        }
      }

      const availableItems = targetHoldings.filter(h => h.isAvailable);

      let classification = "NO_HOLDINGS";
      if (targetHoldings.length > 0) {
        classification = availableItems.length > 0 ? "TARGET_AVAILABLE" : "TARGET_BORROWED";
      } else if (allHoldings.length > 0) {
        classification = "OTHER_BRANCHES";
      }

      return {
        classification: classification,
        availableItems: availableItems,
        targetHoldings: targetHoldings,
        otherBranches: Array.from(otherBranches),
        allHoldings: allHoldings
      };
    } catch (e) {
      return { classification: "NO_HOLDINGS", availableItems: [], targetHoldings: [], otherBranches: [], allHoldings: [] };
    }
  }
}

// 產生前端 HTML 介面
function generateHTML(initialText = "") {
  const branchOptions = BRANCHES.map(b => 
    `<option value="${b}" ${b === "中壢分館" ? "selected" : ""}>${b}</option>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>桃園圖書館在館書目查詢 v3.1</title>
<style>
  :root {
    --bg-color: #f2f2f7;
    --card-bg: #ffffff;
    --text-primary: #1c1c1e;
    --text-secondary: #8e8e93;
    --accent-color: #007aff;
    --success-color: #34c759;
    --warning-color: #ff9500;
    --other-color: #af52de;
    --danger-color: #ff3b30;
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
      --warning-color: #ff9f0a;
      --other-color: #bf5af2;
      --danger-color: #ff453a;
      --border-color: #2c2c2e;
      --callno-bg: #332600;
      --callno-text: #ffd60a;
    }
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0;
    padding: env(safe-area-inset-top, 20px) 14px env(safe-area-inset-bottom, 20px) 14px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: var(--bg-color);
    color: var(--text-primary);
  }
  .header {
    text-align: center;
    padding: 10px 0 14px 0;
  }
  .header h1 {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0 0 4px 0;
  }
  .header p {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin: 0;
  }
  .card {
    background: var(--card-bg);
    border-radius: 14px;
    padding: 14px;
    margin-bottom: 12px;
    border: 1px solid var(--border-color);
  }
  .form-group {
    margin-bottom: 10px;
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
    height: 125px;
    resize: none;
    line-height: 1.4;
  }
  .btn-group-sm {
    display: flex;
    gap: 6px;
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
    font-size: 0.8rem;
    padding: 6px 10px;
    width: auto;
  }
  .btn-danger-sm {
    background-color: rgba(255, 59, 48, 0.12);
    color: var(--danger-color);
    font-size: 0.8rem;
    padding: 6px 10px;
    width: auto;
  }
  .btn-copy {
    background-color: var(--success-color);
    color: #ffffff;
    margin-top: 12px;
    padding: 11px;
    font-size: 0.95rem;
  }
  .progress-wrap {
    display: none;
    margin-top: 12px;
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
  
  /* 5 大分頁切換按鈕區 */
  .tabs-container {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 6px;
    margin-bottom: 10px;
    -webkit-overflow-scrolling: touch;
  }
  .tabs-container::-webkit-scrollbar { display: none; }
  .tab-btn {
    flex: 0 0 auto;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.82rem;
    font-weight: 600;
    background: var(--bg-color);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    width: auto;
  }
  .tab-btn.active {
    background: var(--accent-color);
    color: #ffffff;
    border-color: var(--accent-color);
  }
  
  /* 書籍卡片清單 */
  .book-item {
    background: var(--bg-color);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 8px;
    border: 1px solid var(--border-color);
  }
  .book-title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 4px;
  }
  .book-title {
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.3;
    flex: 1;
  }
  .badge {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 6px;
    flex: 0 0 auto;
  }
  .badge-available { background: rgba(52, 199, 89, 0.15); color: var(--success-color); }
  .badge-borrowed { background: rgba(255, 149, 0, 0.15); color: var(--warning-color); }
  .badge-other { background: rgba(175, 82, 222, 0.15); color: var(--other-color); }
  .badge-notfound { background: rgba(255, 59, 48, 0.15); color: var(--danger-color); }

  .callno-box {
    display: inline-block;
    background: var(--callno-bg);
    color: var(--callno-text);
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 700;
    margin: 4px 0;
  }
  .meta-text {
    font-size: 0.78rem;
    color: var(--text-secondary);
    margin-top: 2px;
    line-height: 1.35;
  }
  .empty-state {
    text-align: center;
    color: var(--text-secondary);
    padding: 25px 10px;
    font-size: 0.85rem;
  }
  .toast {
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.88);
    color: #fff;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 0.82rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    z-index: 100;
    white-space: nowrap;
  }
  .toast.show { opacity: 1; }
</style>
</head>
<body>
  <div class="header">
    <h1>📚 桃園圖書館在館查書 v3.1</h1>
    <p>純 iPhone 本機執行 · 官方高速直連 · v3.1</p>
  </div>

  <div class="card">
    <div class="form-group">
      <label for="branchSelect">🎯 目標分館</label>
      <select id="branchSelect">${branchOptions}</select>
    </div>

    <div class="form-group">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <label style="margin: 0;">📖 查詢書單（自動過濾已讀）</label>
        <div class="btn-group-sm">
          <button type="button" class="btn-secondary" id="btnPaste">📋 貼上剪貼簿</button>
          <button type="button" class="btn-secondary" id="btnSample">填入範例</button>
          <button type="button" class="btn-danger-sm" id="btnClear">一鍵清空</button>
        </div>
      </div>
      <textarea id="bookListInput" placeholder="請在此貼上欲查詢書名清單...\n（貼上時會自動略過「閱讀書目」標題；遇到第一個空白行時，會自動截斷後方已讀書目）">${initialText ? initialText.replace(/</g, "&lt;").replace(/>/g, "&gt;") : ""}</textarea>
    </div>

    <button type="button" class="btn-primary" id="btnStart">開始查詢</button>

    <div class="progress-wrap" id="progressWrap">
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" id="progressFill"></div>
      </div>
      <div class="progress-text" id="progressText">準備查詢...</div>
    </div>
  </div>

  <div class="card" id="resultCard" style="display: none;">
    <!-- 5 大分類切換頁籤 -->
    <div class="tabs-container">
      <button type="button" class="tab-btn active" data-tab="AVAILABLE" id="tabAvailable">🌟 在館可借 (0)</button>
      <button type="button" class="tab-btn" data-tab="BORROWED" id="tabBorrowed">⏳ 已外借 (0)</button>
      <button type="button" class="tab-btn" data-tab="OTHER" id="tabOther">📍 他館有書 (0)</button>
      <button type="button" class="tab-btn" data-tab="NOTFOUND" id="tabNotFound">❓ 查無此書 (0)</button>
      <button type="button" class="tab-btn" data-tab="ALL" id="tabAll">📚 全部書目 (0)</button>
    </div>

    <div id="resultList"></div>
    <button type="button" class="btn-copy" id="btnCopy">📋 一鍵複製當前清單</button>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const sampleBooks = [
      "彼得林區 選股戰略",
      "一個投機者的告白之證券心理學(2018)",
      "投資金律",
      "滾動內容複利",
      "精準回饋",
      "致富的特權",
      "死亡不存在",
      "七堂簡單物理課",
      "原子習慣",
      "操控與反操控：德國法律人都在使用的日常修辭邏輯與謬誤偵知法"
    ];

    const btnPaste = document.getElementById('btnPaste');
    const btnSample = document.getElementById('btnSample');
    const btnClear = document.getElementById('btnClear');
    const bookInput = document.getElementById('bookListInput');
    const branchSelect = document.getElementById('branchSelect');
    const btnStart = document.getElementById('btnStart');
    const btnCopy = document.getElementById('btnCopy');
    const progressWrap = document.getElementById('progressWrap');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const resultCard = document.getElementById('resultCard');
    const resultList = document.getElementById('resultList');
    const toast = document.getElementById('toast');

    // 頁籤按鈕
    const tabAvailable = document.getElementById('tabAvailable');
    const tabBorrowed = document.getElementById('tabBorrowed');
    const tabOther = document.getElementById('tabOther');
    const tabNotFound = document.getElementById('tabNotFound');
    const tabAll = document.getElementById('tabAll');

    let allResultsData = [];
    let currentTab = 'AVAILABLE';

    function showToast(msg) {
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    }

    // 智慧書單清理過濾器：略過標題，遇到第一個空白行時自動截斷後方已讀書目
    function cleanBookInputText(text) {
      const lines = text.split(/\\r?\\n/);
      const cleaned = [];
      let truncated = false;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        // 1. 自動略過「閱讀書目」等標題
        if (line.includes('閱讀書目')) continue;

        // 2. 當已有書目時，遇到空白行自動切斷（空白行後面全視為已讀書目）
        if (!line) {
          if (cleaned.length > 0) {
            truncated = true;
            break;
          }
          continue;
        }

        cleaned.push(line);
      }
      return { cleaned, truncated };
    }

    // 輸入或貼上時自動清洗
    bookInput.addEventListener('input', () => {
      const { cleaned, truncated } = cleanBookInputText(bookInput.value);
      if (truncated) {
        bookInput.value = cleaned.join('\\n');
        showToast(\`偵測到空白行分界，已自動截斷後方已讀書目（保留 \${cleaned.length} 本）\`);
      }
    });

    // 貼上剪貼簿
    btnPaste.addEventListener('click', () => {
      sendToScriptable('scriptable-paste', '');
    });

    // 填入範例
    btnSample.addEventListener('click', () => {
      bookInput.value = sampleBooks.join('\\n');
      showToast(\`已填入 \${sampleBooks.length} 本範例書目\`);
    });

    // 一鍵清空
    btnClear.addEventListener('click', () => {
      bookInput.value = '';
      showToast('已清空書單');
    });

    // 分頁切換
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.getAttribute('data-tab');
        renderCurrentTabList();
      });
    });

    // 渲染目前分頁列表
    function renderCurrentTabList() {
      let listToShow = [];
      let emptyMsg = '';

      const availList = allResultsData.filter(r => r.classification === 'TARGET_AVAILABLE');
      const borrowedList = allResultsData.filter(r => r.classification === 'TARGET_BORROWED');
      const otherList = allResultsData.filter(r => r.classification === 'OTHER_BRANCHES');
      const notfoundList = allResultsData.filter(r => r.classification === 'NOT_FOUND');

      if (currentTab === 'AVAILABLE') {
        listToShow = availList;
        emptyMsg = '目標分館目前無「在館可借」之書目';
      } else if (currentTab === 'BORROWED') {
        listToShow = borrowedList;
        emptyMsg = '目標分館目前無「外借中」之書目';
      } else if (currentTab === 'OTHER') {
        listToShow = otherList;
        emptyMsg = '無「他館有書」之書目';
      } else if (currentTab === 'NOTFOUND') {
        listToShow = notfoundList;
        emptyMsg = '無查無此書之書目';
      } else {
        listToShow = allResultsData;
        emptyMsg = '無任何查詢結果';
      }

      if (listToShow.length === 0) {
        resultList.innerHTML = \`
          <div class="empty-state">
            <div style="font-size: 1.8rem; margin-bottom: 6px;">🔍</div>
            <div>\${emptyMsg}</div>
          </div>\`;
        btnCopy.style.display = 'none';
        return;
      }

      btnCopy.style.display = 'block';
      btnCopy.innerText = \`📋 一鍵複製當前清單 (\${listToShow.length} 本)\`;

      resultList.innerHTML = listToShow.map((b, i) => {
        let badgeHtml = '';
        let extraHtml = '';

        if (b.classification === 'TARGET_AVAILABLE') {
          badgeHtml = '<span class="badge badge-available">🌟 在館可借</span>';
          extraHtml = \`
            <div class="callno-box">索書號：\${b.callNumber || '未提供'}</div>
            <div class="meta-text">📍 \${b.location || b.branch} · 條碼: \${b.barcode || '-'}</div>
          \`;
        } else if (b.classification === 'TARGET_BORROWED') {
          badgeHtml = '<span class="badge badge-borrowed">⏳ 外借中</span>';
          extraHtml = \`
            <div class="callno-box">索書號：\${b.callNumber || '未提供'}</div>
            <div class="meta-text">📍 \${b.location || b.branch} · 狀態: \${b.status || '已借出'}</div>
          \`;
        } else if (b.classification === 'OTHER_BRANCHES') {
          badgeHtml = '<span class="badge badge-other">📍 他館有書</span>';
          const others = (b.otherBranches || []).slice(0, 5).join('、');
          extraHtml = \`
            <div class="meta-text" style="color: var(--other-color); font-weight: 600;">\${others ? others + ' 等分館有藏書' : '其他分館有藏書'}</div>
          \`;
        } else {
          badgeHtml = '<span class="badge badge-notfound">❓ 查無此書</span>';
          extraHtml = \`<div class="meta-text">桃園圖書館系統查無精確符合之書目</div>\`;
        }

        return \`
          <div class="book-item">
            <div class="book-title-row">
              <div class="book-title">\${i + 1}. \${b.title || b.rawTitle}</div>
              \${badgeHtml}
            </div>
            \${extraHtml}
          </div>
        \`;
      }).join('');
    }

    // 複製清單
    btnCopy.addEventListener('click', () => {
      let listToCopy = [];
      let titlePrefix = '';

      if (currentTab === 'AVAILABLE') {
        listToCopy = allResultsData.filter(r => r.classification === 'TARGET_AVAILABLE');
        titlePrefix = \`🌟 \${branchSelect.value} 在館可借書單 (\${listToCopy.length} 本)\`;
      } else if (currentTab === 'BORROWED') {
        listToCopy = allResultsData.filter(r => r.classification === 'TARGET_BORROWED');
        titlePrefix = \`⏳ \${branchSelect.value} 已外借書單 (\${listToCopy.length} 本)\`;
      } else if (currentTab === 'OTHER') {
        listToCopy = allResultsData.filter(r => r.classification === 'OTHER_BRANCHES');
        titlePrefix = \`📍 \${branchSelect.value}無藏書（他館有書）清單 (\${listToCopy.length} 本)\`;
      } else if (currentTab === 'NOTFOUND') {
        listToCopy = allResultsData.filter(r => r.classification === 'NOT_FOUND');
        titlePrefix = \`❓ 查無此書清單 (\${listToCopy.length} 本)\`;
      } else {
        listToCopy = allResultsData;
        titlePrefix = \`📚 全部書目查詢結果 (\${listToCopy.length} 本)\`;
      }

      if (listToCopy.length === 0) return;

      const lines = listToCopy.map((b, i) => {
        if (b.classification === 'TARGET_AVAILABLE') {
          return \`\${i + 1}. \${b.title} [索書號: \${b.callNumber || '無'}] (\${b.location || b.branch})\`;
        } else if (b.classification === 'OTHER_BRANCHES') {
          return \`\${i + 1}. \${b.title} (\${(b.otherBranches || []).slice(0, 3).join('、')} 有藏書)\`;
        } else {
          return \`\${i + 1}. \${b.title || b.rawTitle} [\${b.classification}]\`;
        }
      });

      const text = titlePrefix + '：\\n\\n' + lines.join('\\n');
      navigator.clipboard.writeText(text).then(() => {
        showToast('✅ 已複製清單到剪貼簿！');
      }).catch(() => {
        sendToScriptable('scriptable-copy', text);
      });
    });

    // 使用 iframe 發送協議，避免主頁面導航中斷
    function sendToScriptable(scheme, data) {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = scheme + '://' + encodeURIComponent(typeof data === 'string' ? data : JSON.stringify(data));
      document.body.appendChild(iframe);
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch(e) {}
      }, 300);
    }

    btnStart.addEventListener('click', () => {
      const { cleaned } = cleanBookInputText(bookInput.value);
      if (cleaned.length === 0) {
        showToast('請先貼上或輸入書名！');
        return;
      }

      // 同步清洗後文字到輸入框
      bookInput.value = cleaned.join('\\n');

      btnStart.disabled = true;
      progressWrap.style.display = 'block';
      progressFill.style.width = '0%';
      progressText.innerText = \`正在準備查詢 \${cleaned.length} 本書...\`;
      resultCard.style.display = 'none';
      resultList.innerHTML = '';
      allResultsData = [];

      sendToScriptable('scriptable-query', {
        targetBranch: branchSelect.value,
        books: cleaned
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
      showToast('查詢異常');
    };

    // 接收來自 Scriptable 的完成回傳
    window.onFinished = function(results) {
      btnStart.disabled = false;
      progressWrap.style.display = 'none';
      resultCard.style.display = 'block';
      allResultsData = results;

      const avail = results.filter(r => r.classification === 'TARGET_AVAILABLE').length;
      const borrowed = results.filter(r => r.classification === 'TARGET_BORROWED').length;
      const other = results.filter(r => r.classification === 'OTHER_BRANCHES').length;
      const notfound = results.filter(r => r.classification === 'NOT_FOUND').length;

      // 更新分頁徽章數字
      tabAvailable.innerText = \`🌟 在館可借 (\${avail})\`;
      tabBorrowed.innerText = \`⏳ 已外借 (\${borrowed})\`;
      tabOther.innerText = \`📍 他館有書 (\${other})\`;
      tabNotFound.innerText = \`❓ 查無此書 (\${notfound})\`;
      tabAll.innerText = \`📚 全部書目 (\${results.length})\`;

      // 預設切換到有書的分頁（優先在館可借）
      if (avail > 0) {
        tabAvailable.click();
      } else if (other > 0) {
        tabOther.click();
      } else if (borrowed > 0) {
        tabBorrowed.click();
      } else {
        tabAll.click();
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

  // 支援從 iOS 分享面板 (Share Sheet) 或捷徑傳入文字
  let initialInput = "";
  if (typeof args !== "undefined" && args && args.plainTexts && args.plainTexts.length > 0) {
    initialInput = args.plainTexts.join("\n");
  }

  const html = generateHTML(initialInput);
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
          const allResults = [];

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
            if (!searchRes || !searchRes.sid) {
              allResults.push({
                rawTitle: rawTitle,
                title: rawTitle,
                classification: "NOT_FOUND",
                callNumber: "",
                location: "",
                branch: "",
                barcode: "",
                status: "查無此書",
                otherBranches: [],
                detailUrl: ""
              });
            } else {
              // 2. 查詢館藏狀態
              const holdInfo = await client.getHoldings(searchRes.sid, targetBranch);
              const targetItem = holdInfo.targetHoldings[0] || {};
              const availItem = holdInfo.availableItems[0] || targetItem;

              allResults.push({
                rawTitle: rawTitle,
                title: searchRes.foundTitle,
                classification: holdInfo.classification,
                callNumber: availItem.callNumber || targetItem.callNumber || "",
                location: availItem.location || targetItem.location || "",
                room: availItem.room || targetItem.room || "",
                branch: availItem.branch || targetItem.branch || targetBranch,
                barcode: availItem.barcode || targetItem.barcode || "",
                status: availItem.status || targetItem.status || "",
                otherBranches: holdInfo.otherBranches,
                detailUrl: searchRes.detailUrl
              });
            }

            // 輕量保護間隔 (使用 Scriptable 原生 Timer 替代 setTimeout)
            await new Promise(resolve => {
              try {
                Timer.schedule(80, false, resolve);
              } catch (e) {
                resolve();
              }
            });
          }

          // 完成通知與震動
          try { Haptic.success(); } catch (e) {}
          try {
            const availCount = allResults.filter(r => r.classification === "TARGET_AVAILABLE").length;
            const n = new Notification();
            n.title = "桃園圖書館查書完成！";
            n.body = `【${targetBranch}】找到 ${availCount} 本在館可借，共查詢 ${allResults.length} 本書。`;
            n.schedule();
          } catch (e) {}

          // 回傳結果至 WebView
          const safeJson = JSON.stringify(allResults);
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
    } else if (url.startsWith("scriptable-paste://")) {
      const clip = Pasteboard.paste() || "";
      if (!clip.trim()) {
        webView.evaluateJavaScript(`showToast('剪貼簿目前沒有內容！');`).catch(() => {});
      } else {
        const safeClip = JSON.stringify(clip);
        webView.evaluateJavaScript(`
          bookInput.value = ${safeClip};
          bookInput.dispatchEvent(new Event('input'));
          showToast('已從剪貼簿貼上！');
        `).catch(() => {});
      }
      return false;
    }

    return true;
  };

  await webView.present(true);
}

await run();
