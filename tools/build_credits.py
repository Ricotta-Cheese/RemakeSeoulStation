"""data/references 폴더별 CREDITS.md -> web/src/photo_credits.json (모델링에 참고한 사진 출처 목록)"""
import re, json, os, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REF = os.path.join(ROOT, "data", "references")
GROUP = {"oldstation": "구역사", "commons": "신역사 외관", "interior": "실내·지하", "seoullo_transit": "서울로7017·지하 승강장·버스환승센터", "context_buildings": "주변 건물"}
out = []
for d, label in GROUP.items():
    p = os.path.join(REF, d, "CREDITS.md")
    if not os.path.exists(p):
        continue
    items = []
    for line in open(p, encoding="utf-8"):
        if not line.startswith("|") or "---" in line:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        url = re.search(r"https?://[^\s)\]]+", line)
        if not url:
            continue
        url = url.group(0)
        m = re.search(r"\[([^\]]+)\]", line)
        title = m.group(1) if m else urllib.parse.unquote(url.split("File:")[-1]).replace("_", " ")
        lic = cells[-1]
        author = cells[2] if len(cells) >= 4 else ""
        items.append({"t": title, "u": url, "a": author, "l": lic})
    out.append({"group": label, "items": items})
json.dump(out, open(os.path.join(ROOT, "web", "src", "photo_credits.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print({g["group"]: len(g["items"]) for g in out})
