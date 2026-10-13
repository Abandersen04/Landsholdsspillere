#!/usr/bin/env python3
"""Genberegner datasættet i quiz/index.html (PLAYERS + MATCHES) ud fra
data/players.json og data/kampe_dbu.json.

Siden selv (HTML/CSS/JS, de 4 spil) er hånd-bygget og røres ikke — kun de to
indlejrede "const PLAYERS = {...}" og "const MATCHES = [...]"-linjer erstattes.

PLAYERS bruges af "Gæt spilleren" og "Højere eller lavere".
MATCHES bruges af "Gæt resultatet" og "Hvem scorede?".
"""
import json, re, sys


def load_generator_head():
    src = open("generate_player_pages.py", encoding="utf-8").read()
    head = src[:src.index("def render_page(")]
    ns = {"__name__": "quiz_gen"}
    exec(compile(head, "generate_player_pages(head)", "exec"), ns)
    return ns


def main():
    ns = load_generator_head()
    players = ns["players"]
    slugify = ns["slugify"]
    find_debut_kamp = ns["find_debut_kamp"]
    parse_sted = ns["parse_sted"]
    kamptype_kort = ns["kamptype_kort"]

    sys.path.insert(0, ".")
    from kampe_adapter import load_kampe_dbu
    kampe = load_kampe_dbu()

    # ---- PLAYERS --------------------------------------------------------
    quiz_players = {}
    for p in players:
        pid = p.get("dbuID")
        navn = p.get("playerLabel")
        kampe_n = int(p.get("n_matches") or 0)
        if not pid or not navn or kampe_n <= 0:
            continue

        debut_kamp = find_debut_kamp(pid)
        debut = None
        if debut_kamp:
            mod = debut_kamp.get("modstander") or ""
            kt = kamptype_kort(debut_kamp.get("kamptype") or "")
            sted = parse_sted(debut_kamp.get("sted") or "", mod)
            dato_m = re.search(r"\b(\d{4})\b", debut_kamp.get("dato") or "")
            aar = dato_m.group(1) if dato_m else None
            score_dk, score_mod = debut_kamp.get("score_dk"), debut_kamp.get("score_mod")
            if aar:
                debut = {"aar": int(aar), "mod": mod, "kt": kt, "sted": sted}
                if score_dk and score_mod:
                    debut["score"] = f"{score_dk}-{score_mod}"

        bday = p.get("birthday_dbu") or ""
        foedselsaar = None
        m = re.match(r"\d{2}-\d{2}-(\d{4})", bday)
        if m:
            foedselsaar = int(m.group(1))

        quiz_players[pid] = {
            "navn": navn,
            "slug": f"{slugify(navn)}-{pid}",
            "gender": p.get("gender") or "mand",
            "foedselsaar": foedselsaar,
            "foedested": p.get("birthPlaceLabel") or None,
            "klub": p.get("klubnavn") or None,
            "kampe": kampe_n,
            "maal": int(p.get("n_goals") or 0),
            "debut": debut,
        }

    print(f"quiz-spillere: {len(quiz_players)}", file=sys.stderr)

    # ---- MATCHES ----------------------------------------------------------
    quiz_matches = []
    for r in kampe:
        if not r.get("date"):
            continue
        det = r.get("detaljer", {})
        yyyy = int(r["date"].split("-")[2])

        played = set()
        for pl in det.get("startopstilling", {}).get("Danmark", []):
            if pl.get("id"):
                played.add(pl["id"])
        for s in det.get("udskiftninger", []):
            if s.get("ind_id"):
                played.add(s["ind_id"])
        if len(played) < 4:  # for få kendte deltagere til at bygge gode multiple-choice-distraktorer
            continue

        mod = r.get("opponent") or ""
        kt = kamptype_kort(r.get("kamptype") or "")
        sted_raw = det.get("info", {}).get("Sted") or []
        sted_str = ", ".join(x.get("text", "") for x in sted_raw if isinstance(x, dict) and x.get("text"))
        sted = parse_sted(sted_str, mod)

        score = None
        if r.get("score"):
            parts = [x.strip() for x in r["score"].split("-")]
            if len(parts) == 2 and all(x.isdigit() for x in parts):
                score = [int(parts[0]), int(parts[1])]

        goals = []
        for g in det.get("maal", []):
            if g.get("selvmaal") or not g.get("spiller_id"):
                continue
            if g["spiller_id"] not in played:
                continue
            goals.append({
                "min": (g.get("minut") or "").rstrip("'") or None,
                "pid": g["spiller_id"],
                "stilling": g.get("stilling") or None,
            })

        entry = {"y": yyyy, "opp": mod, "kt": kt, "sted": sted, "p": sorted(played)}
        if score:
            entry["score"] = score
        if goals:
            entry["goals"] = goals
        quiz_matches.append(entry)

    n_score = sum(1 for m in quiz_matches if "score" in m)
    n_goals = sum(len(m.get("goals", [])) for m in quiz_matches)
    print(f"quiz-kampe: {len(quiz_matches)} (med resultat: {n_score}), quiz-mål: {n_goals}", file=sys.stderr)

    # ---- Indsæt i siden ---------------------------------------------------
    path = "quiz/index.html"
    html = open(path, encoding="utf-8").read()

    new_players_js = "const PLAYERS = " + json.dumps(quiz_players, ensure_ascii=False) + ";"
    html, n = re.subn(r"const PLAYERS = \{.*?\};", lambda m: new_players_js, html, count=1)
    if n != 1:
        print("FEJL: fandt ikke 'const PLAYERS = {...}'", file=sys.stderr)
        sys.exit(1)

    new_matches_js = "const MATCHES = " + json.dumps(quiz_matches, ensure_ascii=False) + ";"
    html, n = re.subn(r"const MATCHES = \[.*?\];", lambda m: new_matches_js, html, count=1)
    if n != 1:
        print("FEJL: fandt ikke 'const MATCHES = [...]'", file=sys.stderr)
        sys.exit(1)

    open(path, "w", encoding="utf-8").write(html)
    print(f"quiz/index.html opdateret ({len(new_players_js) + len(new_matches_js)} tegn data)", file=sys.stderr)


if __name__ == "__main__":
    main()
