import urllib.request, ssl, json, re, http.cookiejar

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj), urllib.request.HTTPSHandler(context=ctx))

ua_iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

# 1. Init session with iPhone UA
req1 = urllib.request.Request("https://webpac.typl.gov.tw/", headers={
    "User-Agent": ua_iphone,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
})
html = opener.open(req1, timeout=10).read().decode("utf-8")
m = re.search(r'"csrfToken":"([^"]+)"', html)
csrf = m.group(1) if m else ""
print("CSRF with iPhone UA:", csrf)
for c in cj:
    print("Cookie:", c.name, "=", c.value)

# 2. Search "彼得林區 選股戰略"
title = "彼得林區 選股戰略"
encoded = urllib.parse.quote(title)
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
            "searchInput": [title],
            "op": [],
            "keepsite": [],
            "cln": [],
            "queryString": f"searchField=FullText&searchInput={encoded}"
        }
    }
}

req_s = urllib.request.Request(
    "https://webpac.typl.gov.tw/api/HyLibWS/graphql",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "User-Agent": ua_iphone,
        "Referer": "https://webpac.typl.gov.tw/search",
        "x-csrf-token": csrf
    }
)

try:
    res = opener.open(req_s, timeout=10)
    data = json.loads(res.read().decode("utf-8"))
    vals = data.get("data", {}).get("search", {}).get("list", {}).get("values", [])
    print("Search results count:", len(vals))
    if vals:
        ref = {kv["key"]: kv["value"] for kv in vals[0].get("ref", [])}
        print("First book:", ref.get("title"), "sid:", ref.get("sid"))
except Exception as e:
    print("Error:", e)
