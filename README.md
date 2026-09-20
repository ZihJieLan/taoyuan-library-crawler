# 桃園市立圖書館 ‧ 館藏智慧檢索與在館分析系統
# TYPL Book Finder (Taoyuan Public Library Smart Availability Checker)

![Python Version](https://img.shields.io/badge/Python-3.10%2B-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-Modern%20Web%20API-009688.svg)
![GraphQL](https://img.shields.io/badge/GraphQL-Official%20API-e535ab.svg)
![iOS](https://img.shields.io/badge/iOS-Scriptable%20v3.3-007aff.svg)
![License](https://img.shields.io/badge/License-MIT-orange.svg)

---

### 💡 專案緣起 / Why this project?

* **痛點 (The Problem)**：
  * **中文**：平常習慣把想看的書列成清單。每次前往桃園市立圖書館的特定分館（如大園、大竹、中壢、中路、龜山等）時，想知道現場有哪些書可借。但官方查詢系統一次只能查一本書，清單較長時需要逐一手動複製貼上，非常耗時。
  * **English**: Many readers maintain a list of books they wish to borrow. When visiting local branches of the Taoyuan Public Library (such as Dayuan, Dazhu, Zhongli, Zhonglu, Guishan, etc.), finding out which titles on your list are currently sitting on the shelf ready to borrow is frustrating. The official library catalog only allows searching one book at a time, requiring repetitive manual search for long reading lists.

* **解決方案 (The Solution)**：
  * **中文**：本專案提供**批次查書工具**（包含 Windows 電腦版與純 iPhone 隨身版）。只要貼上整份書名清單並選擇分館，程式便會自動透過官方後端 GraphQL API 高速檢索，瞬間分類出**「🌟 在館可借」**、**「⏳ 已外借」**、**「📍 他館有書」**與**「❓ 查無此書」**。
  * **English**: This tool automates the tedious workflow by providing a **batch book-availability checker** (available as both a Windows PC app and a pure iPhone mobile script). Simply paste your reading list and select your target branch—the tool automatically queries the official GraphQL API at lightning speed, instantly categorizing results into **"🌟 Available on Shelf"**, **"⏳ Checked Out"**, **"📍 Available at Other Branches"**, and **"❓ Not Found"**.

---

## 📱 iPhone 隨身查書版 (Scriptable 專用版) / iPhone Mobile Edition

除了電腦版外，本專案提供 **純 iPhone 本機執行** 的獨立腳本（[`taoyuan_library_ios_v3.3.js`](taoyuan_library_ios_v3.3.js)）。無須架設伺服器或中繼代理，手機打開即可直連桃園市立圖書館官方 API 查書！  
*In addition to the PC version, this repository provides a standalone iPhone script ([`taoyuan_library_ios_v3.3.js`](taoyuan_library_ios_v3.3.js)) that runs entirely locally on iOS via [Scriptable](https://apps.apple.com/app/scriptable/id1405459188)—no server or proxy required.*

### 🌟 特色功能 / Key Features
* **純 iPhone 本機執行 (100% Local on iOS)**：
  * 免費 App [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) 驅動，零伺服器成本、零資安與隱私疑慮。
  * *Powered by the free Scriptable app; zero server cost and complete privacy.*
* **官方 GraphQL API 直連 (Direct Official GraphQL API)**：
  * 毫秒級高速批次查詢，不受圖書館網頁前端改版影響。
  * *Millisecond-level batch querying directly via the official library API, unaffected by frontend website updates.*
* **現代化手機介面 (Modern Mobile UI)**：
  * 支援深色模式 (Dark Mode)、即時進度條、五大分類分頁。
  * *Clean UI supporting dark mode, real-time progress bar, and 5 status tabs.*
* **智慧書單清洗 (Smart List Cleaning)**：
  * 自動過濾清單標題（如「閱讀書目」）。
  * 支援 Google Keep 等待讀與已讀標記（遇到 `[x]` 自動截斷後續已讀書目，自動清除 `[ ] ` 前綴）。
  * *Automatically removes headers, strips `[ ] ` prefixes, and truncates already-read books marked with `[x]`.*
* **一鍵極速操作 (One-Tap Convenience)**：
  * 提供「📋 貼上剪貼簿」與「📋 一鍵複製當前清單」按鈕，並附帶觸覺震動回饋。
  * *One-tap buttons to paste from clipboard and copy organized results, with haptic feedback.*
* **支援桌面捷徑 (Home Screen Shortcut)**：
  * 可透過 iOS「捷徑」將腳本放置於手機桌面，點擊即查。
  * *Can be added to your iOS Home Screen for instant 1-tap launching.*

### 📲 執行步驟 / How to Run on iPhone
1. **安裝 Scriptable / Install Scriptable**：
   * 至 App Store 下載安裝免費的 [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) App。
   * *Download and install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) for free from the App Store.*
2. **匯入腳本 / Import Script**：
   * 將專案中的 [`taoyuan_library_ios_v3.3.js`](taoyuan_library_ios_v3.3.js) 複製到 iPhone 的 **`iCloud 雲碟 / Scriptable`** 資料夾中（或在 Scriptable 內新建腳本直接貼上代碼）。
   * *Copy [`taoyuan_library_ios_v3.3.js`](taoyuan_library_ios_v3.3.js) into your **`iCloud Drive / Scriptable`** folder (or create a new script in Scriptable and paste the code).*
3. **開始查詢 / Launch & Search**：
   * 打開 Scriptable 點擊 `taoyuan_library_ios_v3.3` 即可直接執行。
   * **加到桌面（推薦）/ Add to Home Screen (Recommended)**：
     * 打開 iOS「捷徑」App $\rightarrow$ 新增捷徑 $\rightarrow$ 加入動作「**打開 URL**」（Open URL）。
     * 網址輸入：`scriptable:///run?scriptName=taoyuan_library_ios_v3.3`
     * 點選「加入主畫面」，日後在桌面點擊一鍵開啟！
     * *Create a new iOS Shortcut with the "Open URL" action pointing to `scriptable:///run?scriptName=taoyuan_library_ios_v3.3`, then tap "Add to Home Screen" for one-tap access.*

---

## 💻 Windows 電腦版快速啟動 / Windows PC Edition

### 方式一：Windows 一鍵啟動 (One-Click Launch, Recommended)
直接在專案根目錄雙擊：
👉 **`啟動圖書館查書系統.bat`**  
*(Simply double-click `啟動圖書館查書系統.bat` in the project root directory.)*

### 方式二：手動指令啟動 / Manual Command Launch
```bash
# 1. 安裝相依套件 / Install dependencies
pip install -r requirements.txt

# 2. 啟動伺服器 / Start server
python server.py
```
啟動後打開瀏覽器訪問 / Open your browser and visit: `http://localhost:8765`

---

## 🌟 核心工程特色與技術亮點 / Technical Highlights

### 1. 智慧書名正規化與多層候選詞策略 (Smart Title Normalization & Candidate Generation)
* **自動清理筆記雜訊 (Noise Reduction)**：智慧移除書名尾隨的頁碼標註（如 `p.120`、`88`、`-150`、`50頁` 等）。
  * *Automatically removes trailing page numbers and note annotations.*
* **安全標點正規化 (Punctuation Normalization)**：將全形/半形標點（`，`、`；`、`！`）轉換為標準空格或純淨詞，保留完整長度語意，絕不盲目切碎詞句。
  * *Standardizes punctuation marks while preserving full semantic context.*
* **副標題與年份處理 (Subtitle & Year Handling)**：自動去除 `(2018)`、`【2020年版】` 等年份標籤，並提煉主標題作為備用查詢詞。
  * *Strips publication years and extracts core subtitles as fallback search queries.*

### 2. 標題相似度防抓錯校驗 (False-Positive Prevention)
* 針對搜尋引擎回傳的前 5 筆書目進行嚴格的文字相似度校驗。
* 採用 `difflib.SequenceMatcher` / LCS 序列相似度比對（相似度門檻 $\ge 65\%$），徹底杜絕常見短詞誤判（張冠李戴），確保極高查準率。
  * *Applies sequence-matcher similarity algorithms ($\ge 65\%$) to strictly prevent false-positive matches on similarly named titles.*

### 3. 高效能 GraphQL API 核心 (High-Performance GraphQL Engine)
* 直接對接桃園市立圖書館官方 GraphQL 端點 (`/api/HyLibWS/graphql`)，毫秒級併發檢索，免去無頭瀏覽器負擔與超時問題。
  * *Connects directly to the official GraphQL API endpoint, enabling ultra-fast querying without headless browser overhead or timeout issues.*

### 4. 現代化 Web 儀表板與 SSE 即時串流 (Modern Web Dashboard & SSE Streaming)
* **後端 (Backend)**：採用 **FastAPI** 構建，透過 **SSE (Server-Sent Events)** 將爬蟲進度與每本書的即時狀態推播至前端。
* **前端 (Frontend)**：玻璃擬態（Glassmorphism）暗色系介面，具備即時進度條、日誌終端機、智慧分頁切換、一鍵複製在館清單與匯出 CSV 功能。
* *Features a sleek Glassmorphism dark-mode interface with live SSE progress streaming, terminal logs, smart tabs, one-click export to CSV, and clipboard copy.*

---

## 📁 專案架構 / Project Structure

```plaintext
├── taoyuan_library_ios_v3.3.js # iPhone Scriptable 專用查書腳本 / iPhone Scriptable Script (Official GraphQL)
├── crawler.py                  # Python 爬蟲核心引擎 / Python Crawler Engine (GraphQL API)
├── server.py                   # FastAPI 後端伺服器 / FastAPI Backend Server (REST API & SSE)
├── default_books.txt           # 預設測試書單 (61 本) / Sample Reading List (61 Books)
├── requirements.txt            # Python 相依套件清單 / Python Dependencies
├── 啟動圖書館查書系統.bat        # Windows 一鍵啟動批次檔 / Windows One-Click Batch Launcher
├── static/                     # 前端 Web 介面資源 / Frontend Web Assets
│   ├── index.html              # 現代化儀表板頁面 / Dashboard HTML
│   ├── style.css               # 玻璃擬態暗色 UI 樣式 / Glassmorphism Dark CSS
│   └── app.js                  # 前端互動邏輯與串流 / Frontend Logic & SSE Client
├── 系統版本/                    # 歷史版本歸檔資料夾 / Archived Historical Versions
└── tests/                      # 單元測試與回歸測試套件 / Unit & Regression Tests
```

---

## 🛠️ 技術棧 / Tech Stack

* **後端與爬蟲 (Backend & Crawler)**：Python 3.10+, FastAPI, Uvicorn, asyncio, SSE, GraphQL
* **行動端自動化 (Mobile Automation)**：iOS Scriptable (JavaScript ES6+, WKWebView, Native Pasteboard & Haptic APIs)
* **前端技術 (Frontend)**：Vanilla HTML5, CSS3 (CSS Variables, Flexbox/Grid), Modern JavaScript

---

## 📄 開源授權 / License

本專案採用 [MIT License](LICENSE) 授權。歡迎桃園愛書人交流與改進！  
*This project is open-sourced under the [MIT License](LICENSE). Contributions and feedback from book lovers are welcome!*
