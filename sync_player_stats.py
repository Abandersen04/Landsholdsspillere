#!/usr/bin/env python3
"""Synkroniserer n_matches/n_goals/years_played i data/players.json med
sandheden i data/kampe_dbu.json, og opdaterer præcis de steder på hjemmesiden
der viser de tal – ikke mere, ikke mindre:

  1. data/players.json: n_matches, n_goals, years_played patches surgisk
     (samme byte-præcise JSONDecoder.raw_decode-teknik som tidligere "kun
     kamp/mål"-opdateringer i denne session) – intet andet felt røres.
  2. /spiller/<slug>/-sider, for spillere hvis EGNE kampe/mål-tal ændrede sig
     ("direkte" gruppen): title/meta/og/JSON-LD-tallene opdateres (rene
     tal-substitutioner, ingen tilfældighed involveret), og "sætning 4" i
     SEO-bio-afsnittet ("X har spillet N kampe og scoret M mål...") erstattes
     med den tilsvarende nye sætning – men KUN hvis den gamle sætning kan
     genfindes ordret i den liggende HTML (ellers springes filen over med en
     advarsel, se note herunder).
  3. landsholdskurven/rekordlister genkøres bagefter (de to scripts er
     allerede sikre at køre ufiltreret, ingen tilfældighed involveret der).

IKKE opdateret af dette script (bevidst):
  - Rangeringssætningen ("Dermed er X nr. N på listen over flest mål...").
    Den er valgt ud fra en pseudo-tilfældig sekvens der er seedet pr. spiller,
    men hvis præcise forløb viste sig IKKE at være reproducerbart fra den
    nuværende generate_player_pages.py – et testkørsel viste at gentegnet
    tekst for flere spillere (fx Pernille Harder) ramte en ANDEN tilfældig
    formulering end den der rent faktisk ligger på sitet, selvom de
    underliggende tal/placeringer var identiske. Det betyder scriptets
    generator-kode er kommet ud af trit med hvordan de liggende sider historisk
    blev genereret (samme kendte problem som ved den fulde spillerside-
    generator, se tidligere samtale) – at overskrive rangeringssætningen
    blindt ville risikere at erstatte en gyldig, allerede-valgt formulering
    med en vilkårligt anden. Det gælder også den "kaskade"-gruppe af spillere
    hvis placeringstal flytter sig uden at deres egne kampe/mål ændrer sig –
    de får slet ikke deres side rørt i denne omgang. Flagges som kendt,
    bevidst hul (ligesom klub/by-siderne nedenfor), ikke løst her.
  - klub/by-siderne. Deres per-spiller-tabeller OG deres egne klub/by-mod-
    klub/by-rangeringer ("X er placeret som nr. N målt på barndomsklub") har
    samme kaskade-problem som spillerrangeringerne herover, men på klub/by-
    niveau – det er en større, separat opgave på linje med den tidligere
    identificerede risiko ved at køre generate_player_pages.py fuldt ud.
  - Nye debutanter der slet ikke findes i players.json endnu (ingen side at
    patche) – de tilføjes separat.

Kør:  python3 sync_player_stats.py           (dry-run, viser kun hvad der VILLE ske)
      python3 sync_player_stats.py --apply   (skriver filerne)
"""
import json, re, sys, copy, subprocess


def load_generator_head():
    src = open("generate_player_pages.py", encoding="utf-8").read()
    head = src[:src.index("def render_page(")]
    ns = {"__name__": "sync_player_stats"}
    exec(compile(head, "generate_player_pages(head)", "exec"), ns)
    return ns


def compute_truth(kampe):
    """pid -> (n_matches, n_goals, sorted years_played) direkte fra kampe_dbu.json."""
    sys.path.insert(0, ".")
    from kampe_adapter import match_records, years_played
    records = match_records(kampe)
    matches, goals = {}, {}
    for m in records:
        for pid in m["p"]:
            matches[pid] = matches.get(pid, 0) + 1
        for pid in m.get("g", []):
            goals[pid] = goals.get(pid, 0) + 1
    yrs = years_played(kampe)
    out = {}
    for pid in set(matches) | set(goals) | set(yrs):
        out[pid] = (matches.get(pid, 0), goals.get(pid, 0), yrs.get(pid, []))
    return out


def title_and_description(p):
    """Nøjagtig kopi af title/description-logikken i generate_player_pages.py's
    render_page() (linje ~617-631) – skal holdes i sync med den, hvis den
    ændres dér."""
    navn      = p.get("playerLabel") or ""
    kampe_n   = p.get("n_matches") or "0"
    maal_n    = p.get("n_goals") or "0"
    klub      = p.get("klubnavn") or ""
    fødested  = p.get("birthPlaceLabel") or ""
    kampe_n_int = int(kampe_n or 0)
    maal_n_int  = int(maal_n or 0)
    if kampe_n_int > 0 and maal_n_int > 0:
        title = f"{navn} – {kampe_n_int} kampe, {maal_n_int} mål | Landsholdskortet"
    elif kampe_n_int > 0:
        title = f"{navn} – {kampe_n_int} A-landskampe | Landsholdskortet"
    else:
        title = f"{navn} – Landsholdskortet"
    description = (
        f"{navn} spillede {kampe_n} A-landskampe"
        + (f" og scorede {maal_n} mål" if str(maal_n) != "0" else "")
        + f" for Danmark. Barndomsklub: {klub}. Fødested: {fødested}."
    ).strip()
    return title, description


BIO_P_RE = re.compile(
    r'(<p style="background:#fff;border-radius:10px;padding:20px;'
    r'box-shadow:0 1px 4px rgba\(0,0,0,\.07\);margin-bottom:20px;'
    r'font-size:15px;line-height:1\.65;color:#333">)(.*?)(</p>)',
    re.S,
)


def sentence4_candidates(p):
    """De faste tekst-varianter for "sætning 4" (kampe/mål) i generer_tekst() –
    nøjagtig kopi af listerne i generate_player_pages.py (linje ~349-367).
    Returnerer None hvis sætning 4 slet ikke genereres (kampe_n <= 0)."""
    navn    = p.get("playerLabel") or ""
    kampe_n = int(p.get("n_matches") or 0)
    maal_n  = int(p.get("n_goals") or 0)
    if kampe_n <= 0:
        return None
    if maal_n >= 3:
        return [
            f"{navn} har spillet {kampe_n} kampe og scoret {maal_n} mål for det danske A-landshold.",
            f"I alt optrådte {navn.split()[0]} i {kampe_n} A-landskampe og scorede {maal_n} mål.",
            f"Med {kampe_n} landskampe og {maal_n} mål har {navn} sat sit præg på dansk fodbold.",
        ]
    elif maal_n in (1, 2):
        return [
            f"{navn} har spillet {kampe_n} kampe for det danske A-landshold og scoret {maal_n} mål.",
            f"I alt nåede {navn.split()[0]} at optræde i {kampe_n} A-landskampe.",
        ]
    else:
        return [
            f"{navn} har spillet {kampe_n} kampe for det danske A-landshold.",
            f"I alt nåede {navn.split()[0]} at optræde i {kampe_n} A-landskampe.",
        ]


def find_sentence4(full_bio_text, candidates):
    """Finder hvilken af varianterne der rent faktisk blev valgt (ved at lede
    efter den i den fulde, allerede-genererede bio-tekst). None hvis ingen af
    dem findes (fx hvis sætning 4 slet ikke er med)."""
    if not candidates:
        return None
    for c in candidates:
        if c in full_bio_text:
            return c
    return None


def format_years_array(years):
    """Formatterer en liste af årstal som players.json's egen pretty-print-stil:
    felt-indryk 4, array-elementer 6, lukke-']' 4 (matcher json.dump(..., indent=2)
    anvendt på hele filen, genskabt lokalt for kun dette felt)."""
    if not years:
        return "[]"
    text = json.dumps(years, indent=2)  # "[\n  2024,\n  2025\n]"
    lines = text.split("\n")
    return lines[0] + "\n" + "\n".join("    " + l for l in lines[1:])


def patch_player_json(raw, changed, expected_count):
    """Patcher n_matches/n_goals/years_played surgisk i players.json's rå tekst.
    changed: {dbuID: (new_m, new_g, new_years)}. Returnerer (ny_tekst, antal_patchet).
    Finder hvert top-niveau-objekts præcise byte-span via gentagne
    JSONDecoder.raw_decode-kald (samme teknik som tidligere surgiske patches i
    dette projekt), så alt andet i filen forbliver byte-identisk."""
    dec = json.JSONDecoder()
    spans = []  # (start, end, obj)
    i = raw.index("[") + 1
    for _ in range(expected_count):
        while raw[i] in " \n\r\t,":
            i += 1
        obj, end = dec.raw_decode(raw, i)
        spans.append((i, end, obj))
        i = end
    assert len(spans) == expected_count, f"forventede {expected_count} spiller-objekter, fandt {len(spans)}"

    out = []
    cursor = 0
    n_patched = 0
    for start, end, obj in spans:
        pid = obj.get("dbuID")
        out.append(raw[cursor:start])
        block = raw[start:end]
        if pid in changed:
            new_m, new_g, new_years = changed[pid]
            block, n1 = re.subn(r'"n_matches":\s*"\d+"', f'"n_matches": "{new_m}"', block, count=1)
            block, n2 = re.subn(r'"n_goals":\s*"\d+"', f'"n_goals": "{new_g}"', block, count=1)
            reindented = format_years_array(sorted(new_years))
            if re.search(r'"years_played":\s*\[.*?\]', block, re.S):
                block, n3 = re.subn(r'"years_played":\s*\[.*?\]', f'"years_played": {reindented}', block, count=1, flags=re.S)
            else:
                n3 = 0  # ingen years_played-felt at patche (sjældent, men muligt)
            if n1 and n2:
                n_patched += 1
            else:
                print(f"ADVARSEL: kunne ikke finde n_matches/n_goals-felt for {pid} – sprunget over", file=sys.stderr)
        out.append(block)
        cursor = end
    out.append(raw[cursor:])
    return "".join(out), n_patched


def main():
    apply = "--apply" in sys.argv

    ns = load_generator_head()
    players_old = ns["players"]
    build_rankings = ns["build_rankings"]
    generer_tekst = ns["generer_tekst"]
    slugify = ns["slugify"]

    kampe = json.load(open("data/kampe_dbu.json", encoding="utf-8"))
    truth = compute_truth(kampe)

    by_id_old = {p["dbuID"]: p for p in players_old}
    changed = {}
    for pid, (new_m, new_g, new_years) in truth.items():
        p = by_id_old.get(pid)
        if not p:
            continue  # findes ikke i players.json (debutant – håndteres separat)
        old_m = int(p.get("n_matches") or 0)
        old_g = int(p.get("n_goals") or 0)
        old_years = sorted(y for y in (p.get("years_played") or []) if isinstance(y, int))
        if new_m != old_m or new_g != old_g or sorted(new_years) != old_years:
            changed[pid] = (new_m, new_g, sorted(new_years))

    # stat_changed: streng delmængde af changed, hvor selve kampe- eller mål-TALLET
    # rykker sig (ikke kun years_played). Kun disse har en title/description/sætning-4
    # der reelt skal genberegnes – ellers ville scriptet forsøge at "opdatere" en
    # sætning der allerede er faktuelt korrekt, og i praksis risikere at erstatte den
    # med en anden, lige så gyldig formulering (samme reproducerbarheds-problem som
    # ramte rangeringssætningen, se docstring).
    stat_changed = {
        pid for pid, (m, g, y) in changed.items()
        if (m, g) != (int(by_id_old[pid].get("n_matches") or 0), int(by_id_old[pid].get("n_goals") or 0))
    }

    print(f"Spillere med ændrede kampe/mål/år: {len(changed)}", file=sys.stderr)
    for pid, (m, g, y) in sorted(changed.items(), key=lambda kv: by_id_old[kv[0]]["playerLabel"]):
        p = by_id_old[pid]
        tag = "" if pid in stat_changed else "  (kun years_played – ingen side at opdatere)"
        print(f"  {p['playerLabel']}: {p.get('n_matches')}->{m} kampe, {p.get('n_goals')}->{g} mål{tag}", file=sys.stderr)

    if not changed:
        print("Ingen ændringer fundet – intet at gøre.", file=sys.stderr)
        return

    # ── Byg "players_new" i hukommelsen og genberegn rangeringer ──────────
    players_new = copy.deepcopy(players_old)
    for p in players_new:
        pid = p.get("dbuID")
        if pid in changed:
            m, g, y = changed[pid]
            p["n_matches"] = str(m)
            p["n_goals"] = str(g)
            p["years_played"] = y
    build_rankings(players_new)
    by_id_new = {p["dbuID"]: p for p in players_new}

    # ── Rapportér kaskade-gruppen (rank-tekst der IKKE røres, se docstring) ──
    cascade_pids = []
    for pid, p_new in by_id_new.items():
        if pid in stat_changed:
            continue  # "direkte" gruppen, håndteres for sig
        p_old = by_id_old[pid]
        if generer_tekst(p_old) != generer_tekst(p_new):
            cascade_pids.append(pid)
    if cascade_pids:
        print(f"\n{len(cascade_pids)} spillere får en ændret placering (mål/snit/kampe-rang), "
              f"men røres IKKE denne gang (se docstring – rangeringssætningen er ikke sikkert "
              f"genskabelig): " + ", ".join(by_id_new[pid]["playerLabel"] for pid in cascade_pids), file=sys.stderr)

    # ── Byg patch-info for den "direkte" gruppe (egne kampe/mål ændret) ────
    # old_s4 bestemmes IKKE ved at genberegne p_old (det har vi netop set kan
    # afvige fra den liggende side) – i stedet leder vi efter hver kandidat-
    # sætning direkte i den liggende HTML nedenfor, så vi patcher den sætning
    # der faktisk står der, uanset hvilken af varianterne det er.
    pages_to_patch = {}
    for pid in stat_changed:
        p_old, p_new = by_id_old[pid], by_id_new[pid]
        old_title, old_desc = title_and_description(p_old)
        new_title, new_desc = title_and_description(p_new)
        old_candidates = sentence4_candidates(p_old) or []
        new_s4 = find_sentence4(generer_tekst(p_new), sentence4_candidates(p_new))
        pages_to_patch[pid] = {
            "slug": f"{slugify(p_new['playerLabel'])}-{pid}",
            "navn": p_new["playerLabel"],
            "old_title": old_title, "new_title": new_title,
            "old_desc": old_desc, "new_desc": new_desc,
            "old_candidates": old_candidates, "new_s4": new_s4,
        }

    print(f"\nSpillersider der skal patches (direkte gruppe): {len(pages_to_patch)}", file=sys.stderr)

    # ── Patch hver spillerside ─────────────────────────────────────────
    file_errors = []
    files_patched = []
    for pid, info in pages_to_patch.items():
        path = f"spiller/{info['slug']}/index.html"
        try:
            html = open(path, encoding="utf-8").read()
        except FileNotFoundError:
            file_errors.append((pid, path, "fil findes ikke"))
            continue
        original = html

        if info["old_title"] != info["new_title"]:
            if info["old_title"] not in html:
                file_errors.append((pid, path, "gammel title ikke fundet – sprunget over")); continue
            html = html.replace(info["old_title"], info["new_title"])
        if info["old_desc"] != info["new_desc"]:
            if info["old_desc"] not in html:
                file_errors.append((pid, path, "gammel description ikke fundet – sprunget over")); continue
            html = html.replace(info["old_desc"], info["new_desc"])

        old_s4 = find_sentence4(html, info["old_candidates"])
        if old_s4 is None and info["old_candidates"]:
            file_errors.append((pid, path, "'sætning 4' (kampe/mål) ikke fundet ordret på siden – sprunget over")); continue
        if old_s4 and info["new_s4"] and old_s4 != info["new_s4"]:
            html = html.replace(old_s4, info["new_s4"], 1)

        if html == original:
            continue  # intet reelt ændrede sig i denne fil

        files_patched.append((pid, path, html))

    if file_errors:
        print(f"\n{len(file_errors)} FEJL/ADVARSLER:", file=sys.stderr)
        for pid, path, msg in file_errors:
            print(f"  {path}: {msg}", file=sys.stderr)

    print(f"\n{len(files_patched)} filer klar til at blive skrevet.", file=sys.stderr)

    if not apply:
        print("\nDRY-RUN (ingen filer skrevet). Kør med --apply for at udføre ændringerne.", file=sys.stderr)
        return

    # ── Skriv players.json ─────────────────────────────────────────────
    raw = open("data/players.json", encoding="utf-8").read()
    new_raw, n_patched = patch_player_json(raw, changed, len(players_old))
    if n_patched != len(changed):
        print(f"FEJL: forventede at patche {len(changed)} spillere i players.json, patchede {n_patched} – ABORT", file=sys.stderr)
        sys.exit(1)
    # Verificér: genindlæs og sammenlign felt for felt
    new_players = json.loads(new_raw)
    new_by_id = {p["dbuID"]: p for p in new_players}
    for p_old in players_old:
        pid = p_old["dbuID"]
        p_check = new_by_id.get(pid)
        if p_check is None:
            print(f"FEJL: spiller {pid} forsvandt fra players.json efter patch – ABORT", file=sys.stderr)
            sys.exit(1)
        for key in p_old:
            if key in ("n_matches", "n_goals", "years_played"):
                continue
            if key.startswith("_rank_"):
                continue  # runtime-beregnet af build_rankings(), findes ikke i selve JSON-filen
            if p_old[key] != p_check.get(key):
                print(f"FEJL: felt '{key}' ændrede sig uventet for spiller {pid} – ABORT (intet skrevet)", file=sys.stderr)
                sys.exit(1)
    open("data/players.json", "w", encoding="utf-8").write(new_raw)
    print(f"data/players.json opdateret ({n_patched} spillere).", file=sys.stderr)

    # ── Skriv spillersider ─────────────────────────────────────────────
    for pid, path, html in files_patched:
        open(path, "w", encoding="utf-8").write(html)
    print(f"{len(files_patched)} spillersider opdateret.", file=sys.stderr)

    # ── Genkør landsholdskurven + rekordlister ──────────────────────────
    for script in ("generate_landsholdskurven.py", "generate_rekordlister.py"):
        print(f"\nKører {script}...", file=sys.stderr)
        subprocess.run([sys.executable, script], check=True)


if __name__ == "__main__":
    main()
