#!/usr/bin/env python3
"""Genbygger datasættet i rekordlister/index.html for de 7 kampdata-afhængige
sektioner (maal, kampe, snit, sejr, turneringer, saesoner, par).

Siden selv er hånd-bygget (HTML/CSS/JS) og røres ikke — den indeholder en
render-motor i browseren der genberegner alle tal og rangeringer dynamisk,
så man kan vælge en periode (fra-år/til-år) uden en ny sideopbygning. Dette
script erstatter derfor kun to linjer: "const MATCHES = [...]" (rå, kompakte
kamp-poster — år, deltagere, scorere, sejr/slutrunde-flag) og
"const PLAYERS = {...}" (pid -> [navn, slug, kønskode]), samt "opdateret"-datoen.

"klubber" og "kommuner" er uafhængige af kampdata (kommer fra players.json's
barndomsklub/fødested) og er stadig statisk renderet — de røres ikke her.
"""
import json, re, sys


def load_generator_head():
    src = open("generate_player_pages.py", encoding="utf-8").read()
    head = src[:src.index("def render_page(")]
    ns = {"__name__": "rekordlister_gen"}
    exec(compile(head, "generate_player_pages(head)", "exec"), ns)
    return ns


def main():
    ns = load_generator_head()
    players = ns["players"]
    slugify = ns["slugify"]
    by_id = {p["dbuID"]: p for p in players}

    sys.path.insert(0, ".")
    from kampe_adapter import load_kampe_dbu, match_records
    kampe = load_kampe_dbu()
    matches = match_records(kampe)
    print(f"kampe med kampdata: {len(matches)}", file=sys.stderr)

    # PLAYERS: kun spillere der rent faktisk optræder i mindst én kamp-post
    # (som deltager eller scorer) OG findes i players.json.
    referenced = set()
    for m in matches:
        referenced.update(m["p"])
        referenced.update(m.get("g", []))

    players_out = {}
    for pid in referenced:
        p = by_id.get(pid)
        if not p:
            continue
        gender = p.get("gender") or "mand"
        slug = f"{slugify(p['playerLabel'])}-{pid}"
        players_out[pid] = [p["playerLabel"], slug, gender]
    print(f"spillere i datasæt: {len(players_out)}", file=sys.stderr)

    path = "rekordlister/index.html"
    html = open(path, encoding="utf-8").read()

    new_matches_js = "const MATCHES = " + json.dumps(matches, ensure_ascii=False) + ";"
    html, n = re.subn(r"const MATCHES = \[.*?\];", lambda m: new_matches_js, html, count=1)
    if n != 1:
        print("FEJL: fandt ikke 'const MATCHES = [...]'", file=sys.stderr)
        sys.exit(1)

    new_players_js = "const PLAYERS = " + json.dumps(players_out, ensure_ascii=False) + ";"
    html, n = re.subn(r"const PLAYERS = \{.*?\};", lambda m: new_players_js, html, count=1)
    if n != 1:
        print("FEJL: fandt ikke 'const PLAYERS = {...}'", file=sys.stderr)
        sys.exit(1)

    from datetime import date
    html = re.sub(r"opdateret \d{4}-\d{2}-\d{2}", f"opdateret {date.today().isoformat()}", html, count=1)

    open(path, "w", encoding="utf-8").write(html)
    print(f"rekordlister/index.html opdateret ({len(new_matches_js) + len(new_players_js)} tegn data)", file=sys.stderr)


if __name__ == "__main__":
    main()
