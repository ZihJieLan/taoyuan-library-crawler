import re
import time
import urllib.parse
from typing import List, Dict, Any, Optional, Callable
from playwright.sync_api import sync_playwright, Browser, Page

def clean_title_candidates(raw_title: str) -> List[str]:
    """產生多個搜尋候選詞，從完整書名遞減到核心主標題，確保最高檢索成功率。"""
    raw = raw_title.strip()
    if not raw:
        return []
    
    candidates = [raw]
    
    # 移除年份括號，如 (2018)、[民112]
    no_year = re.sub(r'[\(（\[【]\s*\d{4}\s*[\)）\]】]', '', raw).strip()
    if no_year and no_year not in candidates:
        candidates.append(no_year)
        
    # 移除副標題（冒號、破折號、問號之後的內容）
    # 例：沒了名片, 你還剩下什麼? : 32個上班族增加自我籌碼的方法 -> 沒了名片, 你還剩下什麼
    # 例：商業思維-游舒帆 -> 商業思維
    # 例：悉達多：一首印度的詩》（流浪者之歌） -> 悉達多
    for sep in [':', '：', ' - ', '-', '——', '——', '? ']:
        if sep in no_year:
            main_part = no_year.split(sep)[0].strip()
            # 移除常見成對括號
            main_part = re.sub(r'^[《〈(（]+|[》〉)）]+$', '', main_part).strip()
            if main_part and len(main_part) >= 2 and main_part not in candidates:
                candidates.append(main_part)
                
    # 針對特定帶括號的書名提取括號內或外的部分
    bracket_match = re.search(r'[\(（《〈](.+?)[\)）》〉]', raw)
    if bracket_match:
        inner = bracket_match.group(1).strip()
        if len(inner) >= 2 and inner not in candidates:
            candidates.append(inner)

    return candidates

class LibraryCrawler:
    def __init__(self, headless: bool = True):
        self.headless = headless
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.is_stopped = False

    def start_browser(self):
        """啟動本機 Chrome 或 Edge 瀏覽器。"""
        self.playwright = sync_playwright().start()
        # 優先嘗試 Chrome，次選 Edge
        try:
            self.browser = self.playwright.chromium.launch(channel="chrome", headless=self.headless)
        except Exception:
            try:
                self.browser = self.playwright.chromium.launch(channel="msedge", headless=self.headless)
            except Exception:
                self.browser = self.playwright.chromium.launch(headless=self.headless)
        
        context = self.browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        self.page = context.new_page()

    def stop(self):
        """停止爬蟲。"""
        self.is_stopped = True
        self.close_browser()

    def close_browser(self):
        """關閉瀏覽器與 Playwright。"""
        try:
            if self.page:
                self.page.close()
            if self.browser:
                self.browser.close()
            if self.playwright:
                self.playwright.stop()
        except Exception:
            pass
        finally:
            self.page = None
            self.browser = None
            self.playwright = None

    def search_book(self, raw_title: str) -> Optional[Dict[str, Any]]:
        """在 WebPAC 上檢索書籍，回傳第一筆最相符的書目資訊。"""
        candidates = clean_title_candidates(raw_title)
        
        for cand in candidates:
            if self.is_stopped:
                return None
                
            encoded = urllib.parse.quote(cand)
            search_url = f"https://webpac.typl.gov.tw/search?searchInput={encoded}&searchField=FullText"
            
            try:
                self.page.goto(search_url, wait_until="networkidle", timeout=25000)
                time.sleep(1.2)
                
                # 尋找結果
                link_el = (
                    self.page.query_selector("a[id^='seq_']") or 
                    self.page.query_selector(".seq a") or 
                    self.page.query_selector("a[href*='bookDetail']")
                )
                
                if link_el:
                    found_title = link_el.inner_text().strip()
                    href = link_el.get_attribute("href") or ""
                    
                    if href.startswith("http"):
                        detail_url = href
                    elif href.startswith("/"):
                        detail_url = f"https://webpac.typl.gov.tw{href}"
                    else:
                        detail_url = f"https://webpac.typl.gov.tw/{href}"
                        
                    return {
                        "searched_query": cand,
                        "found_title": found_title,
                        "detail_url": detail_url
                    }
            except Exception as e:
                # 逾時或載入異常則嘗試下一個 candidate
                continue
                
        return None

    def get_book_holdings(self, detail_url: str, target_branch: str = "中壢") -> Dict[str, Any]:
        """進入書籍詳細頁面，展開所有館藏並分析目標分館狀態。"""
        try:
            self.page.goto(detail_url, wait_until="networkidle", timeout=30000)
            time.sleep(1.5)
            
            # 連續點擊「載入更多」按鈕，直到全部載入完成（最多嘗試 15 次防呆）
            clicks = 0
            while clicks < 15 and not self.is_stopped:
                more_btn = self.page.query_selector("a.btnstyle.bluebg3.morewidth, a:has-text('載入更多')")
                if not more_btn or not more_btn.is_visible():
                    break
                try:
                    more_btn.click()
                    time.sleep(1.0)
                    clicks += 1
                except Exception:
                    break

            # 抓取館藏表格所有列
            rows = self.page.query_selector_all(".bookplace_list tbody tr, table tr:has(td[data-title])")
            
            all_holdings = []
            target_holdings = []
            other_branches = set()
            
            for row in rows:
                cols = row.query_selector_all("td")
                if not cols:
                    continue
                    
                # 根據 data-title 或欄位順序解析
                loc_td = row.query_selector('td[data-title*="館藏地"]')
                usage_td = row.query_selector('td[data-title*="用途"]')
                call_td = row.query_selector('td[data-title*="索書號"]')
                status_td = row.query_selector('td[data-title*="狀態"]')
                barcode_td = row.query_selector('td[data-title*="條碼號"]')
                
                loc_text = loc_td.inner_text().strip() if loc_td else (cols[1].inner_text().strip() if len(cols) > 1 else "")
                usage_text = usage_td.inner_text().strip() if usage_td else (cols[2].inner_text().strip() if len(cols) > 2 else "")
                call_text = call_td.inner_text().strip() if call_td else (cols[3].inner_text().strip() if len(cols) > 3 else "")
                status_text = status_td.inner_text().strip() if status_td else (cols[4].inner_text().strip() if len(cols) > 4 else "")
                barcode_text = barcode_td.inner_text().strip() if barcode_td else (cols[5].inner_text().strip() if len(cols) > 5 else "")
                
                # 萃取分館名稱（例如 '中壢/書庫' -> '中壢'）
                branch_name = loc_text.split('/')[0].strip() if '/' in loc_text else loc_text.strip()
                
                # 狀態判斷：是否在館（尚未外借）
                # 可借：包含 '在館' 或 '可借'，且不包含 '外借' 或 '預約待取'
                is_available = ("在館" in status_text or "可借" in status_text) and ("外借" not in status_text and "借出" not in status_text)
                
                item_data = {
                    "location": loc_text,
                    "branch": branch_name,
                    "usage": usage_text,
                    "call_number": call_text,
                    "status": status_text,
                    "barcode": barcode_text,
                    "is_available": is_available
                }
                
                all_holdings.append(item_data)
                
                if target_branch in loc_text or target_branch in branch_name:
                    target_holdings.append(item_data)
                else:
                    if branch_name:
                        other_branches.add(branch_name)

            # 總結該書狀態
            if target_holdings:
                availables = [h for h in target_holdings if h["is_available"]]
                if availables:
                    classification = "TARGET_AVAILABLE"  # 在中壢且在館可借 (主要目標!)
                else:
                    classification = "TARGET_BORROWED"   # 在中壢但已被外借
            else:
                if all_holdings:
                    classification = "OTHER_BRANCHES"    # 中壢無館藏 (其他分館有)
                else:
                    classification = "NO_HOLDINGS"       # 全館無館藏

            return {
                "classification": classification,
                "total_holdings_count": len(all_holdings),
                "target_holdings": target_holdings,
                "other_branches": list(other_branches),
                "all_holdings": all_holdings
            }
        except Exception as e:
            return {
                "classification": "ERROR",
                "error": str(e),
                "total_holdings_count": 0,
                "target_holdings": [],
                "other_branches": [],
                "all_holdings": []
            }

    def process_book_list(
        self,
        book_list: List[str],
        target_branch: str = "中壢",
        on_progress: Optional[Callable[[Dict[str, Any]], None]] = None
    ) -> List[Dict[str, Any]]:
        """批次處理書單，即時回報進度。"""
        self.is_stopped = False
        self.start_browser()
        
        results = []
        total = len(book_list)

        try:
            for idx, raw_title in enumerate(book_list, start=1):
                if self.is_stopped:
                    break
                    
                title = raw_title.strip()
                if not title:
                    continue
                    
                # 發送開始檢查該書事件
                if on_progress:
                    on_progress({
                        "type": "searching",
                        "index": idx,
                        "total": total,
                        "title": title,
                        "percent": int(((idx - 1) / total) * 100),
                        "message": f"正在搜尋第 {idx}/{total} 本：{title}..."
                    })

                search_res = self.search_book(title)
                
                if not search_res:
                    book_result = {
                        "index": idx,
                        "raw_title": title,
                        "found_title": "查無搜尋結果",
                        "detail_url": "",
                        "classification": "NOT_FOUND",
                        "target_holdings": [],
                        "other_branches": [],
                        "summary": "桃園圖書館系統中查無此書"
                    }
                else:
                    detail_url = search_res["detail_url"]
                    found_title = search_res["found_title"]
                    
                    if on_progress:
                        on_progress({
                            "type": "inspecting_holdings",
                            "index": idx,
                            "total": total,
                            "title": title,
                            "found_title": found_title,
                            "percent": int(((idx - 0.5) / total) * 100),
                            "message": f"找到「{found_title}」，正在檢查【{target_branch}分館】館藏狀態..."
                        })
                        
                    holdings_info = self.get_book_holdings(detail_url, target_branch=target_branch)
                    
                    # 產生摘要說明
                    classification = holdings_info["classification"]
                    target_items = holdings_info["target_holdings"]
                    
                    if classification == "TARGET_AVAILABLE":
                        avail_count = len([h for h in target_items if h["is_available"]])
                        summary = f"🎉 {target_branch}分館在館可借 ({avail_count}/{len(target_items)} 本)"
                    elif classification == "TARGET_BORROWED":
                        due_dates = [h["status"] for h in target_items]
                        summary = f"⏳ {target_branch}分館藏書已外借 ({', '.join(due_dates)})"
                    elif classification == "OTHER_BRANCHES":
                        other_str = "、".join(holdings_info["other_branches"][:5])
                        if len(holdings_info["other_branches"]) > 5:
                            other_str += " 等分館"
                        summary = f"📍 {target_branch}分館無藏書（{other_str} 有藏書）"
                    else:
                        summary = "❓ 查無館藏"

                    book_result = {
                        "index": idx,
                        "raw_title": title,
                        "found_title": found_title,
                        "detail_url": detail_url,
                        "classification": classification,
                        "target_holdings": target_items,
                        "other_branches": holdings_info["other_branches"],
                        "summary": summary
                    }

                results.append(book_result)
                
                # 發送單本完成事件
                if on_progress:
                    on_progress({
                        "type": "book_completed",
                        "index": idx,
                        "total": total,
                        "title": title,
                        "percent": int((idx / total) * 100),
                        "book_result": book_result,
                        "message": f"[{idx}/{total}] {title}：{book_result['summary']}"
                    })
                    
                time.sleep(1.0)  # 禮貌爬蟲延遲
        finally:
            self.close_browser()
            
        return results
