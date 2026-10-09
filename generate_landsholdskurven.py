#!/usr/bin/env python3
"""Genberegner RAW-datasættet i landsholdskurven/index.html ud fra
data/kampe_dbu.json (via kampe_adapter.py) og data/players.json.

Selve siden (HTML/CSS/JS, inkl. x-akse-vælgeren) er hånd-bygget og røres ikke —
kun den indlejrede "const RAW = [...]"-linje erstattes, så kurverne (kampe, mål,
slutrunder, akkumuleret pr. alder) matcher de samme, verificerede kampdata som
resten af sitet nu bruger.

Genbruger career_kurve()/slugify() fra generate_player_pages.py (uden at køre
dens sidegenerering) for at garantere, at tallene her stemmer 1:1 med den lille
"Karrierekurve"-graf på hver spillers egen side.
"""
import json, re, sys, datetime

def load_generator_head():
    """Importerer kun funktionsdefinitionerne fra generate_player_pages.py
    (ikke selve side-genereringsløkken, som kører ved modul-niveau)."""
    src = open("generate_player_pages.py", encoding="utf-8").read()
    head = src[:src.index("def render_page(")]
    ns = {"__name__": "landsholdskurven_gen"}
    exec(compile(head, "generate_player_pages(head)", "exec"), ns)
    return ns

def main():
    ns = load_generator_head()
    players = ns["players"]
    career_kurve = ns["career_kurve"]
    slugify = ns["slugify"]

    def decimal_year(bday_str):
        d, m, y = (int(x) for x in bday_str.split("-"))
        dt = datetime.date(y, m, d)
        days = 366 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 365
        return round(y + (dt - datetime.date(y, 1, 1)).days / days, 3)

    sys.path.insert(0, ".")
    from kampe_adapter import load_kampe_dbu, active_in_year
    this_year = datetime.date.today().year
    active_pids = active_in_year(load_kampe_dbu(), this_year)
    print(f"spillere aktive i {this_year}: {len(active_pids)}", file=sys.stderr)

    raw = []
    skipped = []
    for p in players:
        pid, navn = p.get("dbuID"), p.get("playerLabel")
        if not pid or not navn:
            continue
        kurve = career_kurve(pid, navn)
        if not kurve:
            skipped.append((pid, navn))
            continue
        entry = {
            "id": pid,
            "navn": navn,
            "slug": f"{slugify(navn)}-{pid}",
            "gender": p.get("gender") or "mand",
            "total": kurve["kurve"][-1] if kurve["kurve"] else 0,
            "total_m": kurve["kurve_m"][-1] if kurve["kurve_m"] else 0,
            "kurve": kurve["kurve"],
            "kurve_m": kurve["kurve_m"],
            "kurve_sl": kurve["kurve_sl"],
        }
        if pid in active_pids:
            entry["aktiv"] = True
        if p.get("birthday_dbu"):
            try:
                entry["f"] = decimal_year(p["birthday_dbu"])
            except Exception:
                pass
        raw.append(entry)

    print(f"spillere med kurve: {len(raw)} | sprunget over (ingen kurve-data): {len(skipped)}", file=sys.stderr)

    path = "landsholdskurven/index.html"
    html = open(path, encoding="utf-8").read()
    new_raw_js = "const RAW = " + json.dumps(raw, ensure_ascii=False) + ";"
    new_html, n = re.subn(r"const RAW = \[.*?\];", lambda m: new_raw_js, html, count=1)
    if n != 1:
        print("FEJL: fandt ikke 'const RAW = [...]' i landsholdskurven/index.html", file=sys.stderr)
        sys.exit(1)
    open(path, "w", encoding="utf-8").write(new_html)
    print(f"landsholdskurven/index.html opdateret ({len(new_raw_js)} tegn RAW-data)", file=sys.stderr)

if __name__ == "__main__":
    main()
