"""Create a local visual review artifact from measured rankings, without API calls."""

import base64
import html
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "logs/moment-dimensions"
manifest = json.loads((DIR / "manifest.json").read_text("utf-8"))
report = json.loads((DIR / "comparison.json").read_text("utf-8"))
images = {x["label"]: x for x in manifest["items"]}


def thumbnail(label):
    with Image.open(DIR / images[label]["file"]) as src:
        im = ImageOps.contain(src.convert("RGB"), (230, 160))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=80)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


thumbs = {label: thumbnail(label) for label in images}
parts = [
    '<!doctype html><meta charset="utf-8"><title>LocCoc — Embedding evaluation</title><style>body{font:16px system-ui;background:#f4f6fa;color:#17202a;max-width:1240px;margin:30px auto;padding:20px}section{background:white;border-radius:12px;padding:20px;margin:20px 0}.grid{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;width:200px;padding:7px;border:2px solid #ddd;border-radius:8px}figure.ok{border-color:#24874b}figure.bad{border-color:#cc6970}img{width:100%;height:145px;object-fit:contain}figcaption{font-size:13px}table{border-collapse:collapse}td,th{text-align:left;padding:10px;border:1px solid #ccd}summary{cursor:pointer;font-size:20px;font-weight:600}small{color:#556}</style><h1>LocCoc — So sánh embedding</h1><p>20 ảnh mới, cùng query và nhãn đánh giá. Caption trung tính; ngày chụp là dữ liệu dựng cho kiểm thử. Viền xanh: ảnh được gán nhãn liên quan. Đây là smoke test, chưa chứng minh chất lượng trên dữ liệu lớn.</p>'
]
parts.append(
    "<table><tr><th>Cấu hình</th><th>Precision@3</th><th>Recall@5</th><th>nDCG@5</th></tr>"
)
for key, p in report["profiles"].items():
    parts.append(
        f"<tr><td>{key}</td><td>{p['meanPrecision3']:.3f}</td><td>{p['meanRecall5']:.3f}</td><td>{p['meanNdcg5']:.3f}</td></tr>"
    )
parts.append(
    "</table><p>768_prefix_from_3072 là đối chứng cắt prefix và chuẩn hóa từ 3072, không phải một lượt gọi API 768 độc lập.</p>"
)
for query in report["relevance"]:
    parts.append("<section><details open><summary>" + html.escape(query) + "</summary>")
    for key, p in report["profiles"].items():
        row = next((x for x in p["rows"] if x["query"] == query), None)
        if row is None:
            continue
        parts.append("<h3>" + key + '</h3><div class="grid">')
        for i, label in enumerate(row["ranking"][:5]):
            relevant = report["relevance"][query].get(label, 0) > 0
            parts.append(
                f'<figure class="{"ok" if relevant else "bad"}"><img src="{thumbs[label]}"><figcaption>#{i + 1} {label}<br>cosine {row["scores"][label]:.4f}</figcaption></figure>'
            )
        parts.append("</div>")
    parts.append("</details></section>")
parts.append("<h2>Kiểm thử thời gian qua Gateway</h2>")
for dim in (1536, 3072):
    api = json.loads((DIR / f"api-{dim}.json").read_text("utf-8"))
    parts.append(
        f"<section><h3>{dim}</h3><table><tr><th>Prompt</th><th>Đúng khoảng ngày</th><th>Số ảnh</th></tr>"
    )
    for row in api["dates"]:
        parts.append(
            f"<tr><td>{html.escape(row['query'])}</td><td>{row['passed']}</td><td>{len(row['actual'])}</td></tr>"
        )
    parts.append("</table></section>")
parts.append('<h2>Toàn bộ ảnh và ngày kiểm thử (+07)</h2><div class="grid">')
for x in manifest["items"]:
    parts.append(
        f'<figure><img src="{thumbs[x["label"]]}"><figcaption>{x["label"]}<br>{x["capturedAt"]}<br><a href="{html.escape(x["source"])}">Nguồn Unsplash</a></figcaption></figure>'
    )
parts.append("</div>")
(DIR / "visual-review.html").write_text("".join(parts), "utf-8")
font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 20)
sheet = Image.new("RGB", (1120, 1260), "white")
draw = ImageDraw.Draw(sheet)
for row_index, (query, dim) in enumerate(
    (q, d) for q in ["người", "xe", "xe đạp", "hoa"] for d in ["1536", "3072"]
):
    row = next(r for r in report["profiles"][dim]["rows"] if r["query"] == query)
    y = row_index * 155
    draw.text((5, y + 5), f"{query} / {dim}", font=font, fill="black")
    for rank, label in enumerate(row["ranking"][:4]):
        with Image.open(DIR / images[label]["file"]) as src:
            im = ImageOps.contain(src.convert("RGB"), (200, 115))
        x = 270 + rank * 210
        sheet.paste(im, (x, y))
        color = "green" if report["relevance"][query].get(label, 0) > 0 else "red"
        draw.rectangle((x, y, x + 201, y + 116), outline=color, width=3)
        draw.text((x, y + 118), f"#{rank + 1} {label}", fill="black")
sheet.save(DIR / "ranking-comparison.jpg", quality=90)
print(DIR / "visual-review.html")
