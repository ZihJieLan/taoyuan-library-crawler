import re
import time
import urllib.parse
import urllib.request
import ssl
import json
import difflib
import http.cookiejar
from typing import List, Dict, Any, Optional, Callable

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
            
    # 3. 第三步：標點符號正規化
    for base in list(candidates):
        if re.search(r'[，,；;！!、]', base):
            space_ver = re.sub(r'[，,；;！!、]+', ' ', base).strip()
            space_ver = re.sub(r'\s+', ' ', space_ver)
            if space_ver and space_ver not in candidates:
                candidates.append(space_ver)
            
            clean_ver = re.sub(r'[，,；;！!、\s]+', '', base).strip()
            if clean_ver and clean_ver not in candidates:
                candidates.append(clean_ver)

    # 4. 第四步：副標題切除（冒號、破折號、問號之後的說明）
    for base in list(candidates):
        for sep in [':', '：', ' - ', '-', '——', '—', '? ', '？']:
            if sep in base:
                main_part = base.split(sep)[0].strip()
                main_part = re.sub(r'^[《〈(（\[【]+|[》〉)）\]】]+$', '', main_part).strip()
                if main_part and len(main_part) >= 2 and main_part not in candidates:
                    candidates.append(main_part)

    # 5. 第五步：針對成對括號內提取核心詞
    bracket_match = re.search(r'[\(（《〈](.+?)[\)）》〉]', raw)
    if bracket_match:
        inner = bracket_match.group(1).strip()
        if len(inner) >= 2 and not inner.isdigit() and inner not in candidates:
            candidates.append(inner)

    # 排序：優先去除頁碼的放第一位
    if cleaned_no_page in candidates:
        candidates.remove(cleaned_no_page)
        candidates.insert(0, cleaned_no_page)

    return candidates

class LibraryCrawler:
    """基於官方 GraphQL API 的高效能圖書館檢索器（擺脫無頭瀏覽器與逾時問題）。"""
    
    GRAPHQL_URL = "https://webpac.typl.gov.tw/api/HyLibWS/graphql"
    BASE_URL = "https://webpac.typl.gov.tw/"
    
    def __init__(self, headless: bool = True):
        self.headless = headless
        self.is_stopped = False
        self.csrf_token = ""
        self.opener = None
        self.ssl_ctx = ssl.create_default_context()
        self.ssl_ctx.check_hostname = False
        self.ssl_ctx.verify_mode = ssl.CERT_NONE
        self._init_session()

    def _init_session(self):
        """建立帶有 CookieJar 與自訂 SSL 驗證的 HTTP Opener。"""
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookie_jar),
            urllib.request.HTTPSHandler(context=self.ssl_ctx)
        )

    def _ensure_csrf(self):
        """確保已獲取有效的 CSRF Token 與 Session Cookie。"""
        if self.csrf_token:
            return
            
        try:
            req = urllib.request.Request(
                self.BASE_URL,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                }
            )
            res = self.opener.open(req, timeout=12)
            html = res.read().decode("utf-8")
            m = re.search(r'"csrfToken":"([^"]+)"', html)
            if m:
                self.csrf_token = m.group(1)
        except Exception:
            pass

    def start_browser(self):
        """相容原先介面，初始化連線並抓取 Token。"""
        self.is_stopped = False
        self._ensure_csrf()

    def stop(self):
        """停止檢索。"""
        self.is_stopped = True

    def close_browser(self):
        """相容原先介面，釋放資源。"""
        pass

    def search_book(self, raw_title: str) -> Optional[Dict[str, Any]]:
        """透過 GraphQL API 檢索書籍，比對標題相似度並回傳最相符的書目資訊。"""
        self._ensure_csrf()
        candidates = clean_title_candidates(raw_title)
        
        search_query = """
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
            info {
              total
            }
          }
        }
        """

        for cand in candidates:
            if self.is_stopped:
                return None

            encoded = urllib.parse.quote(cand)
            search_payload = {
                "operationName": "search",
                "query": search_query,
                "variables": {
                    "searchForm": {
                        "searchField": ["FullText"],
                        "searchInput": [cand],
                        "op": [],
                        "keepsite": [],
                        "cln": [],
                        "queryString": f"searchField=FullText&searchInput={encoded}"
                    }
                }
            }

            try:
                req = urllib.request.Request(
                    self.GRAPHQL_URL,
                    data=json.dumps(search_payload).encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Referer": "https://webpac.typl.gov.tw/search",
                        "x-csrf-token": self.csrf_token or ""
                    }
                )
                res = self.opener.open(req, timeout=12)
                res_data = json.loads(res.read().decode("utf-8"))
                
                s_values = res_data.get("data", {}).get("search", {}).get("list", {}).get("values", [])
                
                for item in s_values[:5]:
                    ref_dict = {kv["key"]: kv["value"] for kv in item.get("ref", [])}
                    found_title = ref_dict.get("title", "").strip()
                    sid = ref_dict.get("sid", "")
                    
                    if not found_title or not sid:
                        continue
                        
                    # 標題相似度校驗：嚴格防範抓錯書（False Positive）
                    if not is_title_match(raw_title, found_title, cand):
                        continue
                        
                    detail_url = f"https://webpac.typl.gov.tw/bookDetail/{sid}"
                    return {
                        "searched_query": cand,
                        "found_title": found_title,
                        "detail_url": detail_url,
                        "marc_id": sid,
                        "author": ref_dict.get("author", ""),
                        "isbn": ref_dict.get("isbn", "")
                    }
            except Exception:
                continue

        return None

    def get_book_holdings(self, detail_url_or_id: str, target_branch: str = "中壢分館") -> Dict[str, Any]:
        """透過 GraphQL API 查詢館藏狀態與目標分館在館資訊。"""
        self._ensure_csrf()
        
        # 提取 marcId
        marc_id = ""
        if isinstance(detail_url_or_id, int):
            marc_id = str(detail_url_or_id)
        else:
            m = re.search(r'bookDetail/(\d+)', str(detail_url_or_id))
            if m:
                marc_id = m.group(1)
            elif str(detail_url_or_id).isdigit():
                marc_id = str(detail_url_or_id)

        if not marc_id:
            return {
                "classification": "NO_HOLDINGS",
                "total_holdings_count": 0,
                "target_holdings": [],
                "other_branches": [],
                "all_holdings": []
            }

        holdings_query = """
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
            info {
              total
              count
            }
          }
        }
        """

        payload = {
            "operationName": "getHoldByKeepSite",
            "query": holdings_query,
            "variables": {
                "HoldForm": {
                    "marcId": int(marc_id),
                    "pageNo": 1,
                    "limit": 100,
                    "sort": "",
                    "order": "",
                    "keepSiteId": 0,
                    "canShowHoldLendAndRead": 0,
                    "keepSiteIdList": "",
                    "holdVolumnDesc": ""
                }
            }
        }

        try:
            req = urllib.request.Request(
                self.GRAPHQL_URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Referer": f"https://webpac.typl.gov.tw/bookDetail/{marc_id}",
                    "x-csrf-token": self.csrf_token or ""
                }
            )
            res = self.opener.open(req, timeout=12)
            data = json.loads(res.read().decode("utf-8"))
            
            hold_data = data.get("data", {}).get("getHoldByKeepSite", {})
            values = hold_data.get("list", {}).get("values", [])
            
            all_holdings = []
            target_holdings = []
            other_branches = set()

            clean_target = target_branch.replace("分館", "").strip()

            for item in values:
                ref = {kv["key"]: kv["value"] for kv in item.get("ref", [])}
                branch_name = ref.get("keepSiteLabelName", "").strip()
                room_name = ref.get("keepRoomLabelName", "").strip()
                call_number = ref.get("callNumber", "").strip()
                status_text = ref.get("bookStatusLabelName", "").strip()
                barcode = ref.get("barcode", "").strip()
                usage = ref.get("purposeName", "").strip()

                loc_text = f"{branch_name}/{room_name}" if room_name else branch_name
                
                # 判定是否在館可借（排除外借、借出、預約、通閱、移送中等）
                is_available = ("在館" in status_text or "可借" in status_text) and not any(
                    x in status_text for x in ["外借", "借出", "預約", "移送", "通閱", "遺失", "破損"]
                )

                item_data = {
                    "location": loc_text,
                    "branch": branch_name,
                    "usage": usage,
                    "call_number": call_number,
                    "status": status_text,
                    "barcode": barcode,
                    "is_available": is_available
                }

                all_holdings.append(item_data)

                if clean_target in branch_name or clean_target in loc_text:
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
        """批次處理書單，即時回傳進度。"""
        self.is_stopped = False
        self._ensure_csrf()
        
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
                    marc_id = search_res["marc_id"]
                    
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
                        
                    holdings_info = self.get_book_holdings(marc_id, target_branch=target_branch)
                    
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
                    
                # 輕量間隔，保護圖書館伺服器
                time.sleep(0.2)
        finally:
            self.close_browser()
            
        return results
