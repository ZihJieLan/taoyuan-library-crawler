# 桃園市立圖書館 ‧ 館藏智慧檢索與在館分析系統 (TYPL Book Finder)

![Python Version](https://img.shields.io/badge/Python-3.10%2B-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-Modern%20Web%20API-009688.svg)
![Playwright](https://img.shields.io/badge/Playwright-Automated%20Browser-45ba4b.svg)
![License](https://img.shields.io/badge/License-MIT-orange.svg)

專為**桃園市立圖書館（TYPL）**讀者設計的高效館藏檢索系統。解決官方 WebPAC 系統無法批次查書、多分館館藏狀態分散、標點符號查詢易失效等痛點。

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

## 🚀 快速啟動

### 方式一：Windows 一鍵啟動（推薦）
直接在專案根目錄雙擊：
👉 **`啟動圖書館查書系統.bat`**

### 方式二：手動指令啟動
```bash
# 1. 安裝相依套件
pip install -r requirements.txt

# 2. 安裝瀏覽器核心
playwright install chromium

# 3. 啟動伺服器
python server.py
```
啟動後打開瀏覽器訪問：`http://localhost:8765`

---

## 📁 專案架構

```plaintext
├── crawler.py           # Playwright 爬蟲核心引擎（含標點正規化與相似度校驗）
├── server.py            # FastAPI 後端（提供 REST API 與 SSE 即時進度推播）
├── default_books.txt    # 預設測試書單（精選 61 本經典閱讀清單）
├── requirements.txt     # Python 相依套件清單
├── 啟動圖書館查書系統.bat # Windows 一鍵啟動批次檔
├── static/              # 前端 Web 介面資源
│   ├── index.html       # 現代化儀表板頁面
│   ├── style.css        # 玻璃擬態暗色 UI 樣式
│   └── app.js           # 前端互動邏輯、SSE 串流同步與智慧分頁
└── tests/               # 單元測試與回歸測試套件
    ├── test_regression_0919B.py    # 書名清理與分館比對回歸測試
    └── test_title_verification.py  # 標點正規化與防誤判測試
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
