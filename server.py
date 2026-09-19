import os
import csv
import io
import json
import time
import asyncio
import threading
from typing import List, Optional
from fastapi import FastAPI, BackgroundTasks, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel

from crawler import LibraryCrawler

app = FastAPI(title="桃園圖書館在館書目智慧檢索系統 v0919B")

# 全域狀態管理
crawler_instance: Optional[LibraryCrawler] = None
crawler_thread: Optional[threading.Thread] = None
is_running: bool = False
crawl_results: List[dict] = []
event_subscribers = []
lock = threading.Lock()

class CrawlRequest(BaseModel):
    books: List[str]
    target_branch: str = "中壢分館"

def load_default_books() -> List[str]:
    # 優先從「測試與匯入檔案/」載入，次選根目錄
    paths = [
        os.path.join(os.path.dirname(__file__), "測試與匯入檔案", "default_books.txt"),
        os.path.join(os.path.dirname(__file__), "default_books.txt")
    ]
    for p in paths:
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                return [line.strip() for line in f if line.strip()]
    return []

def broadcast_event(event_data: dict):
    """向所有 SSE 客戶端廣播事件。"""
    with lock:
        subs = list(event_subscribers)
    msg = f"data: {json.dumps(event_data, ensure_ascii=False)}\n\n"
    for q in subs:
        try:
            q.put_nowait(msg)
        except Exception:
            pass

def run_crawler_job(books: List[str], target_branch: str):
    global is_running, crawler_instance, crawl_results
    is_running = True
    crawl_results.clear()
    
    broadcast_event({
        "type": "started",
        "total": len(books),
        "target_branch": target_branch,
        "message": f"開始檢索 {len(books)} 本書，目標館別：【{target_branch}】..."
    })
    
    crawler_instance = LibraryCrawler(headless=True)
    
    def on_progress(event):
        if event.get("type") == "book_completed":
            crawl_results.append(event["book_result"])
        broadcast_event(event)
        
    try:
        crawler_instance.process_book_list(
            book_list=books,
            target_branch=target_branch,
            on_progress=on_progress
        )
    except Exception as e:
        broadcast_event({
            "type": "error",
            "message": f"檢索過程發生異常：{str(e)}"
        })
    finally:
        is_running = False
        broadcast_event({
            "type": "finished",
            "total": len(crawl_results),
            "available_count": len([r for r in crawl_results if r["classification"] == "TARGET_AVAILABLE"]),
            "borrowed_count": len([r for r in crawl_results if r["classification"] == "TARGET_BORROWED"]),
            "other_count": len([r for r in crawl_results if r["classification"] == "OTHER_BRANCHES"]),
            "not_found_count": len([r for r in crawl_results if r["classification"] == "NOT_FOUND"]),
            "message": "所有書目檢索完成！"
        })

@app.get("/api/default_books")
def get_default_books():
    books = load_default_books()
    return {"books": books}

@app.get("/api/status")
def get_status():
    with lock:
        return {
            "is_running": is_running,
            "results_count": len(crawl_results),
            "results": crawl_results
        }

@app.post("/api/start_crawl")
def start_crawl(req: CrawlRequest, background_tasks: BackgroundTasks):
    global is_running, crawler_thread
    if is_running:
        return {"success": False, "message": "爬蟲檢索工作中，請勿重複啟動"}
    
    cleaned_books = [b.strip() for b in req.books if b.strip()]
    if not cleaned_books:
        return {"success": False, "message": "書單內容為空"}
        
    crawler_thread = threading.Thread(
        target=run_crawler_job,
        args=(cleaned_books, req.target_branch),
        daemon=True
    )
    crawler_thread.start()
    return {"success": True, "message": "已啟動爬蟲檢索任務", "total": len(cleaned_books)}

@app.post("/api/stop_crawl")
def stop_crawl():
    global crawler_instance, is_running
    if crawler_instance:
        crawler_instance.stop()
    is_running = False
    broadcast_event({
        "type": "stopped",
        "message": "使用者已手動終止檢索任務。"
    })
    return {"success": True, "message": "已發送停止指令"}

@app.get("/api/stream_progress")
async def stream_progress():
    """SSE 進度串流。"""
    queue = asyncio.Queue()
    with lock:
        event_subscribers.append(queue)

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'init', 'is_running': is_running, 'results': crawl_results}, ensure_ascii=False)}\n\n"
            while True:
                data = await queue.get()
                yield data
        except asyncio.CancelledError:
            pass
        finally:
            with lock:
                if queue in event_subscribers:
                    event_subscribers.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.get("/api/export_csv")
def export_csv():
    """匯出 UTF-8-BOM CSV 檔案，並自動備份至「產出與匯出檔案/」目錄。"""
    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.writer(output)
    
    writer.writerow([
        "序號", "原始書目", "查詢結果書名", "分館狀態", "索書號", "館藏地/室", "狀態說明", "條碼號", "圖書館連結"
    ])
    
    with lock:
        results = list(crawl_results)
        
    for r in results:
        classification = r.get("classification", "")
        if classification == "TARGET_AVAILABLE":
            status_desc = "在館可借"
        elif classification == "TARGET_BORROWED":
            status_desc = "已外借"
        elif classification == "OTHER_BRANCHES":
            status_desc = "目標館無館藏(他館有)"
        else:
            status_desc = "查無此書"

        target_holdings = r.get("target_holdings", [])
        if target_holdings:
            for h in target_holdings:
                writer.writerow([
                    r.get("index", ""),
                    r.get("raw_title", ""),
                    r.get("found_title", ""),
                    "可借閱" if h.get("is_available") else "外借中",
                    h.get("call_number", ""),
                    h.get("location", ""),
                    h.get("status", ""),
                    h.get("barcode", ""),
                    r.get("detail_url", "")
                ])
        else:
            writer.writerow([
                r.get("index", ""),
                r.get("raw_title", ""),
                r.get("found_title", ""),
                status_desc,
                "",
                "",
                r.get("summary", ""),
                "",
                r.get("detail_url", "")
            ])

    csv_content = output.getvalue()
    csv_data = csv_content.encode('utf-8-sig')
    
    # 自動存檔至「產出與匯出檔案/」
    try:
        export_dir = os.path.join(os.path.dirname(__file__), "產出與匯出檔案")
        os.makedirs(export_dir, exist_ok=True)
        filename = f"taoyuan_books_{time.strftime('%m%d_%H%M%S')}.csv"
        filepath = os.path.join(export_dir, filename)
        with open(filepath, "wb") as f:
            f.write(csv_data)
    except Exception as e:
        print("Backup export error:", e)

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=taoyuan_library_books.csv"}
    )

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8765, reload=False)
