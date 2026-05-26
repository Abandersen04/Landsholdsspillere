#!/usr/bin/env python3
"""
Genererer statiske HTML-filer for alle fødesteder (by-niveau).
URL: /by/{slug}/
"""

import json, os, re, unicodedata
from collections import defaultdict

with open("data/players.json", encoding="utf-8") as f:
    players = json.load(f)

def slugify(text):
    text = str(text or "").lower()
    text = text.replace("æ", "ae").replace("ø", "oe").replace("å", "aa")
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")

def player_slug(p):
    return f"{slugify(p['playerLabel'])}-{p['dbuID']}"

def format_date(s):
    maaneder = ["januar","februar","marts","april","maj","juni",
                "juli","august","september","oktober","november","december"]
    m = re.match(r'(\d{2})-(\d{2})-(\d{4})', str(s or ""))
    if not m: return s or "–"
    return f"{int(m.group(1))}. {maaneder[int(m.group(2))-1]} {m.group(3)}"

# ── Byg fødested-index ────────────────────────────────────────────
by_players  = defaultdict(list)
by_coords   = {}

for p in players:
    b = (p.get("birthPlaceLabel") or "").strip()
    if not b:
        continue
    by_players[b].append(p)
    if b not in by_coords and p.get("lat") and p.get("lon"):
        try:
            by_coords[b] = (float(p["lat"]), float(p["lon"]))
        except:
            pass

def render_by(bynavn):
    ps      = sorted(by_players[bynavn], key=lambda p: -int(p.get("n_matches") or 0))
    slug    = slugify(bynavn)
    n       = len(ps)
    total_m = sum(int(p.get("n_matches") or 0) for p in ps)
    total_g = sum(int(p.get("n_goals")   or 0) for p in ps)
    coords  = by_coords.get(bynavn)

    # Kort-HTML
    if coords:
        map_html = f"""<div id="by-map" style="height:260px;border-radius:10px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.1)"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<script>
(function() {{
  const map = L.map('by-map', {{zoomControl:true}});
  L.tileLayer('https://{{s}}.basemaps.cartocdn.com/light_all/{{z}}/{{x}}/{{y}}{{r}}.png',
    {{attribution:'© OpenStreetMap © CARTO', maxZoom:18}}).addTo(map);
  const marker = L.circleMarker([{coords[0]}, {coords[1]}],
    {{radius:10, color:'#C8102E', fillColor:'#C8102E', fillOpacity:0.85, weight:2}}).addTo(map);
  marker.bindPopup('<strong>{bynavn}</strong><br>{n} landsholdsspillere').openPopup();
  map.setView([{coords[0]}, {coords[1]}], 10);
}})();
</script>"""
    else:
        map_html = ""

    # Spillertabel rækker
    rows = ""
    for p in ps:
        pslug  = player_slug(p)
        navn   = p.get("playerLabel") or ""
        kampe  = int(p.get("n_matches") or 0)
        maal   = int(p.get("n_goals") or 0)
        bday   = format_date(p.get("birthday_dbu"))
        gender = "K" if p.get("gender") == "kvinde" else "M"
        klub   = p.get("klubnavn") or "–"
        klub_link = f'<a href="/klub/{slugify(klub)}/" style="color:#C8102E">{klub}</a>' if klub != "–" else "–"
        rows += (
            f'<tr data-gender="{p.get("gender","")}">'
            f'<td><a href="/spiller/{pslug}/" style="color:#C8102E;font-weight:500">{navn}</a></td>'
            f'<td style="text-align:center">{gender}</td>'
            f'<td style="text-align:center">{kampe}</td>'
            f'<td style="text-align:center">{maal if maal else "–"}</td>'
            f'<td class="hide-mobile">{bday}</td>'
            f'<td class="hide-mobile">{klub_link}</td>'
            f'</tr>\n'
        )

    description = (
        f"{n} danske A-landsholdsspillere er født i {bynavn}. "
        f"Tilsammen har de spillet {total_m} kampe og scoret {total_g} mål for Danmark."
    )

    return f"""<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Landsholdsspillere fra {bynavn} – {n} spillere | Landsholdskortet</title>
  <meta name="description" content="{description}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://landsholdskortet.dk/by/{slug}/">
  <meta property="og:title" content="Landsholdsspillere fra {bynavn}">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="https://landsholdskortet.dk/by/{slug}/">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://landsholdskortet.dk/og-image.png">
  <script type="application/ld+json">
  {{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
    {{"@type":"ListItem","position":1,"name":"Landsholdskortet","item":"https://landsholdskortet.dk/"}},
    {{"@type":"ListItem","position":2,"name":"Fødesteder","item":"https://landsholdskortet.dk/by/"}},
    {{"@type":"ListItem","position":3,"name":"{bynavn}","item":"https://landsholdskortet.dk/by/{slug}/"}}
  ]}}
  </script>
  <link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/fonts/inter.css">
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: "Inter", -apple-system, sans-serif; background: #f4f4f4; color: #1a1a1a; }}
    a {{ color: #C8102E; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    .topbar {{ background: #C8102E; padding: 12px 20px; display: flex; align-items: center; gap: 16px; }}
    .topbar a {{ color: #fff; font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 6px; }}
    .topbar a:hover {{ text-decoration: none; opacity: .85; }}
    .page {{ max-width: 960px; margin: 0 auto; padding: 24px 16px 60px; }}
    .header {{ background: #fff; border-radius: 10px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,.07); margin-bottom: 20px; }}
    h1 {{ font-size: 26px; margin-bottom: 6px; }}
    .stats-row {{ display: flex; gap: 16px; margin: 16px 0; flex-wrap: wrap; }}
    .stat {{ background: #f8f8f8; border-radius: 8px; padding: 12px 20px; text-align: center; }}
    .stat-n {{ font-size: 22px; font-weight: 700; color: #C8102E; }}
    .stat-l {{ font-size: 11px; color: #888; margin-top: 2px; text-transform: uppercase; letter-spacing: .4px; }}
    .card {{ background: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,.07); }}
    .filter-row {{ display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }}
    .pill {{ padding: 6px 14px; border-radius: 20px; border: 1px solid #ddd; background: #fff; font-size: 13px; cursor: pointer; font-family: inherit; color: #555; }}
    .pill.active {{ background: #C8102E; color: #fff; border-color: #C8102E; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th {{ text-align: left; color: #999; font-weight: 500; font-size: 12px; padding: 4px 8px 10px; border-bottom: 1px solid #eee; text-transform: uppercase; letter-spacing: .4px; cursor: pointer; user-select: none; }}
    th:hover {{ color: #333; }}
    td {{ padding: 9px 8px; border-bottom: 1px solid #f5f5f5; }}
    tr:last-child td {{ border-bottom: none; }}
    tr:hover td {{ background: #fafafa; }}
    @media (max-width: 600px) {{ .hide-mobile {{ display: none; }} }}
  </style>
</head>
<body>
<div class="topbar">
  <a href="/">
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M13 17l-7-7 7-7" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
    Landsholdskortet
  </a>
</div>

<div class="page">
  <div class="header">
    <h1>Landsholdsspillere fra {bynavn}</h1>
    <div class="stats-row">
      <div class="stat"><div class="stat-n">{n}</div><div class="stat-l">Spillere</div></div>
      <div class="stat"><div class="stat-n">{total_m}</div><div class="stat-l">Kampe i alt</div></div>
      <div class="stat"><div class="stat-n">{total_g}</div><div class="stat-l">Mål i alt</div></div>
    </div>
  </div>

  {map_html}

  <div class="card">
    <div class="filter-row">
      <button class="pill active" onclick="filterGender('alle', this)">Alle</button>
      <button class="pill" onclick="filterGender('mand', this)">Mænd</button>
      <button class="pill" onclick="filterGender('kvinde', this)">Kvinder</button>
    </div>
    <table>
      <thead>
        <tr>
          <th onclick="sortTable(0)">Spiller ↕</th>
          <th style="text-align:center" onclick="sortTable(1)">Køn ↕</th>
          <th style="text-align:center" onclick="sortTable(2)">Kampe ↕</th>
          <th style="text-align:center" onclick="sortTable(3)">Mål ↕</th>
          <th class="hide-mobile" onclick="sortTable(4)">Fødselsdato ↕</th>
          <th class="hide-mobile" onclick="sortTable(5)">Barndomsklub ↕</th>
        </tr>
      </thead>
      <tbody id="tbody">
{rows}      </tbody>
    </table>
  </div>

  <div style="margin-top:20px;text-align:center">
    <a href="/?q={bynavn}" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:#C8102E;color:#fff;border-radius:8px;font-weight:600;font-size:14px">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="white" stroke-width="2"/><circle cx="10" cy="10" r="3" fill="white"/></svg>
      Se på kortet
    </a>
  </div>
</div>

<script>
let currentGender = 'alle';
let sortCol = 2, sortAsc = false;

function filterGender(g, btn) {{
  currentGender = g;
  document.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTable();
}}

function sortTable(col) {{
  if (sortCol === col) sortAsc = !sortAsc;
  else {{ sortCol = col; sortAsc = col === 0 || col === 1 || col === 4 || col === 5; }}
  renderTable();
}}

function renderTable() {{
  const tbody = document.getElementById('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const visible = rows.filter(r => currentGender === 'alle' || r.dataset.gender === currentGender);
  const hidden  = rows.filter(r => currentGender !== 'alle' && r.dataset.gender !== currentGender);

  visible.sort((a, b) => {{
    const av = a.cells[sortCol]?.textContent.trim() || '';
    const bv = b.cells[sortCol]?.textContent.trim() || '';
    const an = parseFloat(av.replace(/[^0-9]/g,'')) || 0;
    const bn = parseFloat(bv.replace(/[^0-9]/g,'')) || 0;
    if (sortCol === 2 || sortCol === 3) return sortAsc ? an - bn : bn - an;
    return sortAsc ? av.localeCompare(bv, 'da') : bv.localeCompare(av, 'da');
  }});

  hidden.forEach(r => {{ r.style.display = 'none'; }});
  visible.forEach(r => {{ r.style.display = ''; tbody.appendChild(r); }});
}}
</script>
</body>
</html>"""

# ── Generér filer ─────────────────────────────────────────────────
out_dir = "by"
os.makedirs(out_dir, exist_ok=True)
generated = 0
slugs = []

for bynavn in by_players:
    slug = slugify(bynavn)
    dir_ = os.path.join(out_dir, slug)
    os.makedirs(dir_, exist_ok=True)
    with open(os.path.join(dir_, "index.html"), "w", encoding="utf-8") as f:
        f.write(render_by(bynavn))
    slugs.append(slug)
    generated += 1

print(f"Genereret {generated} bysider i /by/")

with open("_by_slugs.json", "w") as f:
    json.dump(slugs, f)
