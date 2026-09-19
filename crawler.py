import re
import time
import urllib.parse
import difflib
from typing import List, Dict, Any, Optional, Callable
from playwright.sync_api import sync_playwright, Browser, Page

def normalize_title_for_match(t: str) -> str:
    """清理書名以進行防抓錯之精確相似度比對。"""
    # 移除常見括號內容（年份、版本、平台註記）
    t = re.sub(r'[\(（\[【].*?[\)）\]】]', '', t)
    # 移除電子書平台常見前綴後綴
    t = re.sub(r'\b(hyread|ebook|電子書)\b', '', t, flags=re.IGNORECASE)
    # 移除所有標點符號與空白
    t = re.sub(r'[\s\W_]+', '', t, flags=re.UNICODE)
    return t.lower()

def is_title_match(raw_title: str, found_title: str, query_cand: str = '') -> bool:
    """比對找到的書名與原始書名/查詢詞，嚴格防範張冠李戴（False Positive）。"""
    norm_raw = normalize_title_for_match(raw_title)
    norm_found = normalize_title_for_match(found_title)
    
    if not norm_raw or not norm_found:
        return False
        
    # 1. 完整包含檢查（原始書名在找到的書名中，或找到的書名在原始書名中）
    if norm_raw in norm_found or norm_found in norm_raw:
        return True

    # 2. 原始書名相似度比對（SequenceMatcher 相似度達 0.65 以上）
    if difflib.SequenceMatcher(None, norm_raw, norm_found).ratio() >= 0.65:
        return True

    # 3. 候選詞比對（若有傳入 query_cand 或自 raw_title 提取的核心候選詞）
    cands_to_check = [query_cand] if query_cand else clean_title_candidates(raw_title)
    for c in cands_to_check:
        norm_c = normalize_title_for_match(c)
        if norm_c and len(norm_c) >= 3:
            if norm_c in norm_found or norm_found in norm_c:
                return True
            if difflib.SequenceMatcher(None, norm_c, norm_found).ratio() >= 0.65:
                return True
            
    return False

def clean_title_candidates(raw_title: str) -> List[str]:
    """產生多個搜尋候選詞，從完整書名遞減到核心主標題，
    並自動過濾使用者筆記頁碼（如 p.120、88、-150、50頁）、年份與符號。"""
    raw = raw_title.strip()
    if not raw:
        return []
    
    candidates = []
    
    # 1. 第一步：清理書名尾隨的頁碼與阿拉伯數字
    # 支援格式：
    # - "精準回饋 88" -> "精準回饋"
    # - "原子習慣 p.120" / "原子習慣 P120" -> "原子習慣"
    # - "被討厭的勇氣-150" / "被討厭的勇氣——150" -> "被討厭的勇氣"
    # - "投資金律 50頁" -> "投資金律"
    cleaned_no_page = re.sub(
        r'[\s\-_—,，:：]*([pP]\.?\s*\d+|\d+\s*[頁页]|\b\d{1,4}\b)\s*$', 
        '', 
        raw
    ).strip()
    
    if cleaned_no_page and cleaned_no_page not in candidates:
        candidates.append(cleaned_no_page)
        
    if raw not in candidates:
        candidates.append(raw)
        
    # 2. 第二步：移除年份括號，如 (2018)、[民112]、【2020年版】
    for base in list(candidates):
        no_year = re.sub(r'[\(（\[【]\s*[\d年版民國\s]+\s*[\)）\]】]', '', base).strip()
        if no_year and no_year not in candidates:
            candidates.append(no_year)
            
    # 3. 第三步：標點符號正規化（安全不切碎原則：將逗號/分號/頓號替換為空格或去除，保留完整語意長度）
    for base in list(candidates):
        if re.search(r'[，,；;！!、]', base):
            # 版本 A: 標點替換為單一空格（支援多詞/AND 檢索）
            space_ver = re.sub(r'[，,；;！!、]+', ' ', base).strip()
            space_ver = re.sub(r'\s+', ' ', space_ver)
            if space_ver and space_ver not in candidates:
                candidates.append(space_ver)
            
            # 版本 B: 直接移除標點符號
            clean_ver = re.sub(r'[，,；;！!、\s]+', '', base).strip()
            if clean_ver and clean_ver not in candidates:
                candidates.append(clean_ver)

    # 4. 第四步：副標題切除（冒號、破折號、問號之後的說明）
    # 例：沒了名片, 你還剩下什麼? : 32個上班族增加自我籌碼的方法 -> 沒了名片, 你還剩下什麼
    # 例：商業思維-游舒帆 -> 商業思維
    # 例：悉達多：一首印度的詩》（流浪者之歌） -> 悉達多
    for base in list(candidates):
        for sep in [':', '：', ' - ', '-', '——', '—', '? ', '？']:
            if sep in base:
                main_part = base.split(sep)[0].strip()
                # 去除開頭與結尾之成對括號
                main_part = re.sub(r'^[《〈(（\[【]+|[》〉)）\]】]+$', '', main_part).strip()
                if main_part and len(main_part) >= 2 and main_part not in candidates:
                    candidates.append(main_part)

    # 5. 第五步：針對成對括號內提取核心詞
    bracket_match = re.search(r'[\(（《〈](.+?)[\)）》〉]', raw)
    if bracket_match:
        inner = bracket_match.group(1).strip()
        # 排除純數字年份的括號內容
        if len(inner) >= 2 and not inner.isdigit() and inner not in candidates:
            candidates.append(inner)

    # 排序：優先去除頁碼的放第一位
    if cleaned_no_page in candidates:
        candidates.remove(cleaned_no_page)
        candidates.insert(0, cleaned_no_page)

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
        """在 WebPAC 上檢索書籍，比對標題相似度並回傳最相符的書目資訊。"""
        candidates = clean_title_candidates(raw_title)
        
        for cand in candidates:
            if self.is_stopped:
                return None
                
            encoded = urllib.parse.quote(cand)
            search_url = f"https://webpac.typl.gov.tw/search?searchInput={encoded}&searchField=FullText"
            
            try:
                self.page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
                try:
                    self.page.wait_for_selector(
                        "a[id^='seq_'], .seq a, a[href*='bookDetail'], .no_result", 
                        timeout=5000
                    )
                except Exception:
                    pass
                
                # 尋找所有候選結果連結（檢查前 5 筆）
                link_elements = self.page.query_selector_all(
                    "a[id^='seq_'], .seq a, a[href*='bookDetail']"
                )
                
                for link_el in link_elements[:5]:
                    found_title = link_el.inner_text().strip()
                    if not found_title:
                        continue
                        
                    # 標題相似度校驗：嚴格防範抓錯書（False Positive）
                    if not is_title_match(raw_title, found_title, cand):
                        continue
                        
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
            except Exception:
                continue
                
        return None

    def get_book_holdings(self, detail_url: str, target_branch: str = "中壢分館") -> Dict[str, Any]:
        """進入書籍詳細頁面，展開所有館藏並分析目標分館狀態。"""
        try:
            self.page.goto(detail_url, wait_until="domcontentloaded", timeout=25000)
            
            try:
                self.page.wait_for_selector(".bookplace_list tbody tr, table tr:has(td[data-title])", timeout=6000)
            except Exception:
                pass
            
            clicks = 0
            while clicks < 12 and not self.is_stopped:
                more_btn = self.page.query_selector("a.btnstyle.bluebg3.morewidth, a:has-text('載入更多')")
                if not more_btn or not more_btn.is_visible():
                    break
                try:
                    more_btn.click()
                    time.sleep(0.6)
                    clicks += 1
                except Exception:
                    break

            rows = self.page.query_selector_all(".bookplace_list tbody tr, table tr:has(td[data-title])")
            
            all_holdings = []
            target_holdings = []
            other_branches = set()
            
            for row in rows:
                cols = row.query_selector_all("td")
                if not cols:
                    continue
                    
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
                
                branch_name = loc_text.split('/')[0].strip() if '/' in loc_text else loc_text.strip()
                
                is_available = ("在館" in status_text or "可借" in status_text) and ("外借" not in status_text and "借出" not in status_text and "預約" not in status_text)
                
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
                
                clean_target = target_branch.replace("分館", "").strip()
                if clean_target in loc_text or clean_target in branch_name:
                    target_holdings.append(item_data)
                else:
                    if branch_name:
                        other_branches.add(branch_name)

            if target_holdings:
                availables = [h for h in target_holdings if h["is_available"]]
                if availables:
                    classification = "TARGET_AVAILABLE"
                else:
                    classification = "TARGET_BORROWED"
            else:
                if all_holdings:
                    classification = "OTHER_BRANCHES"
                else:
                    classification = "NO_HOLDINGS"

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
        target_branch: str = "中壢分館",
        on_progress: Optional[Callable[[Dict[str, Any]], None]] = None
    ) -> List[Dict[str, Any]]:
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
                            "message": f"找到「{found_title}」，正在檢查【{target_branch}】館藏狀態..."
                        })
                        
                    holdings_info = self.get_book_holdings(detail_url, target_branch=target_branch)
                    
                    classification = holdings_info["classification"]
                    target_items = holdings_info["target_holdings"]
                    
                    if classification == "TARGET_AVAILABLE":
                        avail_count = len([h for h in target_items if h["is_available"]])
                        summary = f"🎉 {target_branch}在館可借 ({avail_count}/{len(target_items)} 本)"
                    elif classification == "TARGET_BORROWED":
                        due_dates = [h["status"] for h in target_items]
                        summary = f"⏳ {target_branch}藏書已外借 ({', '.join(due_dates)})"
                    elif classification == "OTHER_BRANCHES":
                        other_str = "、".join(holdings_info["other_branches"][:5])
                        if len(holdings_info["other_branches"]) > 5:
                            other_str += " 等分館"
                        summary = f"📍 {target_branch}無藏書（{other_str} 有藏書）"
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
                    
                time.sleep(0.6)
        finally:
            self.close_browser()
            
        return results
