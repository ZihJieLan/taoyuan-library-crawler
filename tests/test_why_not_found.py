import sys, os
sys.path.insert(0, os.path.abspath("."))
from crawler import LibraryCrawler, clean_title_candidates, is_title_match

crawler = LibraryCrawler()
crawler.start_browser()

test_titles = [
    "彼得林區 選股戰略",
    "一個投機者的告白之證券心理學(2018)",
    "一個投機者的告白(2018)",
    "投資金律"
]

for t in test_titles:
    print(f"\n--- Testing '{t}' ---")
    cands = clean_title_candidates(t)
    print("Candidates:", cands)
    res = crawler.search_book(t)
    print("Search result:", res)
    if not res:
        # Let's inspect raw search
        for c in cands:
            import urllib.parse, json, urllib.request
            encoded = urllib.parse.quote(c)
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
              }
            }
            """
            payload = {
                "operationName": "search",
                "query": search_query,
                "variables": {
                    "searchForm": {
                        "searchField": ["FullText"],
                        "searchInput": [c],
                        "op": [],
                        "keepsite": [],
                        "cln": [],
                        "queryString": f"searchField=FullText&searchInput={encoded}"
                    }
                }
            }
            req = urllib.request.Request(
                crawler.GRAPHQL_URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0",
                    "Referer": "https://webpac.typl.gov.tw/search",
                    "x-csrf-token": crawler.csrf_token or ""
                }
            )
            r = crawler.opener.open(req, timeout=10)
            data = json.loads(r.read().decode("utf-8"))
            vals = data.get("data", {}).get("search", {}).get("list", {}).get("values", [])
            print(f"Raw search for '{c}' returned {len(vals)} results:")
            for item in vals[:3]:
                ref = {kv["key"]: kv["value"] for kv in item.get("ref", [])}
                ft = ref.get("title", "")
                m = is_title_match(t, ft, c)
                print(f"   Found title: '{ft}' | match: {m}")
