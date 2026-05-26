#!/usr/bin/env python3
"""
Genererer statiske HTML-filer for alle spillere med:
- Leaflet-kort med alle klubber
- Debut år
- Karrieretabel: kampe og mål per år
"""

import json, os, re, unicodedata, itertools
from collections import defaultdict

# ── Indlæs data ───────────────────────────────────────────────
with open("data/players.json", encoding="utf-8") as f:
    players = json.load(f)

with open("../kampe/player_roles.json", encoding="utf-8") as f:
    player_roles = json.load(f)

with open("../kampe/match_lineups.json", encoding="utf-8") as f:
    match_lineups = json.load(f)

with open("../kampe/kampe.json", encoding="utf-8") as f:
    kampe_list = json.load(f)

# ── Rangering: mål og snit per køn ───────────────────────────
def build_rankings(players):
    for gender in ("mand", "kvinde"):
        group = [p for p in players
                 if p.get("gender") == gender
                 and int(p.get("n_goals") or 0) > 0
                 and int(p.get("n_matches") or 0) > 0]
        # Rangér efter mål (flest først)
        sorted_goals = sorted(group, key=lambda x: -int(x.get("n_goals") or 0))
        for rank, p in enumerate(sorted_goals, 1):
            p[f"_rank_goals_{gender}"] = rank
            p[f"_rank_goals_total_{gender}"] = len(sorted_goals)
        # Rangér efter snit (min. 10 kampe)
        qualified = [p for p in group if int(p.get("n_matches") or 0) >= 10]
        sorted_snit = sorted(qualified,
            key=lambda x: -(int(x.get("n_goals") or 0) / int(x.get("n_matches") or 1)))
        for rank, p in enumerate(sorted_snit, 1):
            p[f"_rank_snit_{gender}"] = rank
            p[f"_rank_snit_total_{gender}"] = len(sorted_snit)
        # Rangér efter antal kampe (alle med ≥1 kamp)
        sorted_kampe = sorted(group, key=lambda x: -int(x.get("n_matches") or 0))
        for rank, p in enumerate(sorted_kampe, 1):
            p[f"_rank_kampe_{gender}"] = rank

build_rankings(players)
player_by_id = {str(p.get("dbuID") or ""): p for p in players}

# ── Byg klub-index og fødested-index ─────────────────────────────
from collections import defaultdict as _dd
_klub_index = _dd(list)
_birth_index = _dd(list)
for _p in players:
    _k = (_p.get("klubnavn") or "").strip()
    if _k:
        _klub_index[_k].append(_p)
    _b = (_p.get("birthPlaceLabel") or "").strip()
    if _b:
        _birth_index[_b].append(_p)
KLUB_INDEX  = dict(_klub_index)
BIRTH_INDEX = dict(_birth_index)

# ── Hjælpefunktioner ─────────────────────────────────────────
def slugify(text):
    text = str(text or "").lower()
    text = text.replace("æ", "ae").replace("ø", "oe").replace("å", "aa")
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")

def norm(s):
    s = str(s or "").lower()
    s = s.replace("æ", "ae").replace("ø", "oe").replace("å", "aa")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()

# ── Byg kamp-index: match_id → {år, scoringer} ────────────────
kamp_by_id = {k["match_id"]: k for k in kampe_list}

# ── Byg mål-index: normalized_name → {år: antal} ─────────────
# Vi bygger det per spiller ved lookup (for at holde memory nede)
def goals_per_year(player_name, match_ids):
    """Tæl mål per år for en spiller baseret på scorerlisten i kampe."""
    name_norm = norm(player_name)
    result = defaultdict(int)
    for mid in match_ids:
        kamp = kamp_by_id.get(mid)
        if not kamp:
            continue
        year = None
        dato = kamp.get("dato", "")
        m = re.search(r'\b(1\d{3}|20\d{2})\b', dato)
        if m:
            year = int(m.group(1))
        if not year:
            continue
        for s in kamp.get("scoringer", []):
            spiller_norm = norm(s.get("spiller", ""))
            # Match: alle ord i søgenavn skal stå i scorernavn eller omvendt
            name_words = name_norm.split()
            if len(name_words) >= 2:
                if all(w in spiller_norm for w in name_words):
                    result[year] += 1
            else:
                if name_norm in spiller_norm or spiller_norm in name_norm:
                    result[year] += 1
    return result

# ── Byg karrieretabel per spiller ────────────────────────────
def format_date(dato_str):
    """'22-02-1969' → '22. februar 1969'"""
    maaneder = ["januar","februar","marts","april","maj","juni",
                "juli","august","september","oktober","november","december"]
    m = re.match(r'(\d{2})-(\d{2})-(\d{4})', str(dato_str or ''))
    if not m: return dato_str
    return f"{int(m.group(1))}. {maaneder[int(m.group(2))-1]} {m.group(3)}"

def find_debut_kamp(dbu_id):
    """Finder den kronologisk første kamp spilleren startede eller blev indskiftet i."""
    roller = player_roles.get(str(dbu_id), {})
    alle_mids = roller.get("starter", []) + roller.get("indskiftet", [])
    if not alle_mids:
        return None
    # Berig med dato fra kampe.json og sortér
    kandidater = []
    for mid in alle_mids:
        kamp = kamp_by_id.get(mid)
        if not kamp: continue
        dato = kamp.get("dato", "")
        m = re.search(r'(\d{2})[.\s]+(\w+)[.\s]+(\d{4})', dato)
        if not m: continue
        maaned_map = {"jan":1,"feb":2,"mar":3,"apr":4,"maj":5,"jun":6,
                      "jul":7,"aug":8,"sep":9,"okt":10,"nov":11,"dec":12}
        try:
            dag = int(m.group(1))
            mnd_str = m.group(2)[:3].lower()
            aar = int(m.group(3))
            mnd = maaned_map.get(mnd_str, 0)
            if mnd == 0: continue
            kandidater.append((aar * 10000 + mnd * 100 + dag, kamp))
        except: continue
    if not kandidater:
        return None
    kandidater.sort()
    return kandidater[0][1]

def parse_sted(sted_str, modstander=""):
    """'Aarhus Stadion , Aarhus , Danmark' → 'Aarhus, Danmark'
    Udelader landet hvis det er det samme som modstanderens land."""
    parts = [s.strip() for s in str(sted_str or "").split(",")]
    if len(parts) >= 3:
        by, land = parts[1].strip(), parts[2].strip()
        # Undgå gentagelse: "mod Sverige i Stockholm, Sverige"
        if modstander and norm(modstander) in norm(land):
            return by
        return f"{by}, {land}"
    elif len(parts) >= 2:
        return f"{parts[0].strip()}, {parts[1].strip()}"
    return sted_str

def kamptype_kort(kt):
    """Forkorter kamptype til læsevenlig form."""
    kt = str(kt or "")
    kt = re.sub(r"A-Landshold \((Herrer|Kvinder)\) - ", "", kt)
    return kt

import random

def generer_tekst(p):
    """Genererer et varieret SEO-tekstafsnit for en spiller."""
    navn    = p.get("playerLabel") or ""
    gender  = p.get("gender") or "mand"
    han     = "Hun" if gender == "kvinde" else "Han"
    hans    = "Hendes" if gender == "kvinde" else "Hans"
    bday    = p.get("birthday_dbu") or ""
    fsted   = p.get("birthPlaceLabel") or ""
    klub    = p.get("klubnavn") or ""
    kampe_n = int(p.get("n_matches") or 0)
    maal_n  = int(p.get("n_goals") or 0)
    years   = [y for y in (p.get("years_played") or []) if isinstance(y, int)]
    dbu_id  = p.get("dbuID") or ""
    # Brug dbuID som seed så teksten er stabil (ikke skifter ved genkørsel)
    rng = random.Random(int(str(dbu_id or 0) or 0))

    afsnit = []

    # ── Sætning 1: fødsel ────────────────────────────────────
    if bday and fsted:
        varianter = [
            f"{navn} er født den {format_date(bday)} i {fsted}.",
            f"{navn} kom til verden den {format_date(bday)} i {fsted}.",
            f"{navn} er fra {fsted} og født den {format_date(bday)}.",
        ]
        afsnit.append(rng.choice(varianter))
    elif bday:
        afsnit.append(f"{navn} er født den {format_date(bday)}.")

    # ── Sætning 2: første klub ───────────────────────────────
    if klub:
        varianter = [
            f"{hans} første klub var {klub}.",
            f"{navn} startede sin fodboldkarriere i {klub}.",
            f"Karrieren begyndte i {klub}, inden {navn.split()[0]} fandt vej til landsholdet.",
        ]
        afsnit.append(rng.choice(varianter))

    # ── Sætning 3: debut ────────────────────────────────────
    debut_kamp = find_debut_kamp(dbu_id)
    if debut_kamp:
        mod      = debut_kamp.get("modstander") or ""
        kt       = kamptype_kort(debut_kamp.get("kamptype") or "")
        sted     = parse_sted(debut_kamp.get("sted") or "", mod)
        score_dk = debut_kamp.get("score_dk") or ""
        score_mod= debut_kamp.get("score_mod") or ""
        dato_rå  = debut_kamp.get("dato") or ""
        aar_m    = re.search(r'\b(\d{4})\b', dato_rå)
        aar      = aar_m.group(1) if aar_m else (str(min(years)) if years else "")

        mod_del  = f" mod {mod}" if mod else ""
        kt_del   = f" i en {kt}" if kt else ""
        sted_del = f" i {sted}" if sted else ""

        debut_varianter = [
            f"{han} debuterede for A-landsholdet i {aar}{kt_del}{mod_del}{sted_del}.",
            f"A-landsholdskarrieren tog sin begyndelse i {aar}{mod_del}{sted_del}.",
            f"I {aar} fik {navn.split()[0]} sin A-landsholdsdebut{mod_del}{sted_del}.",
        ]
        debut_s = rng.choice(debut_varianter)

        if score_dk and score_mod:
            dk_i = int(score_dk); mod_i = int(score_mod)
            resultat_varianter = {
                "vandt": [
                    f"En kamp som Danmark vandt {dk_i}-{mod_i}.",
                    f"Danmark sejrede {dk_i}-{mod_i}.",
                ],
                "tabte": [
                    f"En kamp som Danmark tabte {dk_i}-{mod_i}.",
                    f"Kampen endte med et dansk nederlag på {dk_i}-{mod_i}.",
                ],
                "uafgjort": [
                    f"Kampen endte {dk_i}-{dk_i}.",
                    f"Det blev uafgjort {dk_i}-{dk_i}.",
                ],
            }
            if dk_i > mod_i:   r = rng.choice(resultat_varianter["vandt"])
            elif dk_i < mod_i: r = rng.choice(resultat_varianter["tabte"])
            else:              r = rng.choice(resultat_varianter["uafgjort"])
            debut_s += " " + r

        afsnit.append(debut_s)

    # ── Sætning 4: kampe og mål ──────────────────────────────
    if kampe_n > 0:
        if maal_n >= 3:
            varianter = [
                f"{navn} har spillet {kampe_n} kampe og scoret {maal_n} mål for det danske A-landshold.",
                f"I alt optrådte {navn.split()[0]} i {kampe_n} A-landskampe og scorede {maal_n} mål.",
                f"Med {kampe_n} landskampe og {maal_n} mål har {navn} sat sit præg på dansk fodbold.",
            ]
        elif maal_n in (1, 2):
            varianter = [
                f"{navn} har spillet {kampe_n} kampe for det danske A-landshold og scoret {maal_n} mål.",
                f"I alt nåede {navn.split()[0]} at optræde i {kampe_n} A-landskampe.",
            ]
        else:
            varianter = [
                f"{navn} har spillet {kampe_n} kampe for det danske A-landshold.",
                f"I alt nåede {navn.split()[0]} at optræde i {kampe_n} A-landskampe.",
            ]
        afsnit.append(rng.choice(varianter))

    # ── Sætning 5: rangering mål (>10 mål) og kampe (≥100) ──
    kon_label = "kvindernes" if gender == "kvinde" else "herrernes"
    rang_dele = []

    def rang_maal(rank, total, snit_rank, snit):
        if rank == 1:
            t = rng.choice([
                f"den spiller med flest mål i {kon_label} landsholdshistorie",
                f"rekordindehaver for flest mål på {kon_label} landshold",
            ])
        elif rank <= 3:
            t = rng.choice([
                f"nr. {rank} på listen over flest mål i {kon_label} landsholdshistorie",
                f"den {rank}.-mest scorende spiller på {kon_label} landshold",
            ])
        else:
            t = f"nr. {rank} på listen over flest mål i {kon_label} landsholdshistorie"
        if snit_rank:
            t += rng.choice([
                f" og nr. {snit_rank} i bedste målsnit ({snit} mål pr. kamp)",
                f" med et målsnit på {snit} pr. kamp (nr. {snit_rank} historisk)",
            ])
        return t

    def rang_kampe(rank):
        if rank == 1:
            return rng.choice([
                f"den spiller med flest A-landskampe i {kon_label} landsholdshistorie",
                f"rekordindehaver for flest kampe på {kon_label} landshold",
            ])
        elif rank <= 3:
            return rng.choice([
                f"nr. {rank} på listen over flest A-landskampe for {kon_label} landshold",
                f"den {rank}.-mest spillede spiller på {kon_label} landshold",
            ])
        else:
            return f"nr. {rank} på listen over flest A-landskampe for {kon_label} landshold"

    if maal_n > 10:
        rank_g = p.get(f"_rank_goals_{gender}")
        rank_s = p.get(f"_rank_snit_{gender}")
        if rank_g:
            snit = str(round(maal_n / kampe_n, 2)).replace(".", ",") if kampe_n else "0"
            rang_dele.append(rang_maal(rank_g, None, rank_s, snit))

    if kampe_n >= 100:
        rank_k = p.get(f"_rank_kampe_{gender}")
        if rank_k:
            rang_dele.append(rang_kampe(rank_k))

    if rang_dele:
        intro = rng.choice([
            f"Det placerer {navn.split()[0]} som",
            f"Statistisk er {navn.split()[0]}",
            f"Dermed er {navn.split()[0]}",
        ])
        afsnit.append(intro + " " + " og ".join(rang_dele) + ".")

    return " ".join(afsnit) if afsnit else ""

def career_stats(dbu_id, player_name):
    """Returnerer {år: {kampe, mål, rolle}} sorteret."""
    roller = player_roles.get(str(dbu_id), {})
    startede  = roller.get("starter", [])
    indskiftet = roller.get("indskiftet", [])
    alle_mids  = startede + indskiftet

    # Matches per år
    kampe_per_year = defaultdict(lambda: {"starter": 0, "indskiftet": 0})
    for mid in startede:
        yr = match_lineups.get(mid, {}).get("år")
        if yr: kampe_per_year[yr]["starter"] += 1
    for mid in indskiftet:
        yr = match_lineups.get(mid, {}).get("år")
        if yr: kampe_per_year[yr]["indskiftet"] += 1

    # Mål per år
    maal = goals_per_year(player_name, alle_mids)

    # Saml
    alle_år = sorted(set(list(kampe_per_year.keys()) + list(maal.keys())))
    rows = []
    for år in alle_år:
        s = kampe_per_year[år]["starter"]
        i = kampe_per_year[år]["indskiftet"]
        g = maal.get(år, 0)
        rows.append({"år": år, "starter": s, "indskiftet": i, "mål": g, "total": s + i})
    return rows

def career_kurve(dbu_id, player_name):
    """Beregner de tre akkumulerede kurver (kampe, mål, slutrunder) fordelt på alder."""
    maaned_map_k = {"jan":1,"feb":2,"mar":3,"apr":4,"maj":5,"jun":6,
                    "jul":7,"aug":8,"sep":9,"okt":10,"nov":11,"dec":12}

    def parse_dato_k(s):
        m = re.search(r'(\d+)[.\s]+(\w+)[.\s]+(\d{4})', str(s or ""))
        if not m: return None
        mnd = maaned_map_k.get(m.group(2)[:3].lower(), 0)
        return (int(m.group(3)), mnd, int(m.group(1))) if mnd else None

    def parse_bday_k(s):
        m = re.match(r'(\d{2})-(\d{2})-(\d{4})', str(s or ""))
        return (int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None

    def alder_k(bday, dato):
        age = dato[0] - bday[0]
        if (dato[1], dato[2]) < (bday[1], bday[2]): age -= 1
        return age

    def name_matches_k(player_label, scorer_str):
        def norm_k(s):
            s = (s or "").lower().replace("æ","ae").replace("ø","oe").replace("å","aa")
            s = unicodedata.normalize("NFD", s)
            return "".join(c for c in s if unicodedata.category(c) != "Mn")
        scorer_clean = " ".join(re.sub(r'["""][^""""]+["""]', "", scorer_str).split())
        pn = norm_k(player_label).split()
        sn = norm_k(scorer_clean)
        if len(pn) == 1: return pn[0] in sn
        for i in range(len(pn)):
            for j in range(i+2, len(pn)+1):
                if " ".join(pn[i:j]) in sn: return True
        if len(pn) >= 3 and pn[0] + " " + pn[-1] in sn: return True
        return False

    from collections import defaultdict

    pid = str(dbu_id)
    roller = player_roles.get(pid, {})
    alle_mids = roller.get("starter",[]) + roller.get("indskiftet",[])

    p_data = next((p for p in players if str(p.get("dbuID","")) == pid), None)
    if not p_data: return None
    bday = parse_bday_k(p_data.get("birthday_dbu"))
    if not bday or not alle_mids: return None

    kampe_pr_alder = defaultdict(int)
    maal_pr_alder  = defaultdict(int)
    slutrunder_set = set()
    slutrunde_pr_alder = defaultdict(set)

    EM_VM = {"EM-slutrunde", "VM-slutrunde"}

    for mid in alle_mids:
        kamp = kamp_by_id.get(mid)
        if not kamp: continue
        dato = parse_dato_k(kamp.get("dato"))
        if not dato: continue
        age = alder_k(bday, dato)
        if not (15 <= age <= 45): continue

        kampe_pr_alder[age] += 1

        for sc in (kamp.get("scoringer") or []):
            if name_matches_k(player_name, sc.get("spiller","")):
                maal_pr_alder[age] += 1

        kt = kamp.get("kamptype","")
        if any(t in kt for t in EM_VM):
            yr = dato[0]
            sl_key = f"{yr}_{kt}"
            if sl_key not in slutrunder_set:
                slutrunder_set.add(sl_key)
                slutrunde_pr_alder[age].add(sl_key)

    if not kampe_pr_alder: return None

    ages = range(15, 46)
    kurve    = list(itertools.accumulate([kampe_pr_alder.get(a,0) for a in ages]))
    kurve_m  = list(itertools.accumulate([maal_pr_alder.get(a,0) for a in ages]))
    kurve_sl = list(itertools.accumulate([len(slutrunde_pr_alder.get(a,set())) for a in ages]))

    # Trim til sidste aktive alder
    def trim(k):
        last = 0
        for i in range(1,len(k)):
            if k[i] > k[i-1]: last = i
        return k[:last+1]

    return {
        "kurve":    trim(kurve),
        "kurve_m":  trim(kurve_m),
        "kurve_sl": trim(kurve_sl),
    }


# ── HTML-generator ────────────────────────────────────────────
def render_page(p):
    navn       = p.get("playerLabel") or ""
    dbu_id     = str(p.get("dbuID") or "")
    kampe_n    = p.get("n_matches") or "0"
    maal_n     = p.get("n_goals") or "0"
    klub       = p.get("klubnavn") or ""
    fødested   = p.get("birthPlaceLabel") or ""
    bday       = p.get("birthday_dbu") or ""
    gender     = "Kvinde" if p.get("gender") == "kvinde" else "Mand"
    region     = p.get("region") or ""
    wiki_da    = p.get("wikipediaURL_da") or ""
    wiki_en    = p.get("wikipediaURL_en") or ""
    image      = p.get("image") or ""
    all_clubs  = p.get("allClubs") or []
    years      = p.get("years_played") or []
    debut_år   = min(years) if years else None
    slug       = f"{slugify(navn)}-{dbu_id}"
    dbu_url    = f"https://www.dbu.dk/landshold/landsholdsdatabasen/PlayerInfo/{dbu_id}"

    # Karrieretabel
    stats = career_stats(dbu_id, navn)
    kurve_data = career_kurve(dbu_id, navn)

    kurve_html_parts = []
    if kurve_data:
        k_json  = json.dumps(kurve_data["kurve"])
        km_json = json.dumps(kurve_data["kurve_m"])
        ksl_json = json.dumps(kurve_data["kurve_sl"])
        has_maal  = kurve_data["kurve_m"][-1] > 0 if kurve_data["kurve_m"] else False
        has_sl    = kurve_data["kurve_sl"][-1] > 0 if kurve_data["kurve_sl"] else False
        karrierekurve_html = f"""<div class="card">
    <h2>Karrierekurve</h2>
    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
      <button class="kk-btn active" onclick="kkMode(\'kampe\',this)">Kampe</button>
      {"<button class=\"kk-btn\" onclick=\"kkMode(\'maal\',this)\">Mål</button>" if has_maal else ""}
      {"<button class=\"kk-btn\" onclick=\"kkMode(\'slutrunder\',this)\">EM/VM-slutrunder</button>" if has_sl else ""}
    </div>
    <canvas id="kk-canvas" style="width:100%;border-radius:6px;cursor:default"></canvas>
    <p style="font-size:12px;color:#999;margin-top:8px;text-align:center">
      Alder → akkumuleret antal <span id="kk-label">kampe</span>
      · <a href="/landsholdskurven/" style="color:#C8102E">Se alle spillere</a>
    </p>
    <script>
    (function(){{
      const KURVE    = {k_json};
      const KURVE_M  = {km_json};
      const KURVE_SL = {ksl_json};
      const RED = '#C8102E';
      let mode = 'kampe';
      const canvas = document.getElementById('kk-canvas');
      const ctx = canvas.getContext('2d');

      function getKurve() {{
        if (mode === 'maal')       return KURVE_M;
        if (mode === 'slutrunder') return KURVE_SL;
        return KURVE;
      }}
      function yLabel() {{
        if (mode === 'maal')       return 'mål';
        if (mode === 'slutrunder') return 'slutrunder';
        return 'kampe';
      }}

      function draw() {{
        const dpr = window.devicePixelRatio || 1;
        const cs = window.getComputedStyle(canvas.parentElement);
        const W = canvas.parentElement.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const H = Math.round(W * 0.38);
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        canvas.style.height = H + 'px';
        ctx.scale(dpr, dpr);

        const PAD = {{top:16, right:16, bottom:32, left:38}};
        const cW = W - PAD.left - PAD.right;
        const cH = H - PAD.top  - PAD.bottom;
        const kurve = getKurve();
        if (!kurve.length) return;

        const maxY = Math.max(...kurve, 1);
        const startAge = 15;

        function xOf(i) {{ return PAD.left + i / (kurve.length - 1 || 1) * cW; }}
        function yOf(v)  {{ return PAD.top  + cH - (v / maxY) * cH; }}

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

        // Grid
        const step = Math.ceil(maxY / 5);
        ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
        for (let v = 0; v <= maxY; v += step) {{
          const y = yOf(v);
          ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
          ctx.fillStyle = '#bbb'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'right';
          ctx.fillText(v, PAD.left - 4, y + 3);
        }}

        // X-labels (alder)
        ctx.fillStyle = '#bbb'; ctx.textAlign = 'center'; ctx.font = '10px Inter,sans-serif';
        for (let i = 0; i < kurve.length; i++) {{
          const age = startAge + i;
          if (age % 5 === 0) ctx.fillText(age, xOf(i), H - PAD.bottom + 12);
        }}

        // Kurve
        ctx.beginPath(); ctx.strokeStyle = RED; ctx.lineWidth = 2.5;
        kurve.forEach((v, i) => {{
          const x = xOf(i), y = yOf(v);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }});
        ctx.stroke();

        // Slutpunkt
        const lastX = xOf(kurve.length - 1);
        const lastY = yOf(kurve[kurve.length - 1]);
        ctx.beginPath(); ctx.fillStyle = RED;
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2); ctx.fill();

        document.getElementById('kk-label').textContent = yLabel();
      }}

      window.kkMode = function(m, btn) {{
        mode = m;
        document.querySelectorAll('.kk-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        draw();
      }};

      window.addEventListener('resize', draw);
      draw();
    }})();
    </script>
  </div>"""
    else:
        karrierekurve_html = ""


    # Fix 6: Rigere title med stats
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

    # JSON-LD
    ld = {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": navn,
        "description": description,
        "url": f"https://landsholdskortet.dk/spiller/{slug}/",
    }
    if wiki_da: ld["sameAs"] = wiki_da
    elif wiki_en: ld["sameAs"] = wiki_en
    if bday: ld["birthDate"] = bday
    if fødested: ld["birthPlace"] = {"@type": "Place", "name": fødested}
    if image: ld["image"] = image
    ld_json = json.dumps(ld, ensure_ascii=False, indent=2)

    # Fix 5: Breadcrumb JSON-LD
    breadcrumb_ld = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Landsholdskortet", "item": "https://landsholdskortet.dk/"},
            {"@type": "ListItem", "position": 2, "name": navn, "item": f"https://landsholdskortet.dk/spiller/{slug}/"},
        ]
    }
    breadcrumb_json = json.dumps(breadcrumb_ld, ensure_ascii=False, indent=2)

    # Kortdata til Leaflet
    map_clubs = []
    for cl in all_clubs:
        lat = cl.get("latitude")
        lng = cl.get("longitude")
        if lat and lng:
            map_clubs.append({
                "navn":       cl.get("klubnavn") or "",
                "lat":        float(lat),
                "lng":        float(lng),
                "barndom":    bool(cl.get("is_earliest")),
                "logo":       cl.get("klub_logo") or "",
            })
    # Tilføj fødested-marker hvis koordinater findes
    birth_marker = None
    if p.get("lat") and p.get("lon"):
        try:
            birth_marker = {"lat": float(p["lat"]), "lng": float(p["lon"]), "navn": fødested}
        except: pass

    map_clubs_json   = json.dumps(map_clubs, ensure_ascii=False)
    birth_marker_json = json.dumps(birth_marker, ensure_ascii=False)

    # Karrieretabel HTML — vis alle år fra debut til sidste kamp, "-" for år uden kampe
    career_rows = ""
    total_kampe = 0
    total_maal  = 0
    if stats:
        stats_by_year = {r["år"]: r for r in stats}
        debut  = min(r["år"] for r in stats)
        sidste = max(r["år"] for r in stats)
        for år in range(debut, sidste + 1):
            r = stats_by_year.get(år)
            if r:
                rolle = "Starter" if r["starter"] > 0 and r["indskiftet"] == 0 else \
                        "Indskiftet" if r["starter"] == 0 else "Starter + ind"
                total_kampe += r["total"]
                total_maal  += r["mål"]
                career_rows += (
                    f"<tr><td>{år}</td>"
                    f"<td>{r['total']}</td>"
                    f"<td>{r['mål'] or '–'}</td>"
                    f"<td style='color:#888;font-size:13px'>{rolle}</td></tr>\n"
                )
            else:
                career_rows += (
                    f"<tr style='color:#bbb'><td>{år}</td>"
                    f"<td>–</td><td>–</td><td></td></tr>\n"
                )
        # I alt-række
        career_rows += (
            f"<tr style='font-weight:600;border-top:2px solid #ddd'>"
            f"<td>I alt</td><td>{total_kampe}</td>"
            f"<td>{total_maal or '–'}</td><td></td></tr>\n"
        )

    wiki_links = ""
    if wiki_da: wiki_links += f'<a href="{wiki_da}" rel="noopener" target="_blank">Wikipedia (dansk)</a>'
    if wiki_en: wiki_links += (" · " if wiki_da else "") + f'<a href="{wiki_en}" rel="noopener" target="_blank">Wikipedia (engelsk)</a>'

    img_html = (
        f'<img src="{image}" alt="{navn}" class="player-img" onerror="this.style.display=\'none\'">'
        if image else ""
    )

    debut_html  = f'<div class="stat"><div class="stat-n">{debut_år}</div><div class="stat-l">Debut</div></div>' if debut_år else ""
    bio_tekst   = generer_tekst(p)

    def _interne_links_sektion(kandidater, nuværende_id, titel, kort_link, kort_label):
        andre = [q for q in kandidater if str(q.get("dbuID") or "") != nuværende_id and q.get("playerLabel")]
        andre.sort(key=lambda q: -int(q.get("n_matches") or 0))
        andre = andre[:6]
        if not andre:
            return ""
        links = "".join(
            f'<a href="/spiller/{slugify(q["playerLabel"])}-{q["dbuID"]}/" '
            f'style="display:inline-block;padding:6px 12px;background:#f5f5f5;border-radius:6px;font-size:13px;color:#1a1a1a;text-decoration:none;white-space:nowrap">'
            f'{q["playerLabel"]}</a>'
            for q in andre
        )
        return (
            f'<div class="card" style="margin-top:20px">'
            f'<h2>{titel}</h2>'
            f'<div style="display:flex;flex-wrap:wrap;gap:8px">{links}</div>'
            f'<a href="{kort_link}" style="display:inline-block;margin-top:14px;font-size:13px;color:#c0392b">{kort_label} →</a>'
            f'</div>'
        )

    interne_links_html = ""
    if fødested:
        interne_links_html += _interne_links_sektion(
            BIRTH_INDEX.get(fødested, []), dbu_id,
            f"Andre født i {fødested}",
            f"/?q={fødested}", "Se på kortet"
        )
    if klub:
        interne_links_html += _interne_links_sektion(
            KLUB_INDEX.get(klub, []), dbu_id,
            f"Andre fra {klub}",
            f"/?q={klub}", "Se alle på kortet"
        )

    return f"""<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{description}">
  <meta name="robots" content="index, follow">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="https://landsholdskortet.dk/spiller/{slug}/">
  {'<meta property="og:image" content="' + image + '">' if image else '<meta property="og:image" content="https://landsholdskortet.dk/og-image.png">'}
  <link rel="canonical" href="https://landsholdskortet.dk/spiller/{slug}/">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
  <script type="application/ld+json">
{ld_json}
  </script>
  <script type="application/ld+json">
{breadcrumb_json}
  </script>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f4f4; color: #1a1a1a; }}
    a {{ color: #c0392b; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}

    .topbar {{ background: #c0392b; padding: 12px 20px; display: flex; align-items: center; gap: 12px; }}
    .topbar a {{ color: #fff; font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 6px; }}
    .topbar a svg {{ flex-shrink: 0; }}

    .page {{ max-width: 960px; margin: 0 auto; padding: 24px 16px 60px; }}

    .hero {{ display: flex; gap: 20px; align-items: flex-start; margin-bottom: 24px; }}
    .player-img {{ width: 100px; height: 120px; object-fit: cover; border-radius: 8px; flex-shrink: 0; background: #eee; }}
    .hero-info h1 {{ font-size: 28px; margin-bottom: 6px; }}
    .hero-meta {{ color: #666; font-size: 14px; margin-bottom: 14px; }}

    .stats {{ display: flex; gap: 12px; flex-wrap: wrap; }}
    .stat {{ background: #fff; border-radius: 8px; padding: 12px 18px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,.07); min-width: 80px; }}
    .stat-n {{ font-size: 24px; font-weight: 700; color: #c0392b; }}
    .stat-l {{ font-size: 11px; color: #888; margin-top: 3px; text-transform: uppercase; letter-spacing: .4px; }}

    #player-map {{ height: 340px; border-radius: 10px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,.1); }}

    .two-col {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
    @media (max-width: 600px) {{ .two-col {{ grid-template-columns: 1fr; }} .hero {{ flex-direction: column; }} }}

    .card {{ background: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,.07); }}
    .card h2 {{ font-size: 15px; color: #444; margin-bottom: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th {{ text-align: left; color: #999; font-weight: 500; font-size: 12px; padding: 4px 0 8px; border-bottom: 1px solid #eee; text-transform: uppercase; letter-spacing: .4px; }}
    td {{ padding: 8px 0; border-bottom: 1px solid #f5f5f5; }}
    tr:last-child td {{ border-bottom: none; }}

    .links {{ margin-top: 20px; font-size: 14px; display: flex; flex-wrap: wrap; gap: 12px; }}
    .btn-map {{ display: inline-flex; align-items: center; gap: 6px; margin-top: 20px; padding: 10px 20px; background: #c0392b; color: #fff !important; border-radius: 8px; font-weight: 600; font-size: 14px; }}
    .btn-map:hover {{ background: #a93226; text-decoration: none; }}
    .kk-btn {{ padding: 5px 12px; border-radius: 20px; border: 1px solid #ddd; background: #fff; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit; color: #555; transition: all .15s; }}
    .kk-btn.active {{ background: #C8102E; color: #fff; border-color: #C8102E; }}
    .kk-btn:hover:not(.active) {{ border-color: #C8102E; color: #C8102E; }}
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

  <!-- Hero -->
  <div class="hero">
    {img_html}
    <div class="hero-info">
      <h1>{navn}</h1>
      <div class="hero-meta">{gender}{(" · " + region) if region else ""}{(" · Født: " + fødested) if fødested else ""}{(" · " + bday) if bday else ""}</div>
      <div class="stats">
        {debut_html}
        <div class="stat"><div class="stat-n">{kampe_n}</div><div class="stat-l">Kampe</div></div>
        <div class="stat"><div class="stat-n">{maal_n}</div><div class="stat-l">Mål</div></div>
      </div>
    </div>
  </div>

  <!-- Kort -->
  <div id="player-map"></div>

  <!-- Bio-tekst -->
  {f'<p style="background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.07);margin-bottom:20px;font-size:15px;line-height:1.65;color:#333">{bio_tekst}</p>' if bio_tekst else ""}

  <!-- Landsholdskarriere -->
  <div class="card">
    <h2>Landsholdskarriere</h2>
    {"<table><thead><tr><th>År</th><th>Kampe</th><th>Mål</th><th>Rolle</th></tr></thead><tbody>" + career_rows + "</tbody></table>"
      if career_rows else "<p style='color:#999;font-size:14px'>Ingen kampdata fundet.</p>"}
    <div class="links" style="margin-top:16px">
      {wiki_links}
      {"· " if wiki_links else ""}<a href="{dbu_url}" rel="noopener" target="_blank">DBU-profil</a>
    </div>
  </div>

  {karrierekurve_html}

  {interne_links_html}

  <div class="card" style="margin-top:20px">
    <a href="/?q={navn}" class="btn-map">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="white" stroke-width="2"/><circle cx="10" cy="10" r="3" fill="white"/></svg>
      Se på kortet
    </a>
  </div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
const clubs = {map_clubs_json};
const birthMarker = {birth_marker_json};

const map = L.map('player-map', {{ zoomControl: true }});
L.tileLayer('https://{{s}}.basemaps.cartocdn.com/light_all/{{z}}/{{x}}/{{y}}{{r}}.png', {{
  attribution: '© OpenStreetMap © CARTO', maxZoom: 18
}}).addTo(map);

const bounds = [];

// Fødested
if (birthMarker) {{
  const m = L.circleMarker([birthMarker.lat, birthMarker.lng], {{
    radius: 7, color: '#2C3E50', fillColor: '#2C3E50', fillOpacity: 0.85, weight: 2
  }}).addTo(map);
  m.bindPopup(`<strong>Fødested</strong><br>${{birthMarker.navn}}`);
  bounds.push([birthMarker.lat, birthMarker.lng]);
}}

// Klubber
clubs.forEach(cl => {{
  const isBarndom = cl.barndom;
  const color = isBarndom ? '#C0392B' : '#7F8C8D';
  const r = isBarndom ? 10 : 7;

  let icon;
  const logoSrc = cl.logo
    ? (cl.logo.startsWith('logos/') ? '/' + cl.logo : cl.logo)
    : null;
  if (logoSrc) {{
    icon = L.divIcon({{
      html: `<div style="width:${{r*2}}px;height:${{r*2}}px;border-radius:50%;border:2px solid ${{color}};overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center">
               <img src="${{logoSrc}}" style="width:100%;height:100%;object-fit:contain" onerror="this.parentElement.style.background='${{color}}'">
             </div>`,
      className: '',
      iconSize: [r*2, r*2],
      iconAnchor: [r, r]
    }});
  }} else {{
    icon = L.divIcon({{
      html: `<div style="width:${{r*2}}px;height:${{r*2}}px;border-radius:50%;background:${{color}};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
      className: '',
      iconSize: [r*2, r*2],
      iconAnchor: [r, r]
    }});
  }}

  const marker = L.marker([cl.lat, cl.lng], {{ icon }}).addTo(map);
  marker.bindPopup(`<strong>${{cl.navn}}</strong>${{isBarndom ? '<br><em>Barndomsklub</em>' : ''}}`);
  bounds.push([cl.lat, cl.lng]);
}});

if (bounds.length > 0) {{
  map.fitBounds(bounds, {{ padding: [30, 30], maxZoom: 13 }});
}} else {{
  map.setView([56.0, 10.5], 6);
}}
</script>
</body>
</html>"""

# ── Generér filer ─────────────────────────────────────────────
out_dir = "spiller"
generated = 0

for p in players:
    navn   = p.get("playerLabel") or ""
    dbu_id = p.get("dbuID") or ""
    if not navn or not dbu_id:
        continue

    slug  = f"{slugify(navn)}-{dbu_id}"
    dir_  = os.path.join(out_dir, slug)
    os.makedirs(dir_, exist_ok=True)

    html = render_page(p)
    with open(os.path.join(dir_, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)
    generated += 1
    if generated % 100 == 0:
        print(f"  {generated}/1144...")

print(f"\nGenereret {generated} spillersider i /{out_dir}/")

# ── Opdatér sitemap.xml ───────────────────────────────────────
from datetime import date
today = date.today().isoformat()
urls = ['  <url>\n    <loc>https://landsholdskortet.dk/</loc>\n'
        f'    <lastmod>{today}</lastmod>\n    <changefreq>monthly</changefreq>\n'
        '    <priority>1.0</priority>\n  </url>']

for static_path, prio in [("/rekordlister/", "0.9"), ("/landsholdskurven/", "0.9"), ("/toplister/", "0.7")]:
    urls.append(
        f'  <url>\n    <loc>https://landsholdskortet.dk{static_path}</loc>\n'
        f'    <lastmod>{today}</lastmod>\n    <changefreq>monthly</changefreq>\n'
        f'    <priority>{prio}</priority>\n  </url>'
    )

for p in players:
    navn   = p.get("playerLabel") or ""
    dbu_id = p.get("dbuID") or ""
    if not navn or not dbu_id: continue
    slug = f"{slugify(navn)}-{dbu_id}"
    urls.append(
        f'  <url>\n    <loc>https://landsholdskortet.dk/spiller/{slug}/</loc>\n'
        f'    <lastmod>{today}</lastmod>\n    <changefreq>monthly</changefreq>\n'
        '    <priority>0.8</priority>\n  </url>'
    )

# Tilføj klub- og bysider hvis de er genereret
import os as _os
for slug_file, path_prefix, prio in [("_klub_slugs.json", "/klub/", "0.8"), ("_by_slugs.json", "/by/", "0.8")]:
    if _os.path.exists(slug_file):
        import json as _json
        with open(slug_file) as sf:
            for slug in _json.load(sf):
                urls.append(
                    f'  <url>\n    <loc>https://landsholdskortet.dk{path_prefix}{slug}/</loc>\n'
                    f'    <lastmod>{today}</lastmod>\n    <changefreq>monthly</changefreq>\n'
                    f'    <priority>{prio}</priority>\n  </url>'
                )

sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
sitemap += "\n".join(urls) + "\n</urlset>\n"

with open("sitemap.xml", "w", encoding="utf-8") as f:
    f.write(sitemap)
print(f"sitemap.xml opdateret ({len(urls)} URLs, lastmod: {today})")
