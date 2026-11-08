# Mobil-audit af landsholdskortet.dk

> **Metode-opdatering:** Analysen startede som ren kode-læsning, men Playwright
> er nu installeret i projektet (`@playwright/test` + Chromium,
> `tools/screenshot.js` og `tools/audit-screenshots.js`), og 46 screenshots er
> kørt igennem på 360×640, 390×844, 414×896 og 768×1024 (portræt + landskab),
> inkl. filterpanel åbent, manglende-data-modal, Om-modal, marker-popup, og
> undersiderne Kurven/Quiz/Rekorder. Fund markeret **[visuelt bekræftet]**
> nedenfor er set direkte i screenshots (gemt i `screenshots/`, ikke pushet —
> se `.gitignore`). Fund uden den markering er stadig kun kode-baserede
> (fx Lighthouse-målinger, som der ikke er kørt).

## Status & beslutninger

**Fase 1 (quick wins) er implementeret og committed**, ét commit pr. fund,
desktop uændret visuelt (verificeret med `tools/desktop-shot.js` ved
1440×900 før/efter — se "Trin 2" nedenfor). **Én undtagelse (#6) er bevidst
sprunget over** og venter på svar, fordi den påvirker desktop — se note under
tabellen.

| Commit | Fund |
|---|---|
| `a093d71ce` | #1 — 16px font-size på mobil-inputs/selects |
| `f38d06135` | #2 — `.info-tooltip` klik/tap-support |
| `70f4b043b` | #4 — popup-loft 25 + "Vis alle (N)" + filter |
| `240ce2c3d` | #9 — 44px touch-mål (Kurven/Quiz/Rekordlister) |
| `5aa01b9e9` | #11 — aria-dialog + Escape-luk på modaler |
| `cff962a82` | #23 — logo-indikator skjules bag åbent filterpanel |
| `e05875186` | #24 — attribution flyttet væk fra zoom-knap i kort landskab |
| `da0ce9371` | theme-color (#C8102E, `/worldmap/` får #1B3A6B) |
| `85f9e9a1b` | #21 — slettet `/app.js` + `/style.css` (grep-verificeret ubrugte) |

### Dine beslutninger (for de kommende faser)

1. **Manglende-data-tabel:** CSS-baseret kort-visning på mobil (samme
   `<table>`, `display:block` + `data-label`) — Fase 5.
2. **Navigation:** Permanent menu-ikon i `mobile-search-bar` — Fase 4.
3. **Popup-cap:** ✅ Implementeret i Fase 1 — 25 synlige + "Vis alle (N)" der
   udvider bundpanelet til fuld højde med filterfelt øverst.
4. **Fælles CSS:** `css/shared.css` til undersiderne (Kurven/Quiz/Rekordlister)
   med fælles breakpoints 480/768/1024 + `max-height:500px` — Fase 6.
5. **PWA:** ✅ Kun `theme-color` nu (#C8102E, blå på worldmap) — resten af PWA
   (manifest m.m.) ikke med i denne omgang.
6. **Markør-overlap:** Clustering med logoer via den vendorede MarkerCluster —
   hvert klynge-ikon viser logoet for klubben med flest spillere i klyngen +
   et "+N"-badge. `setView(...,7)` erstattes af `fitBounds` til Danmark —
   Fase 2.

### Ny faseplan

1. **Fase 1 (done):** quick wins #1, #2, #4, #6\*, #9, #11, #21, #23, #24 + theme-color.
2. **Fase 2:** #22 — logo-clustering + `fitBounds`.
3. **Fase 3:** viewport — #5, #15, #16, #18.
4. **Fase 4:** filterpanel + navigation — #7, #10, #8/forslag B.
5. **Fase 5:** tabellen — forslag A (kort-visning).
6. **Fase 6:** undersider + `css/shared.css` — #13, #14, #25, #26.

\* #6 er trukket ud af Fase 1, se nedenfor.

### #6 afventer svar — påvirker desktop

**#6** (loading-feedback mens `players.json` hentes) blev **ikke** implementeret
i denne omgang. Årsag: `.loading-overlay` ville vises ved *hvert* sidebesøg,
uanset enhed — det er ikke mobil-scopet i sin natur (ingen media query kan
afgrænse det, det er en engangs-tilstand ved load). At tilføje den ville give
alle desktop-besøgende en ny, kortvarig hvid loading-skærm med spinner, som
ikke findes i dag. Det er formentlig en lille, positiv UX-ændring for begge
platforme, men det **er** en visuel ændring af desktop, så jeg har stoppet op
i stedet for at antage. Se spørgsmål i "Åbne spørgsmål til dig" nedenfor.

Sitet har allerede investeret seriøst i mobil: der er en bottom-sheet-sidebar
med drag-handle, en separat mobil-søgebjælke, en dedikeret mobil popup-panel
(i stedet for Leaflet-popups), 44px-markører, og touch-target-forstørrelse af
slidere og knapper ved 768px. Det er et godt fundament — men det er bygget på
**ét eneste breakpoint (768px)** og **`window.innerWidth`-tjek i JavaScript**
i stedet for en mobil-first strategi, og det efterlader en række konkrete huller:

1. **[Visuelt bekræftet] Markør-overlap på kortet er det reelt største problem.**
   Ved standard-zoom (hele Danmark) ligger 300-800 klublogoer oven i hinanden i
   et uigennemtrængeligt lag på alle fire mobilstørrelser — intet af det er
   læsbart før man zoomer massivt ind. Dette blev ikke fanget ved kode-læsning
   alene, men er tydeligt på hvert eneste screenshot af forsiden.
2. **[Visuelt bekræftet] Den flydende "Indlæser logoer…"-boble lægger sig oven i
   filterpanelets slidere**, når panelet er åbnet — den er positioneret ift.
   bottomsheet-*peek*-højden, ikke den åbne højde, så den ender midt i
   "Kampår"/"Antal kampe"-kontrollerne.
3. **[Visuelt bekræftet] Zoom-knappen "−" kan blive skjult af attributionsboksen**
   i liggende format på korte skærme (640×360) — de to Leaflet-kontroller
   støder sammen.
4. **"Vis spillere med manglende data"-tabellen (8 kolonner)** har slet ingen
   mobil-tilpasning — **[visuelt bekræftet]** kun 3-4 af 8 kolonner er synlige,
   resten er usynlige uden nogen visuel antydning af at der er mere at scrolle til.
5. **`100vh` bruges 5 steder** uden `dvh`/`svh`-fallback, kombineret med
   `overflow: hidden` på `html, body` — på mobil Safari/Chrome, hvor
   adresselinjen skifter højde, kan det klippe indhold af i bunden.
6. **Flere inputs/selects har `font-size` under 16px** (13–15px), hvilket
   trigger iOS' automatiske zoom ved fokus — et konkret, let-at-rette problem.
7. **`.info-tooltip` (forklaringen af "Barndomsklub") virker kun med `:hover`**
   — helt utilgængelig på touch, både i sidebaren og i den manglende-data-tabel.
8. **[Visuelt bekræftet] Kurvens "X-AKSE"/"Y-AKSE"-labels hægter sig på den
   forkerte knaprække**, når kontrolpanelet knækker om på smal skærm — og selve
   grafen (fast 420px høj) bliver i liggende format skubbet det meste ud af
   skærmen.
9. **[Visuelt bekræftet] De vandrette fane-rækker på Quiz og Rekordlister**
   ("Gæt spilleren / Højere eller lavere / …" og "Flest mål / Flest kampe / …")
   bliver afskåret i højre side uden skygge/pil der antyder at der er flere
   faner at scrolle til.
10. **Ingen `prefers-reduced-motion`, ingen `safe-area-inset`, ingen PWA-manifest.**
11. Mobil-popuppen **hard-capper spillerlisten ved 10** (fx København med 258
    spillere) uden "vis flere" — data går tabt, ikke bare layout.

Til gengæld er to ting **[visuelt bekræftet] allerede i orden**: selve
marker-popup'en (bundpanel ved tryk på én klub) ser ren og læsbar ud, og
Rekordlister-tabellen er allerede tilpasset mobil med kun de vigtigste
kolonner synlige — et godt forbillede for punkt 4.

Samlet vurdering: fundamentet er solidt, men der mangler en konsekvent mobil
tilgang (flere breakpoints, `dvh`, touch-first inputs), og de to største
problemer er nu markør-kaos'et på selve kortet og 8-kolonne-tabellen — begge
visuelt bekræftet, ikke kun teoretiske.

## Trin 1 — Stack og filstruktur

- **Ingen build-proces.** Rent statisk HTML/CSS/JS, ingen `package.json`,
  ingen bundler. `index.html` loader `css/style.css` og `js/app.js` direkte.
- **Kortbibliotek:** Leaflet 1.9.x, selv-hostet (`js/vendor/leaflet.js`,
  `css/vendor/leaflet.css`), ingen MarkerCluster på forsiden (kun på
  `/worldmap/`, som bruger `css/vendor/MarkerCluster*.css`).
- **Data:** `data/players.json` (1,9 MB), hentet i `loadData()`
  (`js/app.js:397-401`) sammen med `data/klub_slugs.json`. `data/kommuner.geojson`
  (864 KB) og `data/regioner.geojson` (516 KB) hentes **lazy** — først når
  bruger vælger kommune/region-niveau (`js/app.js:387,393`). Det er allerede
  en god performance-beslutning.
- **Billeder:** `logos/` (32 MB i alt) lazy-loades pr. synligt kortudsnit via
  `upgradeVisibleLogos()` (`js/app.js:666-691`, kaldt på `moveend zoomend`,
  `js/app.js:75`) — også en god eksisterende optimering.
- **Vigtige filer:**
  - `index.html` — hele forside-markup (sidebar, modaler, kort).
  - `css/style.css` (1556 linjer) — al styling, inkl. mobil-regler.
  - `js/app.js` (1585 linjer) — kort-init, filterlogik, tabel/popup-rendering.
  - `landsholdskurven/index.html`, `quiz/index.html`, `rekordlister/index.html`
    — selvstændige statiske sider, hver med egen inline `<style>`, ingen delt
    CSS med forsiden (gentager `.gf-btn`, `.period-select` osv. tre gange).
- **OBS:** Der ligger forældede duplikater `/app.js` og `/style.css` i roden
  (ikke dem der bruges — `index.html` linker til `js/app.js`/`css/style.css`).
  Ikke et mobil-problem i sig selv, men værd at rydde op i.

### Media queries fundet

| Fil | Linje | Breakpoint |
|---|---|---|
| `css/style.css` | 854 | `max-width: 768px` (hoved-mobil-blok) |
| `css/style.css` | 1326 | `max-width: 768px` (Leaflet-kontroller) |
| `css/style.css` | 1495 | `max-width: 768px` (mobil popup-wrapper) |
| `css/style.css` | 1508 | `max-width: 768px` (skjul Leaflet-popup) |
| `css/style.css` | 1527 | `max-width: 400px` (mindre skrift i `.top-table`) |
| `css/style.css` | 1535 | `max-width: 768px` (mobil filter-toggle) |
| `quiz/index.html` | 126 | `max-width: 480px` (quiz-options bliver 1 kolonne) |

**Der er ingen breakpoint for tablet/landscape (f.eks. 1024px) og ingen for
meget smalle skærme (under 360px) ud over den ene 400px-regel.** Alt fra
769px og op til desktop behandles identisk — en iPad i portrait (768px bredde,
grænsetilfælde) rammer mobil-layoutet, en iPad i landscape (1024px) rammer
desktop-layoutet med fuld 360px-sidebar, som ikke er testet for det tilfælde.

## Trin 2 — Visuel test

**Udført** med Playwright/Chromium (`tools/audit-screenshots.js`) på 360×640,
390×844, 414×896 og 768×1024, portræt + landskab, for: forside (default),
filterpanel åbent, manglende-data-modal, Om-modal, marker-popup, samt
Kurven/Quiz/Rekordlister ved 390×844. 46 filer i alt, gemt i `screenshots/`
(ikke pushet, se `.gitignore`). De væsentligste observationer:

- **Markør-overlap** (se resumé #1) er synligt på *alle* størrelser og
  orienteringer ved standard-zoom — det er ikke et touch-/layout-problem i
  snæver forstand, men det første brugeren ser, og det er langt værre på en
  lille skærm, hvor der ikke er plads til at sprede sig eller zoome ind uden
  selv at skulle styre det.
- **`02-sidebar-open`**: på både 360×640 og 390×844 lægger
  "Indlæser logoer…"-indikatoren sig direkte oven i "Kampår"- og
  "Antal kampe"-sliderne, når panelet er åbnet (ikke kun i peek-tilstand).
- **`01-home-default` landskab (360×640, dvs. 640×360)**: Leaflet-attributionen
  ("Leaflet | © OpenStreetMap contributors") overlapper zoom-kontrollens
  "−"-knap, fordi `.leaflet-top.leaflet-right{top:76px}` og
  `.leaflet-bottom.leaflet-right{bottom:calc(peek+4px)}` begge presses ind mod
  midten på en kun 360px høj viewport.
- **`03-missing-modal`**: ved 360×640 er kun 3 af 8 kolonner synlige (Navn,
  Fødested, Barndomsklub) — Wikipedia, DBU ID, Køn, Kampe og Mål er helt
  usynlige uden nogen scroll-hint. Ved 390×844 er det 4 af 8.
- **`04-om-modal`**: ingen problemer fundet — tekst, linjelængde og
  luk-knap fungerer fint på alle testede størrelser.
- **`05-marker-popup`** (gentestet separat, se `tools/popup-shot.js`):
  bundpanelet med klub + spillerliste ser rent og læsbart ud — ingen nye fund.
- **`06-landsholdskurven`**: `X-AKSE`/`Y-AKSE`-labels ender visuelt på den
  forkerte række efter flex-wrap (fx "Y-AKSE" vises for enden af
  Alder/Kampe/Årstal-rækken i stedet for foran Kampe/Mål/EM-VM-rækken). I
  landskab (844×390) fylder kontrolpanel + header så meget at kun toppen af
  den 420px høje graf er synlig — resten kræver scroll.
- **`06-quiz`** og **`06-rekordlister`**: begge har en vandret fane-linje der
  klipper sidste fane af (hhv. "Gæt resultat…" og "Se…") uden visuel
  antydning af at man kan swipe til flere faner.
- **`01-home-default` 768×1024 portræt vs. landskab**: bekræfter at 768px
  bredde (portræt) rammer mobil-bottomsheet-layoutet, mens 1024px (landskab)
  rammer det fulde desktop-sidebar-layout — ingen fejl her, men bekræfter at
  en iPad i portræt reelt er "mobil" på dette site.

## Trin 3 — Gennemgang pr. område

### 1. Layout og viewport
- `html, body { height: 100%; overflow: hidden; }` (`css/style.css:32-34`) +
  `.app-container { height: 100vh; }` (`:44`) + `.sidebar { height: 100vh; }`
  (`:51`) + `.map-container { height: 100vh; }` (`:657`) + mobil
  `.map-container { height: calc(100vh - 64px); }` (`:944`). **Ingen bruger
  `dvh`/`svh`.** På mobil Safari skifter `100vh` ikke i takt med at
  adresselinjen/værktøjslinjen skjules/vises — med `overflow: hidden` globalt
  er der ingen scroll til at kompensere, så bundsheet/kort kan blive beskåret
  eller efterlade et "dødt" område i bunden, afhængig af browser-UI-tilstand.
- Viewport-meta er fornuftig (`index.html:5`,
  `maximum-scale=5`, zoom ikke blokeret) — ingen `user-scalable=no` nogen
  steder på sitet. Godt for tilgængelighed.
- Ingen `env(safe-area-inset-*)` bruges noget sted i CSS'en (bekræftet via
  søgning) — på iPhones med notch/home-indikator kan bundsheet-peek'en
  (`--bottomsheet-peek: 88px`, `:28`) og den faste `.correction-fab` (bund:
  `calc(var(--bottomsheet-peek) + 12px)`, `:954`) ende under home-indikatoren.

### 2. Kortet
- `L.map(..., { tap: true, tapTolerance: 15, scrollWheelZoom: !isMobile })`
  (`js/app.js:55-62`) — pinch-zoom og enkelt-finger-pan er Leaflet-standard og
  er ikke deaktiveret, så det bør virke uden ekstra kode.
- `isMobile` beregnes **én gang** ved `initMap()` (`js/app.js:53`) ud fra
  `window.innerWidth` på load-tidspunktet. Ved rotation fra portræt til
  landskab (fx 390→844px bredde) bliver `scrollWheelZoom` ikke genberegnet —
  mindre problem (kun relevant med ekstern mus/trackpad), men et tegn på at
  mobil-tilstand ikke er reaktiv.
- Markører har `min-width/height: 44px` (`css/style.css:1513-1516`) — godt
  touch-mål.
- **Mobil-popup hard-capper til 10 spillere** uden "vis flere"-knap
  (`js/app.js:1391-1392,1430`): `const maxVisible = isMobile ? 10 :
  players.length;` — for et sted som København (258 spillere) mister brugeren
  248 spillere og kan intet gøre ved det. Desktop har til sammenligning en
  scrollbar popup (`max-height: min(320px, 40vh)`, `:741`).
- Choropleth-tooltips (kommune/region-udfyldning) er bundet via Leaflets
  `bindTooltip` med default hover-adfærd (`js/app.js:797-806`) — på touch er
  tooltip-fremkomst afhængig af browserens touch→mouse-emulering, som er
  inkonsistent på tværs af mobil-browsere. Ikke verificeret visuelt, men et
  kendt Leaflet-mobil-problem.
- `.info-tooltip:hover::after` (`css/style.css:1388-1413`) — "Barndomsklub"
  forklaringen virker **kun på hover**. Der er ingen klik-handler i
  `js/app.js` for `.info-tooltip` (bekræftet, ingen træfninger). På touch kan
  brugeren aldrig se forklaringsteksten, hverken i sidebar (`index.html:155`)
  eller i manglende-data-tabellens header (`index.html:319`).

### 3. Filterpanelet
- Bliver en bottom sheet ved ≤768px (`css/style.css:898-934`) med
  `--bottomsheet-height: 70vh` og en "peek"-tilstand på 88px — en fornuftig
  mønster, allerede implementeret.
- **Der er ingen "Filtre (3 aktive)"-indikator.** Bruger ved ikke hvor mange
  filtre der er aktive, før de åbner sheet'en. `sidebar-toggle` har kun
  teksten "Filtre" (`index.html:91`), ingen dynamisk tæller.
- Dual-range-sliderne har thumb på 28×28px på mobil
  (`css/style.css:973-981`) — fint touch-mål isoleret set, men to håndtag på
  samme skinne (fx "Fødselsår: 1870–2010") kan stadig overlappe hinanden
  visuelt ved yderpunkter på en 300px-bred sheet; der er z-index-logik for at
  afgøre hvilken der er "øverst" (`:472-485`), men ingen visuel adskillelse af
  håndtagene når værdierne er tætte.
- **`#per-capita-check` (checkbox) har ingen CSS overhovedet** — `.checkbox-option`/
  `.checkbox-custom` (brugt i `index.html:201-205`) findes ikke i
  `css/style.css` (bekræftet, 0 træfninger på "checkbox"). Den falder tilbage
  til browserens default-checkbox (~13×13px) — langt under 44px touch-mål, og
  ser visuelt malplaceret ud ved siden af resten af det custom-stylede UI.
- `.pill-option input[type="radio"] { display: none; }` (`:300-302`) skjuler
  det native input helt og styler kun `<label>`. Fungerer for mus/touch, men
  giver intet synligt fokus-ring ved tastatur-navigation (samme mønster som
  `.radio-option`, `:342-350`) — relevant for skærmlæser-/tastaturbrugere på
  en ekstern mobil-tastatur (Bluetooth) eller browser-zoom+tab-navigation.

### 4. Tabellen (manglende-data-modal, 8 kolonner)
- `index.html:291-331` — `<table id="missing-table">` med kolonnerne Navn,
  Fødested, Barndomsklub, Wikipedia, DBU ID, Køn, Kampe, Mål.
- **Ingen mobil-specifik CSS for `.missing-table`** (ingen `@media`-regel
  nævner `missing-table` noget sted). Den ligger i `.modal-content` (max-width
  900px, men `width: 100%` — så på 360px bliver den ca. 320px bred efter
  `.modal-overlay`'s `padding: 20px`, `css/style.css:1131-1152`) og
  `.modal-body { overflow: auto; }` (`:1189-1192`) giver kun generisk
  scroll — ingen sticky første kolonne, ingen "swipe for mere"-indikator,
  ingen kort-visning.
- Med 8 kolonner (hvoraf flere er tekst: navn, fødested, barndomsklub) bliver
  dette i praksis et vandret scroll-felt uden visuel hint om at der er mere at
  se, og uden at spillernavnet (den vigtigste kontekst) bliver stående, mens
  man scroller til Kampe/Mål.
- `.missing-controls` (søgefelt + 2 selects + feedback-knap, `:1194-1246`) har
  `flex-wrap: wrap`, så den knækker pænt — men søgefelt og selects har
  `font-size: 13px` (se punkt 6 nedenfor), og "Indsend rettelse"-linket har
  `margin-left: auto`, som på smal skærm hopper til egen linje, hvilket er
  okay men utestet visuelt.
- Ingen sortering er touch-optimeret udover at `<th class="sortable">` allerede
  er klikbar — men `<th>` har ingen min-height/touch-target-regel, så
  sorterings-klikfladen kan være smallere end 44px i højden
  (`css/style.css:1255-1265`, kun `padding: 10px 12px`).

### 5. Navigation
- `.sidebar-nav` (Kort/Rekorder/Kurven/Quiz/Om) er 5 elementer i `display:
  flex; flex-wrap: nowrap;` med `font-size: 11px` (`css/style.css:78-109`).
  Ved 360px bredde (sidebar fylder hele skærmen i bottom sheet) er der nok
  plads vandret, men det er en ren tekst-tab-linje uden burger-menu — svarer
  reelt til et "sekundært" navigationselement der kun er synligt når
  filter-sheet'en er åben. Der er **ingen synlig topnavigation når sheet'en er
  lukket** på mobil — kun søgefeltet og filter-knappen i `mobile-search-bar`.
  Det betyder at "Rekorder / Kurven / Quiz / Om" kun er tilgængelige ved at
  åbne filter-sheet'en først, hvilket er en indirekte sti til kernenavigation.
- `<span class="sidebar-nav-item active" id="nav-kort">Kort</span>`
  (`index.html:108`) er et `<span>`, ikke en `<a>`/`<button>` — ikke
  fokuserbar, ikke en del af tab-rækkefølgen, i modsætning til de andre 4
  nav-punkter som er `<a>`/`<button>`. Rent mobilt er det mindre kritisk (det
  er jo "aktiv side"), men det er en inkonsistens i samme linje kode.

### 6. Søgefelt og formularer
- `mobile-search-bar` søgefelt har eksplicit `font-size: 16px` med kommentar
  "forhindrer iOS auto-zoom" (`css/style.css:882`) — **det er allerede gjort
  rigtigt ét sted**, men ikke konsekvent andre steder:
  - `.missing-search` — `font-size: 13px` (`:1210-1216`) → iOS zoomer ved fokus.
  - `.missing-select` — `font-size: 13px` (`:1218-1226`) → samme for `<select>`.
  - `landsholdskurven/index.html:41` `.search-wrap input { font-size: 14px }`.
  - `landsholdskurven/index.html:35` `.period-select { font-size: 13px }`.
  - `quiz/index.html:81` `.search-wrap input, .guess-row input[type=text] {
    font-size: 15px }` — tæt på, men stadig under 16px.
  - `quiz/index.html:60` `.period-select { font-size: 13px }`.
- Ingen af input-felterne bruger `inputmode` eller `autocomplete` ud over
  `autocomplete="off"` på quiz-gæt-feltet (`quiz/index.html:177`) — søgefeltet
  på forsiden kunne have `inputmode="search"` for bedre tastatur på mobil
  (mindre kritisk, men nem gevinst).
- Søgeforslag/autocomplete-lister (`.suggestions` i Kurven/Quiz) er
  `position: absolute` under feltet — ikke afprøvet om mobiltastaturet dækker
  dem på en kort skærm (414×896 med tastatur fylder ofte halvdelen).

### 7. Pop-ups og modaler
- `#missing-modal`/`#om-modal` har **ingen** `role="dialog"`,
  `aria-modal="true"`, Escape-luk eller fokus-trap (bekræftet: ingen
  `keydown`/`Escape`-håndtering noget sted i `js/app.js`). Til sammenligning
  har `#mobile-popup-panel` korrekt `role="dialog" aria-modal="true"`
  (`index.html:379`) — så mønsteret findes allerede i kodebasen, det er bare
  ikke brugt konsekvent på de to andre modaler.
- Scroll-lock: fordi `html, body` allerede har `overflow: hidden` globalt
  (`:32-34`), er baggrunden teknisk set aldrig scrollbar — så det specifikke
  "modal scroller baggrunden med"-problem findes ikke her, men det er en
  bivirkning af en bredere arkitektur-beslutning snarere end en bevidst
  modal-løsning.
- `.modal-overlay { padding: 20px; }` (`:1131-1140`) + `.modal-content`
  `max-height: 85vh` — på en kort landskab-skærm (fx 844×390) bliver
  `85vh` ≈ 332px, hvilket sammen med modal-header + missing-controls-baren
  efterlader meget lidt plads til selve tabellen. Ikke testet visuelt.
- `.mobile-popup-panel` lukkes ved swipe-ned (`js/app.js:1346-1351`,
  threshold 60px) — fungerer kun hvis swipet starter på selve panelet, ikke
  hvis det starter inde i den scrollbare `.mobile-popup-content` (hvor
  browserens egen scroll vil "spise" touch-eventet først ved kort swipe). Kan
  give en oplevelse af at swipe-til-luk er upålidelig, afhængig af hvor på
  panelet man rammer.

### 8. Touch-mål og typografi
- `.gf-btn` (brugt i Kurven, Quiz og Rekordlister — 3 forskellige steder,
  samme regel kopieret) har `padding: 6px 14px; font-size: 13px` →
  reel højde ≈ 13+12 = 25-29px, **under 44px**.
- `.quiz-btn-sec` (`quiz/index.html:95-96`) `padding: 9px 16px; font-size:
  13px` → samme problem, ≈ 31px høj.
- `.nav-tab` (quiz) har `padding: 14px 18px` → det klarer 44px fint.
- Basis-fontstørrelse på forsiden er `font-size: 14px` på `html, body`
  (`css/style.css:36`) — acceptabelt, men flere UI-labels går ned til 10-11px
  (`.stats-label`, `:239-245`; `.control-label-small`, `:267-275`), hvilket er
  i underkanten for læsbarhed på en lille skærm med normal betragtningsafstand.
- Kontrast er generelt god (rød `#C8102E` på hvid, mørkegrå tekst) — ingen
  åbenlyse kontrastbrud fundet ved kode-gennemgang, men ikke målt med værktøj.

### 9. Undersiderne
- **Landsholdskurven** (`landsholdskurven/index.html`): `.controls`
  (`:23-24`) indeholder 3 knap-grupper + 2 selects + søgefelt i én
  `flex-wrap: wrap`-række — ingen `@media`-regel findes i hele filen
  (bekræftet: 0 træfninger på `@media`). På 360px bredde knækker det til
  formentlig 4-5 linjer filterkontroller *over* grafen, før brugeren når
  grafen. Selve canvas-grafen er responsiv i bredden
  (`W = canvas.parentElement.clientWidth - 48`, `:264`) og har en
  `resize`-listener der kalder `draw()` igen (`:485`) — det er godt — men
  **højden er fast `H = 420` uanset skærmstørrelse** (`:265`), hvilket på en
  kort landskab-skærm (fx 844×390) kan gøre grafen højere end selve
  viewporten.
- **Quiz** (`quiz/index.html`): eneste `@media`-regel i filen er linje 126
  (`.g4-options` → 1 kolonne under 480px). `.nav-tab`-linjen har
  `overflow-x: auto` (`:38-39`) — fin fallback hvis fanerne ikke kan være på
  én linje. Knapper under 44px som nævnt i punkt 8.
- **Rekorder** (`rekordlister/index.html`): bedst stillet af undersiderne —
  har allerede `.table-wrap { overflow-x: auto; }` (`:57`) om hver tabel og en
  `@media (max-width: 400px)`-regel der mindsker skriftstørrelse
  (`:1527-1529` i `css/style.css`, delt med forsiden). Mangler stadig sticky
  første kolonne og visuel scroll-indikator, men har i det mindste en
  fungerende fallback.
- **Om**: er en modal på forsiden (samme mangler som punkt 7).

### 10. Ydelse på mobil
- Intet Lighthouse-/WebPageTest-run udført (intet værktøj tilgængeligt).
  Vurdering ud fra kode:
  - `data/players.json` = **1,9 MB** ukomprimeret, hentet synkront ved load
    (`js/app.js:397-401`) og mappet/beriget client-side for alle ~1150
    spillere (`:410-423`) — på 3G/dårlig mobil-forbindelse er dette den
    største enkeltstående flaskehals ved første besøg.
  - **`.loading-overlay`-CSS findes (`css/style.css:1036-1050`) men bruges
    ingen steder** — 0 træfninger i `js/app.js` eller `index.html`. Under
    hele data-hentning + markør-opbygning ser brugeren et tomt/hvidt kort
    uden feedback. Dette er dødt CSS der burde enten bruges eller fjernes.
  - Logo-billeder (32 MB i `logos/`) lazy-loades allerede pr. synligt
    kortudsnit (`js/app.js:666-691`) med et loft på
    `MAX_CONCURRENT_LOGO_LOADS = 24` (`:14`) — allerede en fornuftig,
    mobil-venlig løsning.
  - GeoJSON-lagene (864+516 KB) hentes lazy, kun ved kommune/region-visning —
    godt.
  - Leaflet-tiles kommer fra `tile.openstreetmap.org` uden synlig
    `maxZoom`-begrænsning på selve requests udover standard — ikke et
    kode-problem i sig selv.
  - Ingen `loading="lazy"` attributter fundet på `<img>`-tags i popup/tabel
    (fx `popup-player-img`, `js/app.js:760-768` CSS / bygges i
    `buildPopupHtml`) — browseren downloader alle synlige spillerbilleder i
    en popup/tabel med det samme i stedet for lazy.

### 11. Tilgængelighed på mobil
- Range-sliders (`#birth-year-min`, `#matches-min` osv., `index.html:232-277`)
  har **ingen `aria-label`** — kun en visuel `<span>`-label ved siden af, uden
  `aria-labelledby`. Skærmlæser-brugere på mobil (VoiceOver/TalkBack) får
  ingen kontekst om hvad slideren styrer.
- `#sidebar-drag-handle` har `aria-hidden="true"` (`index.html:98`) men har
  samtidig en `click`-listener der åbner/lukker sheet'en
  (`js/app.js:102-110`) — elementet er funktionelt interaktivt, men
  usynligt for assisterende teknologi. Hvis en bruger med skærmlæser ikke kan
  bruge drag-handle'en, er der dog stadig `sidebar-toggle`/`sidebar-toggle-mobile`
  som reelle, tilgængelige knapper — så det er ikke en blokerende fejl, men en
  inkonsistens.
- Ingen `prefers-reduced-motion`-forespørgsel noget sted (0 træfninger i
  `css/style.css`) — bottom sheet-transitionen (`0.35s cubic-bezier`,
  `:911`), mobil-popup-transitionen (`:1463`) og sidebar-transitionen kører
  altid, uanset brugerens OS-indstilling for reduceret bevægelse.
- Fokusrækkefølge er ikke eksplicit testet, men DOM-rækkefølgen i
  `index.html` følger den visuelle rækkefølge (sidebar → modaler → kort), så
  der er ingen åbenlys tabindex-fejl ved kode-læsning.

### 12. PWA / ekstra (lav prioritet)
- Intet `manifest.json`, ingen `<meta name="theme-color">`, ingen
  `apple-mobile-web-app-*`-tags (bekræftet, 0 træfninger i `index.html`).
  Kun en `favicon.svg` (`:12-13`). Ren "tilføj til hjemmeskærm"-oplevelse er
  ikke konfigureret.

## Prioriteret liste over fund

| # | Område | Problem | Fil/linje | Foreslået løsning | Effekt | Indsats |
|---|---|---|---|---|---|---|
| 1 ✅ | Søgning/formular | Input/select-tekst under 16px trigger iOS-zoom | `css/style.css:1210-1226`; `landsholdskurven/index.html:35,41`; `quiz/index.html:60,81` | Sæt `font-size: 16px` på alle inputs/selects på mobil (media query eller global min.) | Høj | S |
| 2 ✅ | Kortet | `.info-tooltip` virker kun på `:hover` — util tilgængelig på touch | `css/style.css:1388-1413`; `index.html:155,319` | Tilføj `click`/`focus`-toggle i JS, eller erstat med et altid-synligt `(i)`-ikon + tap-to-show | Høj | S |
| 3 | Tabellen | 8-kolonne manglende-data-tabel har ingen mobil-tilpasning | `index.html:291-331`; `css/style.css:1248-1314` | Kort-visning pr. spiller under 600px, eller sticky 1. kolonne + scroll-skygge | Høj | M |
| 4 ✅ | Kortet | Mobil-popup capper hårdt ved 10 spillere, ingen "vis flere" | `js/app.js:1391-1394,1430` | Vis fx 20 + en "Vis alle (N)"-knap der udvider listen in-place | Høj | S |
| 5 | Layout | `100vh` uden `dvh`/`svh`-fallback, 5 steder | `css/style.css:33,44,51,657,944` | Tilføj `height: 100dvh` med `100vh` som fallback | Høj | S |
| 6 | Performance | Intet loading-feedback mens 1,9 MB `players.json` hentes | `css/style.css:1036-1050` (ubrugt); `js/app.js:19-26` | Vis `.loading-overlay` (findes allerede i CSS) indtil `loadData()` er færdig | Mellem | S |
| 7 | Filterpanel | `#per-capita-check` har ingen CSS — default browser-checkbox, <20px touch-mål | `index.html:200-206`; `css/style.css` (ingen `.checkbox-option`-regel findes) | Tilføj custom checkbox-styling i samme stil som `.pill-option` | Mellem | S |
| 8 | Navigation | Sekundær navigation (Rekorder/Kurven/Quiz/Om) kun tilgængelig via filter-sheet på mobil | `index.html:107-113` | Tilføj kompakt navigation i/ved `mobile-search-bar`, fx som menu-knap | Mellem | M |
| 9 ✅ | Touch-mål | `.gf-btn`/`.quiz-btn-sec`/`.period-select` under 44px høje, brugt på 3 sider | `landsholdskurven/index.html:28,35`; `quiz/index.html:55,60,96`; `rekordlister/index.html` (delt `.gf-btn`) | Hæv padding til min. 44px høj på mobil via delt media query | Mellem | S |
| 10 | Filterpanel | Ingen "Filtre (N aktive)"-tæller på åbne/luk-knappen | `index.html:79-92`; `js/app.js` (ingen tæller-logik) | Beregn antal ikke-default filtre og vis badge på knappen | Mellem | M |
| 11 ✅ | Modaler | `#missing-modal`/`#om-modal` mangler `role="dialog"`, `aria-modal`, Escape-luk | `index.html:291,334`; `js/app.js` (intet `keydown`) | Kopiér mønsteret fra `#mobile-popup-panel` (`index.html:379`) som allerede er korrekt | Mellem | S |
| 12 | Tilgængelighed | Range-sliders har ingen `aria-label`/`aria-labelledby` | `index.html:230-277` | Tilføj `aria-labelledby` der peger på den eksisterende `<span>`-label | Mellem | S |
| 13 | Undersider | Landsholdskurven: filterrække har 0 responsive regler, kan blive 4-5 linjer over grafen | `landsholdskurven/index.html:23-24` (ingen `@media` i filen) | Tilføj media query der stabler i 2 rækker eller skjuler labels under 480px | Mellem | M |
| 14 | Undersider | Graf-canvas har fast højde 420px uanset skærm/orientering | `landsholdskurven/index.html:265` | Gør højden afhængig af `window.innerHeight` (fx `clamp(240, 50vh, 420)`) | Lav | S |
| 15 | Layout | Ingen `env(safe-area-inset-bottom)` — FAB/bottomsheet-peek kan ramme home-indikator | `css/style.css:28,589-607,952-962` | Tilføj `padding-bottom: env(safe-area-inset-bottom)` hvor relevant | Lav | S |
| 16 | Tilgængelighed | Ingen `prefers-reduced-motion`-understøttelse | `css/style.css` (0 træfninger) | Wrap transitions i `@media (prefers-reduced-motion: no-preference)` | Lav | S |
| 17 | Semantik | `#nav-kort` er `<span>`, ikke fokuserbar som søskende-elementer | `index.html:108` | Skift til `<button>` eller `<a href="/">`, match de andre 4 nav-items | Lav | S |
| 18 | Modaler | `.modal-content` `max-height:85vh` kan klemme indhold på kort landskab-skærm | `css/style.css:1146-1155` | Reducér padding/header-højde under `(max-height: 500px)` | Lav | S |
| 19 | Images | Ingen `loading="lazy"` på spillerbilleder i popup/tabel | `js/app.js` (`buildPopupHtml`, `popup-player-img`) | Tilføj `loading="lazy"` attribut på `<img>`-tags | Lav | S |
| 20 ✅ (delvist: kun theme-color) | PWA | Intet manifest/theme-color | `index.html` (ingen tags) | Tilføj `manifest.json` + `theme-color`-meta (kosmetisk, ikke hastende) | Lav | S |
| 21 ✅ | Rengøring | Forældede `/app.js`, `/style.css` i roden (ubrugte duplikater) | `/app.js`, `/style.css` | Slet filerne — ingen reference til dem fra `index.html` | Lav | S |
| 22 | **[Visuelt bekræftet]** Kortet | Markør-overlap: 300-800 klublogoer ligger oven i hinanden ved standard-zoom, ulæseligt på alle testede mobilstørrelser | `js/app.js:55-62` (default `setView([56,10.5],7)`, ingen clustering på forsiden) | Overvej clustering (som på `/worldmap/`), højere default-zoom, eller spredning/jitter af overlappende markører allerede ved lav zoom | **Høj** | L |
| 23 ✅ | **[Visuelt bekræftet]** Filterpanel | "Indlæser logoer…"-indikator overlapper sliderne når filterpanelet er åbnet (ikke kun i peek-tilstand) | `css/style.css:964-970` (`bottom: calc(--bottomsheet-peek + 12px)`, uafhængig af `.sidebar.open`) | Skjul/flyt indikatoren når `.sidebar.open`, eller placér den over kortet i stedet for bundsheetens koordinatsystem | Mellem | S |
| 24 ✅ | **[Visuelt bekræftet]** Kortet | Zoom "−"-knap kan overlappes af attributionsboksen i landskab på korte skærme (640×360) | `css/style.css:1326-1337` | Reducér/flyt attribution i landskab under en højde-baseret media query, fx `(max-height: 420px)` | Mellem | S |
| 25 | **[Visuelt bekræftet]** Undersider | Vandrette fane-linjer (Quiz, Rekordlister) klipper sidste fane af uden scroll-hint | `quiz/index.html` `.nav-tab`-linje; `rekordlister/index.html` tilsvarende | Tilføj en højre-kant-skygge/fade (`::after` med gradient) der kun vises når der er mere at scrolle til | Lav | S |
| 26 | **[Visuelt bekræftet]** Landsholdskurven | `X-AKSE`/`Y-AKSE`-labels hægter sig på forkert knaprække efter `flex-wrap` på smal skærm | `landsholdskurven/index.html:23-24,98,107` | Gruppér hver akse-label + dens knapper i egen `flex`-wrapper, så de altid knækker sammen | Mellem | S |

## Quick wins (under 1 time, stor effekt)

Alle ✅ implementeret undtagen #5 (Fase 3) og #6 (afventer svar, se
"Åbne spørgsmål"):

- ✅ **#1** Hæv `font-size` til 16px på `.missing-search`, `.missing-select`,
  Kurven/Quiz' søgefelter og `.period-select`.
- ✅ **#2** `.info-tooltip` er nu klikbar via `click`-toggle i `js/app.js`.
- **#5** (Fase 3) Erstat `100vh` med `100dvh` (med `100vh` som fallback) de
  5 steder i `css/style.css`.
- **#6** (afventer svar) Loading-overlay mens `players.json` hentes.
- ✅ **#11** `role="dialog" aria-modal="true"` + Escape-luk på
  `#missing-modal`/`#om-modal`.
- ✅ **#4** Popup-loft hævet til 25 + "Vis alle (N)"-knap med filterfelt.
- ✅ **#21** `/app.js` og `/style.css` i roden slettet.
- ✅ **#23** `.logo-loading-indicator` skjules via klasse i
  `openSheet()`/`closeSheet()`.
- ✅ **#24** `@media (max-width:768px) and (max-height:420px)` flytter
  attribution væk fra zoom-knappen.

## Større forslag

### D. Markør-overlap ved standard-zoom (#22)

Det visuelt mest markante problem er ikke mobil-specifikt i sin årsag (ingen
clustering, ingen jitter ved lav zoom), men rammer mobil hårdest, fordi der
er mindre skærm at sprede sig på. Tre realistiske retninger:

1. **Clustering** (som allerede bruges på `/worldmap/` via
   `MarkerCluster.css`/`.js`, som allerede er vendored) — mest robust, men en
   større ændring af `updateMap()`/markør-rendering på forsiden.
2. **Højere default-zoom ved load** (fx zoom 8-9 i stedet for 7) — meget
   billig ændring (`js/app.js:62`), men løser kun en del af problemet, da der
   stadig er tætte klynger omkring fx København.
3. **Jitter/spredning også ved lav zoom** — appen har allerede en
   jitter-algoritme for identiske koordinater ved høj zoom (nævnt i tidligere
   analyse af `allClubs`-visningen); den kunne udvides til at virke
   proportionalt med zoom-niveau.

Dette bør prioriteres højt, men er en selvstændig, større opgave — ikke en
quick win.

### A. Mobil-tabel for manglende-data (erstatter #3)

I stedet for at forsøge at klemme 8 kolonner ind på 320px, foreslår jeg et
layout-skift under `768px`:

```
┌─────────────────────────────┐
│ Jens Eriksen            ♂   │   <- navn + køn, fed
│ Fødested: Ukendt             │
│ Klub: FC Midtjylland          │
│ 12 kampe · 2 mål              │
│ [Wikipedia]  [DBU]  [Ret fejl]│
└─────────────────────────────┘
```

Teknisk: behold samme `<table>`-markup (SEO/sortering), men på mobil
`display: block` på `tr`/`td` og CSS `content`-labels (klassisk
"responsive table"-mønster), *eller* generér et separat sæt `<div
class="missing-card">` via JS når `window.innerWidth <= 768` og skjul
`<table>`. Det sidste er mere kode, men giver bedre kontrol over
sortering/filtrering-visning.

### B. Filter-tæller + kompakt navigation

Kombinér fund #8 og #10: gør `mobile-search-bar` til den egentlige mobile
"app bar" — tilføj et lille burger/nav-ikon ved siden af filter-knappen, der
åbner en simpel liste (Rekorder/Kurven/Quiz/Om) som et lille dropdown/sheet,
og vis "Filtre (3)" i stedet for bare "Filtre" på `sidebar-toggle-mobile`
baseret på hvor mange filtre der afviger fra default.

### C. Progressiv data-indlæsning

`players.json` på 1,9 MB hentes i sin helhed ved load. Hvis I vil forbedre
"time to first marker" på mobil yderligere (ud over at tilføje en
loading-indikator), kunne I overveje server-side at opdele datasættet (fx
kun felter nødvendige for kortvisning først, detaljer lazy ved popup-åbning)
— det er dog en markant større ændring af dataflow og generator-scripts, og
bør kun gøres hvis målinger faktisk viser at det er en flaskehals.

## Foreslået rækkefølge (faser) — opdateret efter din prioritering

1. **Fase 1 — quick wins ✅ implementeret:** #1, #2, #4, #9, #11, #21, #23,
   #24 + theme-color. Ét commit pr. fund (se "Status & beslutninger" øverst).
   **#6 er undtaget** — afventer svar, da den påvirker desktop (se Åbne
   spørgsmål).
2. **Fase 2 — Logo-clustering (#22):** Erstat `setView([56,10.5],7)` med
   `fitBounds` til Danmark, og brug den vendorede MarkerCluster (som på
   `/worldmap/`) så hver klynge viser logoet for klubben med flest spillere +
   et "+N"-badge.
3. **Fase 3 — Viewport-robusthed:** #5 (dvh), #15 (safe-area), #16
   (reduced-motion), #18 (kort landskab-skærm).
4. **Fase 4 — Filterpanel + navigation:** #7 (checkbox-styling), #10
   (filter-tæller), #8/forslag B (permanent menu-ikon i
   `mobile-search-bar`).
5. **Fase 5 — Tabellen:** Forslag A, CSS-baseret kort-visning (samme
   `<table>`, `display:block` + `data-label`).
6. **Fase 6 — Undersider + `css/shared.css`:** #13, #14, #25, #26
   (Kurven/Quiz/Rekordlister), samler de delte `.gf-btn`/`.period-select`-regler
   (inkl. #9's mobil-fix, som i dag ligger dupliseret 3 steder) i én fælles
   fil med breakpoints 480/768/1024 + `max-height:500px`.

Hver fase kan udgives for sig og er uafhængig af de følgende.

## Åbne spørgsmål til dig

Spørgsmål 1-6 fra forrige version er besvaret (se "Status & beslutninger"
øverst). Tilbage er:

1. **#6 — loading-feedback ved første indlæsning:** Må `.loading-overlay`
   (hvid skærm + spinner) vises på **alle** besøg, inkl. desktop, mens
   `players.json` (1,9 MB) hentes? Det er ikke muligt at lave den rent
   mobil-scopet, fordi den er knyttet til selve load-øjeblikket, ikke
   skærmstørrelsen. Tre muligheder:
   - **A.** Ja, vis den overalt — kort, konsistent UX-forbedring, accepterer
     at desktop får en ny (om end kortvarig) visuel tilstand.
   - **B.** Kun en mobil-scopet variant, fx en lille spinner i stedet for en
     fuldskærms-overlay, kun aktiv under `max-width:768px`, så desktop
     garanteret er pixel-uændret.
   - **C.** Spring #6 helt over for nu — lad den indgå i en senere fase, hvis
     perceived-performance på mobil viser sig at være et reelt problem.
