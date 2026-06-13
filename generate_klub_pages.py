#!/usr/bin/env python3
"""
Genererer statiske HTML-filer for alle barndomsklubber.
URL: /klub/{slug}/
"""

import json, os, re, unicodedata
from collections import defaultdict
from datetime import date

with open("data/players.json", encoding="utf-8") as f:
    players = json.load(f)

# Byg national rangering (alle klubber sorteret efter antal spillere)
_klub_all_counts = defaultdict(int)
for _p in players:
    _seen = set()
    for _c in (_p.get("allClubs") or []):
        _k = (_c.get("klubnavn") or "").strip()
        if _k and _k not in _seen:
            _seen.add(_k)
            _klub_all_counts[_k] += 1
_sorted_klubs = sorted(_klub_all_counts.items(), key=lambda x: -x[1])
KLUB_NATIONAL_RANK = {k: i+1 for i, (k, _) in enumerate(_sorted_klubs)}
TOTAL_KLUBS = len(KLUB_NATIONAL_RANK)

def slugify(text):
    text = str(text or "").lower()
    text = text.replace("æ", "ae").replace("ø", "oe").replace("å", "aa")
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")

def player_slug(p):
    return f"{slugify(p['playerLabel'])}-{p['dbuID']}"

# ── Byg klub-index ────────────────────────────────────────────────
klub_players = defaultdict(list)
klub_info    = {}

for p in players:
    seen_clubs = set()
    for club in (p.get("allClubs") or []):
        k = (club.get("klubnavn") or "").strip()
        if not k or k in seen_clubs:
            continue
        seen_clubs.add(k)
        klub_players[k].append(p)
        if k not in klub_info:
            klub_info[k] = {
                "lat":     club.get("latitude"),
                "lon":     club.get("longitude"),
                "logo":    club.get("klub_logo") or "",
                "website": "",
                "dbu_url": f"https://www.dbu.dk/resultater/klub/{club['klub_id']}/klubinfo" if club.get("klub_id") else "",
            }

def format_date(s):
    maaneder = ["januar","februar","marts","april","maj","juni",
                "juli","august","september","oktober","november","december"]
    m = re.match(r'(\d{2})-(\d{2})-(\d{4})', str(s or ""))
    if not m: return s or "–"
    return f"{int(m.group(1))}. {maaneder[int(m.group(2))-1]} {m.group(3)}"

def render_klub(klubnavn):
    info    = klub_info[klubnavn]
    ps      = sorted(klub_players[klubnavn],
                     key=lambda p: -int(p.get("n_matches") or 0))
    slug    = slugify(klubnavn)
    logo    = info["logo"]
    n       = len(ps)
    total_m = sum(int(p.get("n_matches") or 0) for p in ps)
    total_g = sum(int(p.get("n_goals")   or 0) for p in ps)

    # Logo HTML
    if logo:
        logo_src = ("/" + logo) if logo.startswith("logos/") else logo
        logo_html = f'<img src="{logo_src}" alt="{klubnavn} logo" style="height:64px;width:auto;object-fit:contain;margin-bottom:12px">'
    else:
        logo_html = ""

    # Links (ingen adresse)
    links = []
    if info["website"] and info["website"] != info["dbu_url"]:
        links.append(f'<a href="{info["website"]}" target="_blank" rel="noopener" style="color:#C8102E;font-size:14px">Klubbens hjemmeside</a>')
    if info["dbu_url"]:
        links.append(f'<a href="{info["dbu_url"]}" target="_blank" rel="noopener" style="color:#C8102E;font-size:14px">DBU-profil</a>')
    links_html = " · ".join(links)

    # Kort
    lat, lon = info.get("lat"), info.get("lon")
    try:
        lat_f, lon_f = float(lat), float(lon)
        logo_src = ("/" + logo) if logo.startswith("logos/") else logo
        if logo:
            icon_js = (
                f"L.divIcon({{html:'<div style=\"width:36px;height:36px;border-radius:50%;border:2px solid #C8102E;"
                f"overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center\">"
                f"<img src=\"{logo_src}\" style=\"width:100%;height:100%;object-fit:contain\" "
                f"onerror=\"this.parentElement.style.background=\\'#C8102E\\'\"></div>',"
                f"className:'',iconSize:[36,36],iconAnchor:[18,18]}})"
            )
        else:
            icon_js = (
                "L.divIcon({html:'<div style=\"width:20px;height:20px;border-radius:50%;"
                "background:#C8102E;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)\"></div>',"
                "className:'',iconSize:[20,20],iconAnchor:[10,10]})"
            )
        map_html = (
            f'<div id="klub-map" style="height:260px;border-radius:10px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.1)"></div>\n'
            f'<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>\n'
            f'<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">\n'
            f'<script>\n(function(){{\n'
            f'  const map = L.map("klub-map",{{zoomControl:true}});\n'
            f'  L.tileLayer("https://{{s}}.basemaps.cartocdn.com/light_all/{{z}}/{{x}}/{{y}}{{r}}.png",'
            f'{{attribution:"© OpenStreetMap © CARTO",maxZoom:18}}).addTo(map);\n'
            f'  const icon = {icon_js};\n'
            f'  L.marker([{lat_f},{lon_f}],{{icon}}).addTo(map).bindPopup("<strong>{klubnavn}</strong>").openPopup();\n'
            f'  map.setView([{lat_f},{lon_f}],13);\n'
            f'}})();\n</script>'
        )
    except Exception:
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
        fsted  = p.get("birthPlaceLabel") or "–"
        by_slug = slugify(fsted)
        fsted_link = f'<a href="/by/{by_slug}/" style="color:#C8102E">{fsted}</a>' if fsted != "–" else "–"
        rows += (
            f'<tr data-gender="{p.get("gender","")}">'
            f'<td><a href="/spiller/{pslug}/" style="color:#C8102E;font-weight:500">{navn}</a></td>'
            f'<td style="text-align:center">{gender}</td>'
            f'<td style="text-align:center">{kampe}</td>'
            f'<td style="text-align:center">{maal if maal else "–"}</td>'
            f'<td>{bday}</td>'
            f'<td>{fsted_link}</td>'
            f'</tr>\n'
        )

    description = (
        f"{klubnavn} har fostret {n} danske A-landsholdsspillere. "
        f"Tilsammen har de spillet {total_m} kampe og scoret {total_g} mål for Danmark."
    )

    # Unik brødtekst (kun hvis > 5 spillere)
    nat_rank = KLUB_NATIONAL_RANK.get(klubnavn, 0)
    prose_html = ""
    if n > 5:
        top5 = ps[:5]
        top5_navne = [f'<a href="/spiller/{player_slug(p)}/" style="color:#C8102E">{p.get("playerLabel","")}</a> ({p.get("n_matches",0)} kampe)' for p in top5]
        if len(top5_navne) >= 2:
            top5_str = ", ".join(top5_navne[:-1]) + " og " + top5_navne[-1]
        else:
            top5_str = top5_navne[0]
        rank_txt = f"nr. {nat_rank} ud af {TOTAL_KLUBS}" if nat_rank else ""
        prose_html = f'''<div class="card" style="margin-top:20px;font-size:15px;line-height:1.7;color:#333">
  <p>Med {n} landsholdsspillere er {klubnavn} {f"placeret som {rank_txt} i Danmark målt på antal A-landsholdsspillere. " if rank_txt else ""}De fem spillere med flest kampe for Danmark er {top5_str}.</p>
</div>'''

    return f"""<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{klubnavn} – {n} landsholdsspillere | Landsholdskortet</title>
  <meta name="description" content="{description}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://landsholdskortet.dk/klub/{slug}/">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/favicon.svg">
  <meta property="og:title" content="{klubnavn} – {n} landsholdsspillere">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="https://landsholdskortet.dk/klub/{slug}/">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://landsholdskortet.dk/og-image.png">
  <script type="application/ld+json">
  {{"@context":"https://schema.org","@type":"SportsOrganization",
    "name":"{klubnavn}",
    "url":"https://landsholdskortet.dk/klub/{slug}/",
    "description":"{description}"
    {(',"logo":"' + (('/' + logo) if logo.startswith('logos/') else logo) + '"') if logo else ''}
  }}
  </script>
  <script type="application/ld+json">
  {{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
    {{"@type":"ListItem","position":1,"name":"Landsholdskortet","item":"https://landsholdskortet.dk/"}},
    {{"@type":"ListItem","position":2,"name":"Klubber","item":"https://landsholdskortet.dk/klub/"}},
    {{"@type":"ListItem","position":3,"name":"{klubnavn}","item":"https://landsholdskortet.dk/klub/{slug}/"}}
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
    {logo_html}
    <h1>{klubnavn}</h1>
    {f'<div style="margin-bottom:8px">{links_html}</div>' if links_html else ""}
    <div class="stats-row">
      <div class="stat"><div class="stat-n">{n}</div><div class="stat-l">Landsholdsspillere</div></div>
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
    <table id="spillertabel">
      <thead>
        <tr>
          <th onclick="sortTable(0)">Spiller</th>
          <th style="text-align:center" onclick="sortTable(1)">Køn</th>
          <th style="text-align:center" onclick="sortTable(2)">Kampe</th>
          <th style="text-align:center" onclick="sortTable(3)">Mål</th>
          <th class="hide-mobile" onclick="sortTable(4)">Fødselsdato</th>
          <th class="hide-mobile" onclick="sortTable(5)">Fødested</th>
        </tr>
      </thead>
      <tbody id="tbody">
{rows}      </tbody>
    </table>
  </div>

  {prose_html}

  <div style="margin-top:20px;text-align:center">
    <a href="/?q={klubnavn}" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:#C8102E;color:#fff;border-radius:8px;font-weight:600;font-size:14px">
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
out_dir = "klub"
os.makedirs(out_dir, exist_ok=True)
generated = 0
slugs = []

for klubnavn in klub_players:
    slug = slugify(klubnavn)
    dir_ = os.path.join(out_dir, slug)
    os.makedirs(dir_, exist_ok=True)
    with open(os.path.join(dir_, "index.html"), "w", encoding="utf-8") as f:
        f.write(render_klub(klubnavn))
    slugs.append(slug)
    generated += 1

print(f"Genereret {generated} klubsider i /klub/")

# Gem slugs til sitemap og JS-opslag
with open("_klub_slugs.json", "w") as f:
    json.dump(slugs, f)

# Gem som JS-tilgængeligt datasæt
with open("data/klub_slugs.json", "w") as f:
    json.dump(slugs, f)
print(f"data/klub_slugs.json opdateret ({len(slugs)} slugs)")
