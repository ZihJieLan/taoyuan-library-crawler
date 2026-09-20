# 桃園市立圖書館 ‧ 館藏智慧檢索與在館分析系統 (TYPL Book Finder)

![Python Version](https://img.shields.io/badge/Python-3.10%2B-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-Modern%20Web%20API-009688.svg)
![Playwright](https://img.shields.io/badge/Playwright-Automated%20Browser-45ba4b.svg)
![License](https://img.shields.io/badge/License-MIT-orange.svg)

A lightweight batch book-availability checker built for the Taoyuan Public Library system, developed with Google Antigravity.

Why this project?
I usually keep a reading list of books I want to check out. Whenever I visit local library branches (such as Dayuan, Dazhu, Zhongli, Zhonglu, Guishan, etc.), I want to know which books on my list are currently available on the shelf.

However, the official library catalog only allows searching one title at a time. Checking a long list meant manually copying and pasting every single book title—over and over again.

What it does
This tool automates that tedious workflow:

Paste your list: Drop multiple book titles into the tool at once.

Select your branch: Pick the specific Taoyuan library branch you are visiting.

Get results: The crawler checks the catalog automatically and reports which books are available to borrow right now.

痛點：
平常習慣把想看的書列成清單。每次前往桃園市立圖書館的特定分館（如大園、大竹、中壢、中路、龜山等等）時，想知道現場有哪些書可借。但官方查詢系統一次只能查一本書，清單較長時需要逐一手動複製貼上，非常耗時。

解決方案：
這是一個專為桃園市立圖書館設計的批次查詢爬蟲工具（使用 Google Antigravity 開發）。
只要一次貼上整份書名清單，並選擇欲查詢的分館，程式便會自動批次爬取館藏狀態，快速列出該館目前「可直接外借」的書籍。

使用者只需貼上或匯入書單，系統將自動於背景透過 Playwright 進行深度檢索，即時展開所有分館藏書與在館狀態，並透過現代化 Web 儀表板直觀呈現**「在館可借」**、**「已外借」**與**「他館有書」**。

---

## 🌟 核心工程特色與技術亮點

### 1. 智慧書名正規化與多層候選詞策略
* **自動清理筆記雜訊**：智慧移除書名尾隨的頁碼標註（如 `p.120`、`88`、`-150`、`50頁` 等）。
* **安全標點正規化**：將全形/半形標點（`，`、`；`、`！`）轉換為標準空格或純淨詞，保留完整長度語意，**絕不盲目切碎詞句**。
* **副標題與年份括號處理**：自動去除 `(2018)`、`【2020年版】` 等年份標籤，並提煉主標題作為備用查詢詞。

### 2. 標題相似度防抓錯校驗（False Positive Safeguard）
* 針對搜尋引擎回傳的前 5 筆書目進行嚴格的文字比對。
* 採用 `difflib.SequenceMatcher` 序列相似度比對（相似度需達 65% 以上或核心字元完全包含），**徹底杜絕常見短詞誤判（張冠李戴）**，確保查準率（Precision）。

### 3. 動態 SPA 爬蟲與全館藏狀態展開
* 基於 **Playwright** 驅動本機無頭瀏覽器，自動應對 Next.js SPA 頁面與動態載入機制。
* 自動點擊「載入更多」展開所有館藏分館與複本，精準解析索書號、條碼號、借閱狀態與預計歸還日期。

### 4. 現代化 Web 儀表板與 SSE 即時串流
* **後端**：採用 **FastAPI** 構建，透過 **SSE (Server-Sent Events)** 將爬蟲進度與每本書的即時狀態推播至前端。
* **前端**：玻璃擬態（Glassmorphism）暗色系介面，具備即時進度條、日誌終端機、智慧分頁切換、一鍵複製在館清單與匯出 CSV 功能。

### 5. Windows 桌面一鍵啟動體驗
* 內建 `啟動圖書館查書系統.bat`，自動檢測 Python 環境、啟動本機伺服器並自動開啟預設瀏覽器，免除任何命令列設定門檻。

---

## 📱 iPhone 隨身查書版 (Scriptable 專用版)

除了電腦版外，本專案亦提供 **純 iPhone 本機執行** 的獨立腳本（[`taoyuan_library_ios_v3.3.js`](taoyuan_library_ios_v3.3.js)）。
無須架設任何伺服器或中繼 Proxy，手機打開即可直接與桃園市立圖書館官方 GraphQL API 高速直連查書！

### 🌟 特色功能
* **純 iPhone 本機執行**：利用免費的 iOS App [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) 驅動，零伺服器成本、無隱私疑慮。
* **官方 GraphQL API 直連**：毫秒級高速批次查詢，不受圖書館網頁前端版型改動影響。
* **現代化手機 UI**：支援 iOS 深色模式、即時查詢進度條、五大分類分頁（🌟 在館可借、⏳ 已外借、📍 他館有書、❓ 查無此書、📚 全部書目）。
* **智慧書單清洗**：
  * 自動過濾清單標題（如「閱讀書目」）。
  * 支援待讀與已讀標記（遇到 `[x]` 自動截斷後續已讀書目，自動移除 `[ ] ` 前綴）。
  * 支援空白行自動分界截斷。
* **一鍵操作**：內建「📋 貼上剪貼簿」與「📋 一鍵複製當前清單」按鈕，手機操作流暢省時。
* **支援桌面捷徑**：可透過 iOS「捷徑」將腳本放置於 iPhone 桌面，點擊即查。

### 📲 執行步驟
1. **安裝 Scriptable**：至 App Store 免費下載安裝 [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) App。
2. **匯入腳本**：
   * 將專案中的 [`taoyuan_library_ios_v3.3.js`](taoyuan_library_ios_v3.3.js) 檔案複製到 iPhone 的 **`iCloud 雲碟 / Scriptable`** 資料夾中。
   * （或在 Scriptable App 中新建腳本，將檔案內容直接貼上）。
3. **執行查書**：
   * 打開 Scriptable 點擊 `taoyuan_library_ios_v3.2` 即可直接執行。
   * **（可選）加到 iPhone 桌面**：
     * 打開 iOS「捷徑」App $\rightarrow$ 新增捷徑 $\rightarrow$ 加入動作「**打開 URL**」（Open URL）。
     * 網址輸入：`scriptable:///run?scriptName=taoyuan_library_ios_v3.2`
     * 點選「加入主畫面」，日後即可在桌面點擊一鍵開啟！

---

## 💻 Windows 電腦版快速啟動

### 方式一：Windows 一鍵啟動（推薦）
直接在專案根目錄雙擊：
👉 **`啟動圖書館查書系統.bat`**

### 方式二：手動指令啟動
```bash
# 1. 安裝相依套件
pip install -r requirements.txt

# 2. 啟動伺服器
python server.py
```
啟動後打開瀏覽器訪問：`http://localhost:8765`

---

## 📁 專案架構

```plaintext
├── taoyuan_library_ios_v3.3.js # iPhone Scriptable 專用查書腳本 (官方 GraphQL 直連)
├── crawler.py                  # Python 爬蟲核心引擎 (官方 GraphQL API 批次查詢)
├── server.py                   # FastAPI 後端（提供 REST API 與 SSE 即時進度推播）
├── default_books.txt           # 預設測試書單（精選 61 本經典閱讀清單）
├── requirements.txt            # Python 相依套件清單
├── 啟動圖書館查書系統.bat        # Windows 一鍵啟動批次檔
├── static/                     # 前端 Web 介面資源
│   ├── index.html              # 現代化儀表板頁面
│   ├── style.css               # 玻璃擬態暗色 UI 樣式
│   └── app.js                  # 前端互動邏輯、SSE 串流同步與智慧分頁
└── tests/                      # 單元測試與回歸測試套件
```

---

## 🛠️ 技術棧

* **語言與核心**：Python 3.10+
* **網頁自動化**：Playwright (Chromium / Edge)
* **後端架構**：FastAPI, Uvicorn, asyncio, SSE (Server-Sent Events)
* **前端技術**：Vanilla HTML5 / CSS3 (CSS Variables, Flexbox/Grid) / Modern JavaScript (ES6+)

---

## 📄 開源授權

本專案採用 [MIT License](LICENSE) 授權。歡迎桃園愛書人交流與改進！
