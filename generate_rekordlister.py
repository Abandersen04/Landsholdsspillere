#!/usr/bin/env python3
"""Genbygger de 6 kampdata-afhængige tabeller i rekordlister/index.html
(kampe, snit, sejr, turneringer, sæsoner, par) ud fra data/kampe_dbu.json
via kampe_adapter.py.

"klubber" og "kommuner" er uafhængige af kampdata (kommer fra players.json's
barndomsklub/fødested) og er ikke berørt af dagens rettelser — de røres ikke.

Siden i øvrigt (HTML/CSS/JS, gender-filter, expand-knapper) er hånd-bygget og
røres ikke — kun <tbody>-indholdet i de 6 sektioner erstattes.
"""
import json, re, sys, itertools, collections
from fractions import Fraction


def load_generator_head():
    src = open("generate_player_pages.py", encoding="utf-8").read()
    head = src[:src.index("def render_page(")]
    ns = {"__name__": "rekordlister_gen"}
    exec(compile(head, "generate_player_pages(head)", "exec"), ns)
    return ns


def rank_rows(items, key, fmt_extra=None, min_key=None):
    """items: liste af dicts med mindst 'value'. Returnerer rækker med
    konkurrence-rangering (ens værdi = samme placering)."""
    items = sorted(items, key=lambda x: -x["value"])
    rows, rank, prev = [], 0, None
    for pos, it in enumerate(items, 1):
        if it["value"] != prev:
            rank, prev = pos, it["value"]
        rows.append((rank, it))
    return rows


def render_table_rows(rows, link_fn, value_fn, extra_fn=None, gender_fn=None, current_fn=None):
    out = []
    for i, (rank, it) in enumerate(rows):
        hidden = ' class="hidden-row"' if i >= 20 else ""
        gender_attr = f' data-gender="{gender_fn(it)}"' if gender_fn else ""
        current_attr = ' data-current="1"' if current_fn and current_fn(it) else ""
        extra = extra_fn(it) if extra_fn else ""
        out.append(f'<tr{gender_attr}{current_attr}{hidden}><td class="rank">{rank}</td>'
                   f'<td>{link_fn(it)}</td><td class="num">{value_fn(it)}</td>{extra}</tr>')
    return "\n".join(out)


def spiller_link(navn, slug):
    return f'<a href="/spiller/{slug}/">{navn}</a>'


def main():
    ns = load_generator_head()
    players = ns["players"]
    slugify = ns["slugify"]
    by_id = {p["dbuID"]: p for p in players}

    sys.path.insert(0, ".")
    from kampe_adapter import load_kampe_dbu, active_in_year
    import datetime
    kampe = load_kampe_dbu()
    this_year = datetime.date.today().year
    active_pids = active_in_year(kampe, this_year)
    print(f"spillere aktive i {this_year}: {len(active_pids)}", file=sys.stderr)

    def slug(pid):
        p = by_id.get(pid)
        return f"{slugify(p['playerLabel'])}-{pid}" if p else None

    def navn(pid):
        p = by_id.get(pid)
        return p["playerLabel"] if p else "?"

    def gender(pid):
        p = by_id.get(pid)
        return (p.get("gender") or "mand") if p else "mand"

    # ---- Byg per-spiller rådata direkte fra kampe_dbu.json --------------
    matches = collections.Counter()
    wins = collections.Counter()
    goals = collections.Counter()
    seasons = collections.defaultdict(set)
    tournaments = collections.defaultdict(set)   # pid -> {(kamptype, år), ...}
    pair_counts = collections.Counter()           # frozenset({pid1,pid2}) -> antal kampe sammen

    EM_VM = {"EM-slutrunde", "VM-slutrunde"}

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
        for pid in played:
            matches[pid] += 1
            seasons[pid].add(yyyy)
            if vandt:
                wins[pid] += 1
            if any(t in kt for t in EM_VM):
                tournaments[pid].add(f"{kt} {yyyy}")

        for g in det.get("maal", []):
            if g.get("spiller_id") and not g.get("selvmaal"):
                goals[g["spiller_id"]] += 1

        for a, b in itertools.combinations(sorted(played), 2):
            pair_counts[(a, b)] += 1

    valid_pids = [pid for pid in matches if by_id.get(pid)]
    print(f"spillere med kampdata: {len(valid_pids)}", file=sys.stderr)

    sections = {}

    # ---- maal: flest mål ---------------------------------------------------
    items = [{"pid": pid, "value": goals[pid], "m": matches[pid]} for pid in valid_pids if goals[pid] > 0]
    rows = rank_rows(items, "value")
    sections["maal"] = render_table_rows(
        rows, lambda it: spiller_link(navn(it["pid"]), slug(it["pid"])),
        lambda it: it["value"],
        extra_fn=lambda it: f'<td class="num dim">{it["m"]} kampe</td>',
        gender_fn=lambda it: gender(it["pid"]), current_fn=lambda it: it["pid"] in active_pids)

    # ---- kampe: flest kampe ----------------------------------------------
    items = [{"pid": pid, "value": matches[pid]} for pid in valid_pids]
    rows = rank_rows(items, "value")
    sections["kampe"] = render_table_rows(
        rows, lambda it: spiller_link(navn(it["pid"]), slug(it["pid"])),
        lambda it: it["value"], gender_fn=lambda it: gender(it["pid"]),
        current_fn=lambda it: it["pid"] in active_pids)

    # ---- snit: bedste målsnit (min. 10 kampe) -----------------------------
    items = [{"pid": pid, "value": goals[pid] / matches[pid], "m": matches[pid], "g": goals[pid]}
             for pid in valid_pids if matches[pid] >= 10 and goals[pid] > 0]
    rows = rank_rows(items, "value")
    sections["snit"] = render_table_rows(
        rows, lambda it: spiller_link(navn(it["pid"]), slug(it["pid"])),
        lambda it: f"{it['value']:.2f}".replace(".", ","),
        extra_fn=lambda it: f'<td class="num dim">{it["m"]} kampe</td>',
        gender_fn=lambda it: gender(it["pid"]), current_fn=lambda it: it["pid"] in active_pids)

    # ---- sejr: bedste sejrsprocent (min. 10 kampe) -------------------------
    items = [{"pid": pid, "value": wins[pid] / matches[pid] * 100, "m": matches[pid], "w": wins[pid]}
             for pid in valid_pids if matches[pid] >= 10]
    rows = rank_rows(items, "value")
    sections["sejr"] = render_table_rows(
        rows, lambda it: spiller_link(navn(it["pid"]), slug(it["pid"])),
        lambda it: f"{it['value']:.1f}%",
        extra_fn=lambda it: f'<td class="num dim">{it["w"]}/{it["m"]} kampe</td>',
        gender_fn=lambda it: gender(it["pid"]), current_fn=lambda it: it["pid"] in active_pids)

    # ---- turneringer: flest EM/VM-slutrunder -------------------------------
    items = [{"pid": pid, "value": len(tournaments[pid]), "titel": ", ".join(sorted(tournaments[pid]))}
             for pid in valid_pids if tournaments[pid]]
    rows = rank_rows(items, "value")
    sections["turneringer"] = render_table_rows(
        rows, lambda it: spiller_link(navn(it["pid"]), slug(it["pid"])),
        lambda it: it["value"],
        gender_fn=lambda it: gender(it["pid"]), current_fn=lambda it: it["pid"] in active_pids)
    # title-attribut kræver speciel håndtering (anden <td>-form) - bygges separat:
    rows_t = rows
    out = []
    for i, (rank, it) in enumerate(rows_t):
        hidden = ' class="hidden-row"' if i >= 20 else ""
        current_attr = ' data-current="1"' if it["pid"] in active_pids else ""
        out.append(f'<tr data-gender="{gender(it["pid"])}"{current_attr}{hidden}><td class="rank">{rank}</td>'
                   f'<td>{spiller_link(navn(it["pid"]), slug(it["pid"]))}</td>'
                   f'<td class="num" title="{it["titel"]}">{it["value"]}</td></tr>')
    sections["turneringer"] = "\n".join(out)

    # ---- saesoner: flest aktive sæsoner ------------------------------------
    items = [{"pid": pid, "value": len(seasons[pid])} for pid in valid_pids]
    rows = rank_rows(items, "value")
    sections["saesoner"] = render_table_rows(
        rows, lambda it: spiller_link(navn(it["pid"]), slug(it["pid"])),
        lambda it: it["value"], gender_fn=lambda it: gender(it["pid"]),
        current_fn=lambda it: it["pid"] in active_pids)

    # ---- par: flest kampe sammen --------------------------------------------
    items = [{"a": a, "b": b, "value": n} for (a, b), n in pair_counts.items()
             if by_id.get(a) and by_id.get(b)]
    rows = rank_rows(items, "value")
    out = []
    for i, (rank, it) in enumerate(rows):
        hidden = ' class="hidden-row"' if i >= 20 else ""
        ga, gb = gender(it["a"]), gender(it["b"])
        g = ga if ga == gb else "alle"
        current_attr = ' data-current="1"' if it["a"] in active_pids and it["b"] in active_pids else ""
        link = (f'{spiller_link(navn(it["a"]), slug(it["a"]))} &amp; '
               f'{spiller_link(navn(it["b"]), slug(it["b"]))}')
        out.append(f'<tr data-gender="{g}"{current_attr}{hidden}><td class="rank">{rank}</td>'
                   f'<td>{link}</td><td class="num">{it["value"]}</td></tr>')
    sections["par"] = "\n".join(out)

    # ---- Indsæt i siden ------------------------------------------------------
    path = "rekordlister/index.html"
    html = open(path, encoding="utf-8").read()

    from datetime import date
    html = re.sub(r"opdateret \d{4}-\d{2}-\d{2}", f"opdateret {date.today().isoformat()}", html, count=1)
    for sid, new_rows in sections.items():
        pat = re.compile(
            rf'(id="{sid}" class="list-section[^"]*">.*?<tbody>\n)(.*?)(\n\s*</tbody>)', re.S)
        html, n = pat.subn(lambda m: m.group(1) + new_rows + m.group(3), html, count=1)
        if n != 1:
            print(f"FEJL: kunne ikke finde/erstatte sektion '{sid}'", file=sys.stderr)
            sys.exit(1)
        print(f"{sid}: {len(sections[sid].splitlines())} rækker", file=sys.stderr)

    open(path, "w", encoding="utf-8").write(html)
    print("rekordlister/index.html opdateret", file=sys.stderr)


if __name__ == "__main__":
    main()
