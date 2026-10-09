"""Adapter: oversætter data/kampe_dbu.json til de datastrukturer
generatorerne (generate_player_pages.py, generate_landsholdskurven.py,
generate_rekordlister.py) historisk har hentet fra en ekstern ../kampe-mappe
(player_roles.json, match_lineups.json, kampe.json), som ikke længere findes.

kampe_dbu.json er selv-indsamlet og 100%-verificeret mod DBU's officielle
spillerstatistikker (se tools/scrape/README.md), så det er en fuldgyldig,
mere pålidelig erstatning — bl.a. har hvert mål nu et sikkert spiller-id i
stedet for den gamle fuzzy navne-matching.

Brug:
    from kampe_adapter import load_kampe_dbu, build_adapters
    kampe = load_kampe_dbu()
    player_roles, match_lineups, kampe_list = build_adapters(kampe)
"""
import json, collections

MAANED_DA = {1: "jan", 2: "feb", 3: "mar", 4: "apr", 5: "maj", 6: "jun",
             7: "jul", 8: "aug", 9: "sep", 10: "okt", 11: "nov", 12: "dec"}


def load_kampe_dbu(path="data/kampe_dbu.json"):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_adapters(kampe):
    """Returnerer (player_roles, match_lineups, kampe_list) i den form
    generatorerne forventer.

    - player_roles[dbuID] = {"starter": [match_id, ...], "indskiftet": [match_id, ...]}
    - match_lineups[match_id] = {"år": int}
    - kampe_list = [{"match_id", "dato" (DD. mmm. YYYY), "scoringer", "kamptype"}, ...]
      scoringer-entries har både "spiller" (navn, til bagudkompatibel fuzzy-match)
      og "spiller_id" (til sikker match — foretrækkes af goals_per_year/career_kurve).
      Selvmål er udeladt, så de ikke tæller som spillerens eget mål.
    """
    player_roles = collections.defaultdict(lambda: {"starter": [], "indskiftet": []})
    match_lineups = {}
    kampe_list = []

    for r in kampe:
        if not r.get("date"):
            continue  # aflyste/endnu ikke spillede kampe har intet forløb at udlede
        mid = r["id"]
        dd, mm, yyyy = r["date"].split("-")
        dato_str = f"{int(dd)}. {MAANED_DA[int(mm)]}. {yyyy}"
        match_lineups[mid] = {"år": int(yyyy)}

        det = r.get("detaljer", {})
        scoringer = [
            {"spiller": g.get("spiller") or "", "spiller_id": g.get("spiller_id")}
            for g in det.get("maal", []) if not g.get("selvmaal")
        ]
        sted_list = det.get("info", {}).get("Sted") or []
        sted_str = ", ".join(x.get("text", "") for x in sted_list if isinstance(x, dict) and x.get("text"))
        score_dk = score_mod = None
        if r.get("score"):
            parts = [s.strip() for s in r["score"].split("-")]
            if len(parts) == 2 and all(p.isdigit() for p in parts):
                score_dk, score_mod = parts

        kampe_list.append({
            "match_id": mid,
            "dato": dato_str,
            "scoringer": scoringer,
            "kamptype": r.get("kamptype") or "",
            "modstander": r.get("opponent") or "",
            "sted": sted_str,
            "score_dk": score_dk,
            "score_mod": score_mod,
        })

        for p in det.get("startopstilling", {}).get("Danmark", []):
            if p.get("id"):
                player_roles[p["id"]]["starter"].append(mid)
        for s in det.get("udskiftninger", []):
            if s.get("ind_id"):
                player_roles[s["ind_id"]]["indskiftet"].append(mid)

    return dict(player_roles), match_lineups, kampe_list


def years_played(kampe):
    """pid -> sorteret liste af år, spilleren har spillet mindst én landskamp i.
    Bruges til periode-filtre (vælg fra-år/til-år) på landsholdskurven og
    rekordlister."""
    years = collections.defaultdict(set)
    for r in kampe:
        if not r.get("date"):
            continue
        yyyy = int(r["date"].split("-")[2])
        det = r.get("detaljer", {})
        for p in det.get("startopstilling", {}).get("Danmark", []):
            if p.get("id"):
                years[p["id"]].add(yyyy)
        for s in det.get("udskiftninger", []):
            if s.get("ind_id"):
                years[s["ind_id"]].add(yyyy)
    return {pid: sorted(ys) for pid, ys in years.items()}


EM_VM = {"EM-slutrunde", "VM-slutrunde"}


def match_records(kampe):
    """Kompakte kamp-poster til klient-side periode-filtrering (rekordlister):
    [{"y": år, "p": [spiller_id, ...], "w": True (kun hvis vundet),
      "t": "EM/VM-slutrunde ÅÅÅÅ" (kun hvis slutrundekamp),
      "g": [spiller_id, ...] (scorere, ekskl. selvmål, kun hvis mål)}, ...]"""
    out = []
    for r in kampe:
        if not r.get("date"):
            continue
        det = r.get("detaljer", {})
        yyyy = int(r["date"].split("-")[2])

        played = set()
        for p in det.get("startopstilling", {}).get("Danmark", []):
            if p.get("id"):
                played.add(p["id"])
        for s in det.get("udskiftninger", []):
            if s.get("ind_id"):
                played.add(s["ind_id"])
        if not played:
            continue

        score_dk = score_mod = None
        if r.get("score"):
            parts = [x.strip() for x in r["score"].split("-")]
            if len(parts) == 2 and all(x.isdigit() for x in parts):
                score_dk, score_mod = int(parts[0]), int(parts[1])
        vandt = score_dk is not None and score_dk > score_mod

        kt = r.get("kamptype") or ""
        tur = f"{kt} {yyyy}" if any(t in kt for t in EM_VM) else None

        goals = [g["spiller_id"] for g in det.get("maal", [])
                 if g.get("spiller_id") and not g.get("selvmaal")]

        rec = {"y": yyyy, "p": sorted(played)}
        if vandt:
            rec["w"] = True
        if tur:
            rec["t"] = tur
        if goals:
            rec["g"] = goals
        out.append(rec)
    return out
