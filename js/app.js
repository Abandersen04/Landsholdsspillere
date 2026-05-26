// ===== State =====
let allPlayers = [];
let map;
let markersLayer;
let geoLayer = null;       // Choropleth GeoJSON layer
let legendControl = null;  // Leaflet legend control
let kommunerGeo = null;    // Raw GeoJSON for kommuner
let regionerGeo = null;    // Raw GeoJSON for regioner
let debounceTimer;
let klubSlugs = new Set(); // Genererede klubsider

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  initSidebar();
  initControls();
  initMissingPanel();
  await loadData();
  updateMap();
});

// ===== Normalize helper (æøå → ae/oe/aa) =====
function slugify(s) {
  return normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalize(s) {
  return (s || '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ===== Title Case helper =====
const FOOTBALL_ABBR = new Set(['fc', 'fk', 'bk', 'ik', 'if', 'gf', 'sf', 'ff', 'af', 'ab', 'kb', 'agf', 'aab', 'ob', 'hb', 'tb', 'sb', 'nb', 'vb', 'fb', 'fs', 'if', 'jfk', 'dfb', 'afc', 'rfc', 'sfc']);

function toTitleCase(str) {
  if (!str) return '';
  return str.replace(/\w\S*/g, txt => {
    const lower = txt.toLowerCase();
    if (FOOTBALL_ABBR.has(lower)) return txt.toUpperCase();
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

// ===== Map Setup =====
function initMap() {
  const isMobile = window.innerWidth <= 768;

  map = L.map('map', {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 18,
    tap: true,
    tapTolerance: 15,
    scrollWheelZoom: !isMobile
  }).setView([56, 10.5], 7);

  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  markersLayer = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: false,
    showCoverageOnHover: false,
    maxClusterRadius: 1,
    spiderfyDistanceMultiplier: 2.0,
    iconCreateFunction: () => L.divIcon({
      html: '',
      className: '',
      iconSize: [0, 0]
    })
  });
  map.addLayer(markersLayer);
}

// ===== Sidebar / Bottomsheet =====
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  const close = document.getElementById('sidebar-close');
  const handle = document.getElementById('sidebar-drag-handle');

  const openSheet = () => sidebar.classList.add('open');
  const closeSheet = () => sidebar.classList.remove('open');

  toggle.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      openSheet();
    } else {
      sidebar.classList.toggle('open');
    }
  });

  close.addEventListener('click', closeSheet);

  // Tap on drag handle or peek area (when closed) → open
  if (handle) {
    handle.addEventListener('click', () => {
      if (!sidebar.classList.contains('open')) {
        openSheet();
      } else {
        closeSheet();
      }
    });
  }

  // Swipe gesture on sidebar (mobile)
  let touchStartY = 0;
  let touchStartTime = 0;

  sidebar.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  sidebar.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    const velocity = Math.abs(dy) / dt; // px/ms
    // Fast swipe or large drag
    if (dy < -40 || (dy < -10 && velocity > 0.3)) {
      openSheet();
    } else if (dy > 40 || (dy > 10 && velocity > 0.3)) {
      closeSheet();
    }
  }, { passive: true });

  // Tap on peek area (when sidebar is closed) opens it
  sidebar.addEventListener('click', e => {
    if (window.innerWidth <= 768 && !sidebar.classList.contains('open')) {
      openSheet();
    }
  });

  // Close when clicking on map (mobile)
  map.on('click', () => {
    if (window.innerWidth <= 768) {
      closeSheet();
    }
  });

  // Sync mobile search bar with sidebar search
  const searchDesktop = document.getElementById('search');
  const searchMobile = document.getElementById('search-mobile');
  if (searchMobile) {
    searchMobile.addEventListener('input', () => {
      searchDesktop.value = searchMobile.value;
      debouncedUpdate();
    });
    searchDesktop.addEventListener('input', () => {
      searchMobile.value = searchDesktop.value;
    });
  }
}

// ===== Slider fill helpers =====

// Opdaterer rød fill på dual range slider via CSS custom properties
function updateDualSliderFill(container, minEl, maxEl) {
  const min = parseFloat(minEl.min);
  const max = parseFloat(minEl.max);
  const lo = Math.min(parseFloat(minEl.value), parseFloat(maxEl.value));
  const hi = Math.max(parseFloat(minEl.value), parseFloat(maxEl.value));
  const pctLo = ((lo - min) / (max - min)) * 100;
  const pctHi = ((hi - min) / (max - min)) * 100;
  container.style.setProperty('--fill-lo', pctLo + '%');
  container.style.setProperty('--fill-hi', pctHi + '%');
}

// Opdaterer rød fill på enkelt slider via CSS custom property
function updateSingleSliderFill(el) {
  const min = parseFloat(el.min);
  const max = parseFloat(el.max);
  const pct = ((parseFloat(el.value) - min) / (max - min)) * 100;
  el.style.setProperty('--fill-pct', pct + '%');
}

// ===== Controls =====
function initControls() {
  // Radio buttons – mapType
  document.querySelectorAll('input[name="map_type"]').forEach(el => {
    el.addEventListener('change', () => {
      updateBirthSubControls();
      updateClubPlayersVisibility();
      updateMap();
    });
  });

  // Radio buttons – birth_level (by / kommune / region)
  document.querySelectorAll('input[name="birth_level"]').forEach(el => {
    el.addEventListener('change', () => {
      updateBirthSubControls();
      updateClubPlayersVisibility();
      updateMap();
    });
  });

  // Radio buttons – club_level (klub / kommune / region)
  document.querySelectorAll('input[name="club_level"]').forEach(el => {
    el.addEventListener('change', () => {
      updateBirthSubControls();
      updateClubPlayersVisibility();
      updateMap();
    });
  });

  // Checkbox – pr. 1000 indbyggere
  document.getElementById('per-capita-check').addEventListener('change', () => updateMap());

  function updateBirthSubControls() {
    const mapType = document.querySelector('input[name="map_type"]:checked').value;
    const birthLevelGroup = document.getElementById('birth-level-group');
    const clubLevelGroup = document.getElementById('club-level-group');
    const perCapitaGroup = document.getElementById('per-capita-group');
    birthLevelGroup.style.display = (mapType === 'birth') ? '' : 'none';
    clubLevelGroup.style.display = (mapType === 'club') ? '' : 'none';
    if (mapType === 'birth') {
      const level = document.querySelector('input[name="birth_level"]:checked').value;
      perCapitaGroup.style.display = (level === 'kommune' || level === 'region') ? '' : 'none';
    } else if (mapType === 'club') {
      const level = document.querySelector('input[name="club_level"]:checked').value;
      perCapitaGroup.style.display = (level === 'kommune' || level === 'region') ? '' : 'none';
    } else {
      perCapitaGroup.style.display = 'none';
    }
  }
  updateBirthSubControls();

  document.querySelectorAll('input[name="gender"]').forEach(el => {
    el.addEventListener('change', () => updateMap());
  });

  // Vis/skjul min-spillere filter
  function updateClubPlayersVisibility() {
    const mapType = document.querySelector('input[name="map_type"]:checked').value;
    const group = document.getElementById('club-players-group');
    const groupLabel = document.getElementById('club-players-group-label');
    const birthLevel = document.querySelector('input[name="birth_level"]:checked').value;
    const clubLevel = document.querySelector('input[name="club_level"]:checked').value;
    // Skjul min-spillere ved region/kommune-niveau (giver ikke mening pr. 1000)
    const showMinPlayers = (mapType === 'club' && clubLevel === 'klub') || mapType === 'all_clubs' ||
      (mapType === 'birth' && birthLevel === 'city');
    group.style.display = showMinPlayers ? '' : 'none';
    if (mapType === 'birth') {
      groupLabel.childNodes[0].textContent = 'Min. spillere pr. fødested: ';
    } else {
      groupLabel.childNodes[0].textContent = 'Min. spillere pr. klub: ';
    }
  }
  updateClubPlayersVisibility(); // Sæt initial tilstand

  // Helper: bring den nærmeste thumb i forgrunden når begge thumbs overlapper
  function setupRangeSlider(minEl, maxEl) {
    const container = minEl.parentElement;
    container.addEventListener('pointerdown', (e) => {
      const rect = container.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const min = parseFloat(minEl.min);
      const max = parseFloat(minEl.max);
      const clickVal = min + pct * (max - min);
      const distToMin = Math.abs(clickVal - parseFloat(minEl.value));
      const distToMax = Math.abs(clickVal - parseFloat(maxEl.value));
      if (distToMin <= distToMax) {
        minEl.style.zIndex = 3;
        maxEl.style.zIndex = 1;
      } else {
        maxEl.style.zIndex = 3;
        minEl.style.zIndex = 1;
      }
    });
  }

  // Birth year range slider
  const birthYearMin = document.getElementById('birth-year-min');
  const birthYearMax = document.getElementById('birth-year-max');
  const birthYearLabel = document.getElementById('birth-year-range-label');
  const birthYearContainer = birthYearMin.parentElement;
  setupRangeSlider(birthYearMin, birthYearMax);
  updateDualSliderFill(birthYearContainer, birthYearMin, birthYearMax);

  function updateBirthYearLabel() {
    const lo = Math.min(parseInt(birthYearMin.value), parseInt(birthYearMax.value));
    const hi = Math.max(parseInt(birthYearMin.value), parseInt(birthYearMax.value));
    birthYearLabel.textContent = `${lo} – ${hi}`;
    updateDualSliderFill(birthYearContainer, birthYearMin, birthYearMax);
  }

  birthYearMin.addEventListener('input', () => {
    if (parseInt(birthYearMin.value) > parseInt(birthYearMax.value)) {
      birthYearMin.value = birthYearMax.value;
    }
    updateBirthYearLabel();
    debouncedUpdate();
  });

  birthYearMax.addEventListener('input', () => {
    if (parseInt(birthYearMax.value) < parseInt(birthYearMin.value)) {
      birthYearMax.value = birthYearMin.value;
    }
    updateBirthYearLabel();
    debouncedUpdate();
  });

  // Active year range slider
  const activeYearMin = document.getElementById('active-year-min');
  const activeYearMax = document.getElementById('active-year-max');
  const activeYearLabel = document.getElementById('active-year-range-label');
  const activeYearContainer = activeYearMin.parentElement;
  setupRangeSlider(activeYearMin, activeYearMax);
  updateDualSliderFill(activeYearContainer, activeYearMin, activeYearMax);

  function updateActiveYearLabel() {
    const lo = Math.min(parseInt(activeYearMin.value), parseInt(activeYearMax.value));
    const hi = Math.max(parseInt(activeYearMin.value), parseInt(activeYearMax.value));
    activeYearLabel.textContent = `${lo} – ${hi}`;
    updateDualSliderFill(activeYearContainer, activeYearMin, activeYearMax);
  }

  activeYearMin.addEventListener('input', () => {
    if (parseInt(activeYearMin.value) > parseInt(activeYearMax.value)) {
      activeYearMin.value = activeYearMax.value;
    }
    updateActiveYearLabel();
    debouncedUpdate();
  });

  activeYearMax.addEventListener('input', () => {
    if (parseInt(activeYearMax.value) < parseInt(activeYearMin.value)) {
      activeYearMax.value = activeYearMin.value;
    }
    updateActiveYearLabel();
    debouncedUpdate();
  });

  // Matches range slider
  const matchesMin = document.getElementById('matches-min');
  const matchesMax = document.getElementById('matches-max');
  const matchesLabel = document.getElementById('matches-range-label');
  const matchesContainer = matchesMin.parentElement;
  setupRangeSlider(matchesMin, matchesMax);
  updateDualSliderFill(matchesContainer, matchesMin, matchesMax);

  function updateMatchesLabel() {
    const lo = Math.min(parseInt(matchesMin.value), parseInt(matchesMax.value));
    const hi = Math.max(parseInt(matchesMin.value), parseInt(matchesMax.value));
    matchesLabel.textContent = `${lo} – ${hi}`;
    updateDualSliderFill(matchesContainer, matchesMin, matchesMax);
  }

  matchesMin.addEventListener('input', () => {
    if (parseInt(matchesMin.value) > parseInt(matchesMax.value)) {
      matchesMin.value = matchesMax.value;
    }
    updateMatchesLabel();
    debouncedUpdate();
  });

  matchesMax.addEventListener('input', () => {
    if (parseInt(matchesMax.value) < parseInt(matchesMin.value)) {
      matchesMax.value = matchesMin.value;
    }
    updateMatchesLabel();
    debouncedUpdate();
  });

  // Min. spillere per klub (enkelt slider)
  const clubPlayersEl = document.getElementById('min-club-players');
  const clubPlayersLabel = document.getElementById('club-players-label');
  updateSingleSliderFill(clubPlayersEl);

  clubPlayersEl.addEventListener('input', () => {
    clubPlayersLabel.textContent = clubPlayersEl.value;
    updateSingleSliderFill(clubPlayersEl);
    debouncedUpdate();
  });

  // Search
  document.getElementById('search').addEventListener('input', debouncedUpdate);

}

function debouncedUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(updateMap, 200);
}

// ===== Load Data =====
async function loadData() {
  const [playersResp, kommunerResp, regionerResp, klubResp] = await Promise.all([
    fetch('data/players.json'),
    fetch('data/kommuner.geojson'),
    fetch('data/regioner.geojson'),
    fetch('data/klub_slugs.json').catch(() => null)
  ]);
  const data = await playersResp.json();
  kommunerGeo = await kommunerResp.json();
  regionerGeo = await regionerResp.json();
  if (klubResp && klubResp.ok) {
    klubSlugs = new Set(await klubResp.json());
    console.log('[klubSlugs] loaded', klubSlugs.size, 'slugs, FC København:', klubSlugs.has('fc-koebenhavn'));
  } else {
    console.warn('[klubSlugs] failed to load');
  }

  allPlayers = data.map(p => ({
    ...p,
    birthYear: p.birthday_dbu ? parseBirthYear(p.birthday_dbu) : null,
    years_played: Array.isArray(p.years_played) ? p.years_played : [],
    _nameHay:  normalize(p.playerLabel),
    _birthHay: normalize(p.birthPlaceLabel || ''),
    _clubHay:  normalize([stripGender(p.klubnavn || ''), ...(p.allClubs || []).map(c => stripGender(c.klubnavn || ''))].join(' ')),
    n_matches: parseInt(p.n_matches, 10) || 0,
    n_goals: parseInt(p.n_goals, 10) || 0,
    lat: p.lat ? parseFloat(p.lat) : null,
    lon: p.lon ? parseFloat(p.lon) : null,
    latitude: p.latitude ? parseFloat(p.latitude) : null,
    longitude: p.longitude ? parseFloat(p.longitude) : null
  }));

  injectSEOPlayerList(allPlayers);
}

function injectSEOPlayerList(players) {
  if (document.getElementById('seo-player-list')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'seo-player-list';
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden';

  const ul = document.createElement('ul');
  players.forEach(p => {
    const li = document.createElement('li');
    const text = `${p.playerLabel || ''} – ${p.n_matches || 0} A-landskampe, ${p.n_goals || 0} mål. Barndomsklub: ${p.klubnavn || ''}. Født: ${p.birthPlaceLabel || ''}.`;
    const wikiUrl = p.wikipediaURL_da || p.wikipediaURL_en || null;
    if (wikiUrl) {
      const a = document.createElement('a');
      a.href = wikiUrl;
      a.rel = 'noopener';
      a.textContent = text;
      li.appendChild(a);
    } else {
      li.textContent = text;
    }
    ul.appendChild(li);
  });

  wrapper.appendChild(ul);
  document.body.appendChild(wrapper);
}

function parseBirthYear(dateStr) {
  // Format: dd-mm-yyyy
  const parts = dateStr.split('-');
  return parts.length === 3 ? parseInt(parts[2], 10) : null;
}

// ===== Hjælpefunktioner =====

// Fjerner kønsindikatorer fra klubnavne (bruges både til display og søgning)
function stripGender(name) {
  return (name || '')
    .replace(/\s*(femenino|f[eé]minine|femminile|vrouwen|\(women\)|\(kvinder\)|\(damer\)|\(kvindefodbold\))\s*/gi, ' ')
    .replace(/\s+\b(women|kvinder|damer|dam)\b\s*$/gi, '')
    .replace(/\s+/g, ' ').trim();
}

// Søge-match: substring ELLER word-prefix for flerords-termer.
// "inter milan" finder "FC Internazionale Milano" fordi:
//   "inter" er prefix af "internazionale" OG "milan" er prefix af "milano"
// nameHay: søg altid i navn (normaliseret)
// secondaryHay: fødested eller klubber (kun i relevante views)
function matchesSearch(normTerm, nameHay, secondaryHay) {
  // 1. Eksakt match i navn
  if (nameHay.includes(normTerm)) return true;

  // 2. Multi-word: alle søgeord skal være prefix af et navneord
  //    "jesper kristensen" → finder "Jesper Juelsgård Kristensen"
  const termWords = normTerm.split(/\s+/).filter(w => w.length >= 2);
  if (termWords.length >= 2) {
    const nameWords = nameHay.split(/\s+/).filter(w => w.length >= 2);
    if (termWords.every(tw => nameWords.some(hw => hw.startsWith(tw)))) return true;
  }

  // 3. Sekundær søgning (fødested / klubber) — KUN hvis term ikke matchede navn
  if (secondaryHay && secondaryHay.includes(normTerm)) return true;

  return false;
}

// ===== Filter =====
function getFilteredPlayers() {
  const mapType = document.querySelector('input[name="map_type"]:checked').value;
  const gender = document.querySelector('input[name="gender"]:checked').value;
  const minBirthYear = Math.min(parseInt(document.getElementById('birth-year-min').value, 10), parseInt(document.getElementById('birth-year-max').value, 10));
  const maxBirthYear = Math.max(parseInt(document.getElementById('birth-year-min').value, 10), parseInt(document.getElementById('birth-year-max').value, 10));
  const minActiveYear = Math.min(parseInt(document.getElementById('active-year-min').value, 10), parseInt(document.getElementById('active-year-max').value, 10));
  const maxActiveYear = Math.max(parseInt(document.getElementById('active-year-min').value, 10), parseInt(document.getElementById('active-year-max').value, 10));
  const minMatches = Math.min(parseInt(document.getElementById('matches-min').value, 10), parseInt(document.getElementById('matches-max').value, 10));
  const maxMatches = Math.max(parseInt(document.getElementById('matches-min').value, 10), parseInt(document.getElementById('matches-max').value, 10));
  const searchTerm = document.getElementById('search').value.trim().toLowerCase();

  return allPlayers.filter(p => {
    if (minBirthYear > 1870 || maxBirthYear < 2010) {
      if (p.birthYear === null) return false;
      if (p.birthYear < minBirthYear || p.birthYear > maxBirthYear) return false;
    }
    if (minActiveYear > 1908 || maxActiveYear < 2026) {
      if (p.years_played.length === 0) return false;
      if (!p.years_played.some(y => y >= minActiveYear && y <= maxActiveYear)) return false;
    }
    if (p.n_matches < minMatches || p.n_matches > maxMatches) return false;
    if (gender !== 'alle' && p.gender !== gender) return false;

    if (mapType === 'birth') {
      const birthLevel = document.querySelector('input[name="birth_level"]:checked').value;
      if (birthLevel === 'city') {
        if (!p.lat || !p.lon || !p.birthPlaceLabel) return false;
      } else if (birthLevel === 'kommune') {
        if (!p.lat || !p.lon || !p.region) return false;
      } else if (birthLevel === 'region') {
        if (!p.region) return false;
      }
    } else if (mapType === 'all_clubs') {
      const hasAllClubs = p.allClubs && p.allClubs.length > 0;
      const hasFirstClub = p.latitude && p.longitude && p.klubnavn;
      if (!hasAllClubs && !hasFirstClub) return false;
    } else {
      if (!p.latitude || !p.longitude || !p.klubnavn) return false;
    }

    if (searchTerm) {
      const normTerm = normalize(searchTerm);
      if (mapType === 'all_clubs') {
        // Alle klubber: søg i navn + alle klubber
        if (!matchesSearch(normTerm, p._nameHay, p._clubHay)) return false;
      } else if (mapType === 'club') {
        // Barndomsklub: søg i navn + første klub (ikke fødested, ikke alle klubber)
        const firstClubHay = normalize(stripGender(p.klubnavn || ''));
        if (!matchesSearch(normTerm, p._nameHay, firstClubHay)) return false;
      } else {
        // Fødested / Region: søg i navn + fødested
        if (!matchesSearch(normTerm, p._nameHay, p._birthHay)) return false;
      }
    }

    return true;
  });
}

// ===== Update Map =====
function updateMap() {
  const mapType = document.querySelector('input[name="map_type"]:checked').value;
  const players = getFilteredPlayers();

  // Group by location
  let groups;
  const birthLevel = mapType === 'birth'
    ? document.querySelector('input[name="birth_level"]:checked').value
    : null;
  const clubLevel = mapType === 'club'
    ? document.querySelector('input[name="club_level"]:checked').value
    : null;
  const perCapita = ((mapType === 'birth' && (birthLevel === 'kommune' || birthLevel === 'region')) ||
    (mapType === 'club' && (clubLevel === 'kommune' || clubLevel === 'region')))
    && document.getElementById('per-capita-check').checked;

  if (mapType === 'all_clubs') {
    const searchTerm = document.getElementById('search').value.trim().toLowerCase();
    groups = groupAllClubs(players, searchTerm);
  } else {
    groups = groupPlayers(players, mapType, birthLevel, clubLevel);
  }

  const pinLabelEl = document.getElementById('count-label');

  if (mapType === 'club') {
    if (clubLevel === 'klub') {
      const minCP = parseInt(document.getElementById('min-club-players').value, 10);
      if (minCP > 1) groups = groups.filter(g => g.players.length >= minCP);
      pinLabelEl.textContent = 'klubber vist';
    } else {
      pinLabelEl.textContent = clubLevel === 'kommune' ? 'kommuner vist' : 'regioner vist';
    }
  } else if (mapType === 'birth') {
    if (birthLevel === 'city') {
      const minCP = parseInt(document.getElementById('min-club-players').value, 10);
      if (minCP > 1) groups = groups.filter(g => g.players.length >= minCP);
    }
    pinLabelEl.textContent = birthLevel === 'city' ? 'steder vist' : birthLevel === 'kommune' ? 'kommuner vist' : 'regioner vist';
  } else if (mapType === 'all_clubs') {
    const minCP = parseInt(document.getElementById('min-club-players').value, 10);
    if (minCP > 1) groups = groups.filter(g => g.players.length >= minCP);
    pinLabelEl.textContent = 'klubber vist';
  }

  document.getElementById('player-count').textContent = players.length;
  document.getElementById('pin-count').textContent = groups.length;

  // Choropleth-mode: brug GeoJSON-lag i stedet for pins
  if (mapType === 'birth' && (birthLevel === 'kommune' || birthLevel === 'region')) {
    markersLayer.clearLayers();
    const geoData = birthLevel === 'kommune' ? kommunerGeo : regionerGeo;
    buildChoropleth(groups, geoData, 'navn', perCapita);
    return;
  }
  if (mapType === 'club' && (clubLevel === 'kommune' || clubLevel === 'region')) {
    markersLayer.clearLayers();
    const geoData = clubLevel === 'kommune' ? kommunerGeo : regionerGeo;
    buildChoropleth(groups, geoData, 'navn', perCapita);
    return;
  }

  // Fjern evt. gammelt choropleth-lag og legend
  if (geoLayer) { map.removeLayer(geoLayer); geoLayer = null; }
  if (legendControl) { map.removeControl(legendControl); legendControl = null; }

  // Clear and rebuild markers
  markersLayer.clearLayers();

  const bounds = [];
  groups.forEach(group => {
    const marker = createMarker(group, mapType, birthLevel, perCapita);
    if (marker) {
      markersLayer.addLayer(marker);
      bounds.push([group.lat, group.lng]);
    }
  });

  // Auto-zoom to fit results when searching
  const searchTerm = document.getElementById('search').value.trim();
  if (searchTerm && bounds.length > 0 && bounds.length < 50) {
    if (bounds.length === 1) {
      map.setView(bounds[0], 10);
    } else {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }
}

// ===== Choropleth =====
function choroplethColor(value, maxValue) {
  // Interpoler fra hvid til dansk rød (#C8102E) via lys rød
  if (!value || maxValue === 0) return '#f0f0f0';
  const t = Math.min(value / maxValue, 1);
  // Gamma-korriger for at gøre farveforskelle mere synlige ved lave værdier
  const tg = Math.pow(t, 0.45);
  const r = Math.round(200 + (255 - 200) * (1 - tg));   // 255→200
  const g = Math.round(16  + (240 - 16)  * (1 - tg));   // 240→16
  const b = Math.round(46  + (240 - 46)  * (1 - tg));   // 240→46
  return `rgb(${r},${g},${b})`;
}

function buildChoropleth(groups, geoData, nameKey, perCapita) {
  // Byg opslag: navn → gruppe
  const groupByName = new Map(groups.map(g => [g.locName, g]));
  const maxValue = groups.reduce((m, g) => {
    const v = perCapita && g.befolkning ? g.players.length / g.befolkning * 1000 : g.players.length;
    return Math.max(m, v);
  }, 0);

  if (geoLayer) { map.removeLayer(geoLayer); geoLayer = null; }
  if (legendControl) { map.removeControl(legendControl); legendControl = null; }

  // Farveforklaring
  legendControl = L.control({ position: 'bottomright' });
  legendControl.onAdd = () => {
    const steps = 5;
    const labels = Array.from({ length: steps }, (_, i) => {
      const v = (maxValue * (i + 1) / steps);
      return perCapita ? v.toFixed(2) : Math.round(v);
    });
    const div = L.DomUtil.create('div', 'choropleth-legend');
    div.innerHTML = `
      <div class="legend-title">${perCapita ? 'Pr. 1.000 indb.' : 'Spillere'}</div>
      <div class="legend-bar"></div>
      <div class="legend-labels">
        <span>0</span>
        ${labels.map(l => `<span>${l}</span>`).join('')}
      </div>`;
    return div;
  };
  legendControl.addTo(map);

  geoLayer = L.geoJSON(geoData, {
    style: feature => {
      const name = feature.properties[nameKey];
      const group = groupByName.get(name);
      const value = group
        ? (perCapita && group.befolkning ? group.players.length / group.befolkning * 1000 : group.players.length)
        : 0;
      return {
        fillColor: choroplethColor(value, maxValue),
        fillOpacity: group ? 0.75 : 0.15,
        color: 'white',
        weight: 1.5,
        opacity: 0.8
      };
    },
    onEachFeature: (feature, layer) => {
      const name = feature.properties[nameKey];
      const group = groupByName.get(name);
      if (!group) {
        layer.bindTooltip(`${name}: ingen spillere`, { direction: 'auto', sticky: true });
        return;
      }
      const value = perCapita && group.befolkning
        ? (group.players.length / group.befolkning * 1000).toFixed(2)
        : group.players.length;
      const label = perCapita ? `${value} pr. 1.000 indb.` : `${value} spillere`;
      layer.bindTooltip(`<strong>${name}</strong><br>${label}`, {
        direction: 'auto',
        sticky: true,
        className: 'leaflet-tooltip'
      });
      layer.bindPopup(() => buildPopupHtml(group, 'birth'), {
        maxWidth: 340,
        minWidth: 260,
        closeButton: true,
        autoPan: false
      });
      layer.on('mouseover', () => layer.setStyle({ weight: 3, color: '#333' }));
      layer.on('mouseout', () => geoLayer.resetStyle(layer));
    }
  }).addTo(map);
}

const REGION_CENTERS = {
  'Region Nordjylland':  [57.05, 9.93],
  'Region Midtjylland':  [56.25, 9.50],
  'Region Syddanmark':   [55.35, 9.50],
  'Region Sjælland':     [55.47, 11.86],
  'Region Hovedstaden':  [55.77, 12.55]
};

// Befolkningstal fra Wikipedia (2025) + geografiske centre for alle 98 kommuner
const KOMMUNE_DATA = {
  "København":          { region: "Region Hovedstaden",  befolkning: 667099, lat: 55.6761, lon: 12.5683 },
  "Aarhus":             { region: "Region Midtjylland",  befolkning: 373388, lat: 56.1629, lon: 10.2039 },
  "Aalborg":            { region: "Region Nordjylland",  befolkning: 224612, lat: 57.0488, lon: 9.9217  },
  "Odense":             { region: "Region Syddanmark",   befolkning: 210803, lat: 55.4038, lon: 10.4024 },
  "Vejle":              { region: "Region Syddanmark",   befolkning: 122433, lat: 55.7113, lon: 9.5360  },
  "Esbjerg":            { region: "Region Syddanmark",   befolkning: 115157, lat: 55.4769, lon: 8.4592  },
  "Frederiksberg":      { region: "Region Hovedstaden",  befolkning: 105840, lat: 55.6797, lon: 12.5273 },
  "Randers":            { region: "Region Midtjylland",  befolkning: 100356, lat: 56.4608, lon: 10.0368 },
  "Silkeborg":          { region: "Region Midtjylland",  befolkning: 101574, lat: 56.1893, lon: 9.5491  },
  "Viborg":             { region: "Region Midtjylland",  befolkning:  97621, lat: 56.4533, lon: 9.3999  },
  "Horsens":            { region: "Region Midtjylland",  befolkning:  97921, lat: 55.8607, lon: 9.8502  },
  "Kolding":            { region: "Region Syddanmark",   befolkning:  95897, lat: 55.4904, lon: 9.4722  },
  "Roskilde":           { region: "Region Sjælland",     befolkning:  91623, lat: 55.6415, lon: 12.0803 },
  "Herning":            { region: "Region Midtjylland",  befolkning:  90006, lat: 56.1339, lon: 8.9726  },
  "Næstved":            { region: "Region Sjælland",     befolkning:  84895, lat: 55.2292, lon: 11.7604 },
  "Slagelse":           { region: "Region Sjælland",     befolkning:  80481, lat: 55.4023, lon: 11.3547 },
  "Gentofte":           { region: "Region Hovedstaden",  befolkning:  75076, lat: 55.7480, lon: 12.5392 },
  "Sønderborg":         { region: "Region Syddanmark",   befolkning:  74096, lat: 54.9095, lon: 9.7925  },
  "Holbæk":             { region: "Region Sjælland",     befolkning:  74490, lat: 55.7161, lon: 11.7134 },
  "Gladsaxe":           { region: "Region Hovedstaden",  befolkning:  70958, lat: 55.7323, lon: 12.4920 },
  "Skanderborg":        { region: "Region Midtjylland",  befolkning:  65760, lat: 56.0405, lon: 9.9278  },
  "Hjørring":           { region: "Region Nordjylland",  befolkning:  63311, lat: 57.4634, lon: 9.9819  },
  "Helsingør":          { region: "Region Hovedstaden",  befolkning:  64953, lat: 56.0362, lon: 12.6136 },
  "Køge":               { region: "Region Sjælland",     befolkning:  63335, lat: 55.4573, lon: 12.1806 },
  "Guldborgsund":       { region: "Region Sjælland",     befolkning:  59350, lat: 54.7716, lon: 11.8751 },
  "Svendborg":          { region: "Region Syddanmark",   befolkning:  60001, lat: 55.0607, lon: 10.6083 },
  "Aabenraa":           { region: "Region Syddanmark",   befolkning:  58621, lat: 55.0439, lon: 9.4181  },
  "Holstebro":          { region: "Region Midtjylland",  befolkning:  59201, lat: 56.3594, lon: 8.6166  },
  "Frederikshavn":      { region: "Region Nordjylland",  befolkning:  57882, lat: 57.4395, lon: 10.5360 },
  "Lyngby-Taarbæk":    { region: "Region Hovedstaden",  befolkning:  58713, lat: 55.7719, lon: 12.5038 },
  "Rudersdal":          { region: "Region Hovedstaden",  befolkning:  57342, lat: 55.8311, lon: 12.4978 },
  "Ringkøbing-Skjern":  { region: "Region Midtjylland",  befolkning:  55582, lat: 56.0877, lon: 8.2431  },
  "Haderslev":          { region: "Region Syddanmark",   befolkning:  55354, lat: 55.2525, lon: 9.4896  },
  "Høje-Taastrup":      { region: "Region Hovedstaden",  befolkning:  59059, lat: 55.6672, lon: 12.2736 },
  "Hillerød":           { region: "Region Hovedstaden",  befolkning:  54855, lat: 55.9307, lon: 12.3086 },
  "Hvidovre":           { region: "Region Hovedstaden",  befolkning:  53760, lat: 55.6476, lon: 12.4753 },
  "Faaborg-Midtfyn":   { region: "Region Syddanmark",   befolkning:  52284, lat: 55.0967, lon: 10.2417 },
  "Fredericia":         { region: "Region Syddanmark",   befolkning:  52616, lat: 55.5661, lon: 9.7530  },
  "Greve":              { region: "Region Sjælland",     befolkning:  53536, lat: 55.5896, lon: 12.2973 },
  "Ballerup":           { region: "Region Hovedstaden",  befolkning:  52939, lat: 55.7299, lon: 12.3626 },
  "Varde":              { region: "Region Syddanmark",   befolkning:  49410, lat: 55.6231, lon: 8.4803  },
  "Favrskov":           { region: "Region Midtjylland",  befolkning:  49359, lat: 56.3932, lon: 9.9461  },
  "Kalundborg":         { region: "Region Sjælland",     befolkning:  48103, lat: 55.6768, lon: 11.0896 },
  "Hedensted":          { region: "Region Midtjylland",  befolkning:  48167, lat: 55.7722, lon: 9.7033  },
  "Frederikssund":      { region: "Region Hovedstaden",  befolkning:  47052, lat: 55.8393, lon: 12.0657 },
  "Vordingborg":        { region: "Region Sjælland",     befolkning:  45057, lat: 55.0062, lon: 11.9067 },
  "Egedal":             { region: "Region Hovedstaden",  befolkning:  45563, lat: 55.7839, lon: 12.1958 },
  "Skive":              { region: "Region Midtjylland",  befolkning:  44328, lat: 56.5633, lon: 9.0253  },
  "Syddjurs":           { region: "Region Midtjylland",  befolkning:  44101, lat: 56.2617, lon: 10.6069 },
  "Thisted":            { region: "Region Nordjylland",  befolkning:  42698, lat: 56.9571, lon: 8.6926  },
  "Tårnby":             { region: "Region Hovedstaden",  befolkning:  44034, lat: 55.6253, lon: 12.5988 },
  "Vejen":              { region: "Region Syddanmark",   befolkning:  42702, lat: 55.4844, lon: 9.1430  },
  "Rødovre":            { region: "Region Hovedstaden",  befolkning:  44734, lat: 55.6820, lon: 12.4531 },
  "Ikast-Brande":       { region: "Region Midtjylland",  befolkning:  43009, lat: 56.1345, lon: 9.1558  },
  "Furesø":             { region: "Region Hovedstaden",  befolkning:  42540, lat: 55.8002, lon: 12.3659 },
  "Mariagerfjord":      { region: "Region Nordjylland",  befolkning:  41606, lat: 56.6509, lon: 9.9811  },
  "Fredensborg":        { region: "Region Hovedstaden",  befolkning:  42186, lat: 55.9718, lon: 12.4006 },
  "Gribskov":           { region: "Region Hovedstaden",  befolkning:  41797, lat: 56.0654, lon: 12.3060 },
  "Assens":             { region: "Region Syddanmark",   befolkning:  40469, lat: 55.2693, lon: 9.8993  },
  "Middelfart":         { region: "Region Syddanmark",   befolkning:  40318, lat: 55.5031, lon: 9.7374  },
  "Lolland":            { region: "Region Sjælland",     befolkning:  39122, lat: 54.7650, lon: 11.4930 },
  "Bornholm":           { region: "Region Hovedstaden",  befolkning:  38966, lat: 55.1000, lon: 14.9000 },
  "Jammerbugt":         { region: "Region Nordjylland",  befolkning:  37954, lat: 57.1559, lon: 9.5789  },
  "Faxe":               { region: "Region Sjælland",     befolkning:  37802, lat: 55.2565, lon: 12.1285 },
  "Brøndby":            { region: "Region Hovedstaden",  befolkning:  40401, lat: 55.6428, lon: 12.4329 },
  "Norddjurs":          { region: "Region Midtjylland",  befolkning:  36658, lat: 56.4917, lon: 10.6500 },
  "Tønder":             { region: "Region Syddanmark",   befolkning:  36399, lat: 54.9333, lon: 8.8667  },
  "Brønderslev":        { region: "Region Nordjylland",  befolkning:  36706, lat: 57.2698, lon: 9.9437  },
  "Vesthimmerland":     { region: "Region Nordjylland",  befolkning:  35818, lat: 56.7667, lon: 9.5167  },
  "Ringsted":           { region: "Region Sjælland",     befolkning:  36286, lat: 55.4440, lon: 11.7893 },
  "Odsherred":          { region: "Region Sjælland",     befolkning:  32225, lat: 55.8976, lon: 11.5870 },
  "Nyborg":             { region: "Region Syddanmark",   befolkning:  32329, lat: 55.3127, lon: 10.7891 },
  "Halsnæs":            { region: "Region Hovedstaden",  befolkning:  31633, lat: 55.9677, lon: 12.0009 },
  "Rebild":             { region: "Region Nordjylland",  befolkning:  30942, lat: 56.8299, lon: 9.9400  },
  "Sorø":               { region: "Region Sjælland",     befolkning:  30641, lat: 55.4303, lon: 11.5560 },
  "Nordfyn":            { region: "Region Syddanmark",   befolkning:  29342, lat: 55.4778, lon: 10.1557 },
  "Herlev":             { region: "Region Hovedstaden",  befolkning:  30784, lat: 55.7265, lon: 12.4393 },
  "Lejre":              { region: "Region Sjælland",     befolkning:  29594, lat: 55.6030, lon: 11.9740 },
  "Albertslund":        { region: "Region Hovedstaden",  befolkning:  28117, lat: 55.6602, lon: 12.3634 },
  "Billund":            { region: "Region Syddanmark",   befolkning:  27168, lat: 55.7296, lon: 9.0793  },
  "Allerød":            { region: "Region Hovedstaden",  befolkning:  26128, lat: 55.8723, lon: 12.3598 },
  "Hørsholm":           { region: "Region Hovedstaden",  befolkning:  25168, lat: 55.8822, lon: 12.4987 },
  "Solrød":             { region: "Region Sjælland",     befolkning:  24732, lat: 55.5407, lon: 12.2217 },
  "Kerteminde":         { region: "Region Syddanmark",   befolkning:  23949, lat: 55.4479, lon: 10.6597 },
  "Stevns":             { region: "Region Sjælland",     befolkning:  23612, lat: 55.3147, lon: 12.2467 },
  "Glostrup":           { region: "Region Hovedstaden",  befolkning:  24869, lat: 55.6658, lon: 12.3980 },
  "Odder":              { region: "Region Midtjylland",  befolkning:  24083, lat: 55.9762, lon: 10.1635 },
  "Ishøj":              { region: "Region Hovedstaden",  befolkning:  24365, lat: 55.6154, lon: 12.3508 },
  "Struer":             { region: "Region Midtjylland",  befolkning:  20229, lat: 56.4893, lon: 8.5789  },
  "Morsø":              { region: "Region Nordjylland",  befolkning:  19520, lat: 56.8333, lon: 8.7500  },
  "Lemvig":             { region: "Region Midtjylland",  befolkning:  18800, lat: 56.5500, lon: 8.3000  },
  "Vallensbæk":         { region: "Region Hovedstaden",  befolkning:  18322, lat: 55.6357, lon: 12.3764 },
  "Dragør":             { region: "Region Hovedstaden",  befolkning:  14450, lat: 55.5937, lon: 12.6683 },
  "Langeland":          { region: "Region Syddanmark",   befolkning:  11973, lat: 54.9500, lon: 10.8333 },
  "Ærø":                { region: "Region Syddanmark",   befolkning:   5881, lat: 54.8833, lon: 10.4167 },
  "Samsø":              { region: "Region Midtjylland",  befolkning:   3656, lat: 55.8667, lon: 10.6167 },
  "Fanø":               { region: "Region Syddanmark",   befolkning:   3270, lat: 55.4167, lon: 8.4000  },
  "Læsø":               { region: "Region Nordjylland",  befolkning:   1719, lat: 57.2667, lon: 11.0833 }
};

// Beregn region-befolkning som sum af kommuner
const REGION_BEFOLKNING = {};
Object.values(KOMMUNE_DATA).forEach(({ region, befolkning }) => {
  REGION_BEFOLKNING[region] = (REGION_BEFOLKNING[region] || 0) + befolkning;
});

// Point-in-polygon (ray casting) – virker for GeoJSON Polygon/MultiPolygon
function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInFeature(lon, lat, feature) {
  const geom = feature.geometry;
  if (!geom) return false;
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  for (const poly of polys) {
    if (pointInRing(lon, lat, poly[0])) return true;
  }
  return false;
}

// Knyt fødested til kommune via punkt-i-polygon på indlæst GeoJSON
// Fallback til nærmeste centrum hvis koordinat ikke falder i nogen polygon
function polygonArea(ring) {
  // Shoelace formula — approximate area (not geo-corrected, but fine for comparison)
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(area / 2);
}

function featureArea(feature) {
  const geom = feature.geometry;
  if (!geom) return Infinity;
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  return polys.reduce((sum, poly) => sum + polygonArea(poly[0]), 0);
}

function findRegion(lat, lon) {
  if (!lat || !lon || !regionerGeo) return null;
  for (const feature of regionerGeo.features) {
    if (pointInFeature(lon, lat, feature)) return feature.properties.navn;
  }
  return null;
}

function findNearestKommune(lat, lon) {
  if (!lat || !lon) return null;
  // 1) Point-in-polygon — pick smallest matching polygon (handles enclaves like Frederiksberg ⊂ København)
  if (kommunerGeo) {
    let bestFeature = null, bestArea = Infinity;
    for (const feature of kommunerGeo.features) {
      if (pointInFeature(lon, lat, feature)) {
        const area = featureArea(feature);
        if (area < bestArea) { bestArea = area; bestFeature = feature; }
      }
    }
    if (bestFeature) return bestFeature.properties.navn;
  }
  return null;
}

function groupPlayers(players, mapType, birthLevel, clubLevel) {
  const map = new Map();

  players.forEach(p => {
    let key, lat, lng, locName;

    if (mapType === 'birth' && birthLevel === 'city') {
      key = p.birthPlaceLabel;
      lat = p.lat;
      lng = p.lon;
      locName = p.birthPlaceLabel;
    } else if (mapType === 'birth' && birthLevel === 'kommune') {
      const k = findNearestKommune(p.lat, p.lon);
      if (!k || !KOMMUNE_DATA[k]) return;
      key = k;
      lat = KOMMUNE_DATA[k].lat;
      lng = KOMMUNE_DATA[k].lon;
      locName = k;
    } else if (mapType === 'birth' && birthLevel === 'region') {
      key = p.region;
      const center = REGION_CENTERS[p.region];
      lat = center ? center[0] : null;
      lng = center ? center[1] : null;
      locName = p.region;
    } else if (mapType === 'club' && clubLevel === 'kommune') {
      const k = findNearestKommune(p.latitude, p.longitude);
      if (!k || !KOMMUNE_DATA[k]) return;
      key = k;
      lat = KOMMUNE_DATA[k].lat;
      lng = KOMMUNE_DATA[k].lon;
      locName = k;
    } else if (mapType === 'club' && clubLevel === 'region') {
      const r = findRegion(p.latitude, p.longitude);
      if (!r) return;
      const center = REGION_CENTERS[r];
      if (!center) return;
      key = r;
      lat = center[0];
      lng = center[1];
      locName = r;
    } else {
      const klubKey = (p.klubnavn || '').toUpperCase();
      key = `${klubKey}|${p.latitude}|${p.longitude}`;
      lat = p.latitude;
      lng = p.longitude;
      locName = stripGender(p.klubnavn || '');
    }

    if (!map.has(key)) {
      const entry = {
        locName,
        lat,
        lng,
        players: [],
        // Club metadata (from first player)
        klub_logo: p.klub_logo,
        klub_website: p.klub_website,
        klub_dbu_url: p.klub_dbu_url
      };
      // Attach befolkning for kommune/region modes
      if ((mapType === 'birth' && birthLevel === 'kommune') || (mapType === 'club' && clubLevel === 'kommune')) {
        if (KOMMUNE_DATA[key]) entry.befolkning = KOMMUNE_DATA[key].befolkning;
      } else if ((mapType === 'birth' && birthLevel === 'region') || (mapType === 'club' && clubLevel === 'region')) {
        if (REGION_BEFOLKNING[key]) entry.befolkning = REGION_BEFOLKNING[key];
      }
      map.set(key, entry);
    }
    map.get(key).players.push(p);
  });

  // Sort players within each group by matches desc
  map.forEach(g => g.players.sort((a, b) => b.n_matches - a.n_matches));

  return Array.from(map.values());
}

// ===== All Clubs Grouping =====
function groupAllClubs(players, searchTerm) {
  const clubMap = new Map();

  // Klub-nøgle (prioritetsrækkefølge):
  //  1. Wikidata QID → semantisk korrekt gruppering (FC Bayern München = FC Bayern Munich)
  //  2. DBU klub_id  → præcis dansk klub
  //  3. navn|coords  → fallback (undgår falsk sammensmeltning, fx PSG + Stade Français)
  function clubKey(c) {
    if (c.team_qid != null) return `qid:${c.team_qid}`;
    if (c.klub_id != null)  return `id:${c.klub_id}`;
    return `${(c.klubnavn || '').toUpperCase()}|${c.latitude},${c.longitude}`;
  }

  // Haversine-afstand i km
  function distKm(lat1, lng1, lat2, lng2) {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  for (const player of players) {
    // Start med allClubs (kan være tom for preserved spillere)
    const clubs = player.allClubs ? [...player.allClubs] : [];

    // Første klub garanteres ALTID med — top-level koordinater bruges som fallback
    // selv hvis allClubs allerede har samme klub (men uden koordinater).
    // En allClubs-entry tæller kun som "allerede der" hvis den har gyldige koordinater —
    // ellers bruger vi de korrekte top-level koordinater i stedet.
    if (player.latitude && player.longitude && player.klubnavn) {
      const firstName = (player.klubnavn || '').toLowerCase();
      const firstKey  = clubKey(player);
      const alreadyInWithCoords = clubs.some(c =>
        (clubKey(c) === firstKey || (c.klubnavn || '').toLowerCase() === firstName)
        && c.latitude != null && c.longitude != null
      );
      if (!alreadyInWithCoords) {
        // Fjern evt. koordinatløs entry med samme navn (erstattes af top-level entry)
        const dupIdx = clubs.findIndex(c =>
          clubKey(c) === firstKey || (c.klubnavn || '').toLowerCase() === firstName
        );
        if (dupIdx !== -1) clubs.splice(dupIdx, 1);
        clubs.push({
          klub_id: player.klub_id,
          klubnavn: player.klubnavn,
          latitude: player.latitude,
          longitude: player.longitude,
          klub_logo: player.klub_logo,
          is_earliest: true
        });
      }
    }

    // Søgefilter: vis kun matchende klubber for denne spiller.
    // Søgning matcher mod stripped klubnavn (konsistent med det der vises på pin).
    // Bruger matchesSearch → word-prefix fanger fx "inter milan" → "fc internazionale milano".
    // Hvis søgningen matcher spillerens navn (ikke en klub), vis alle klubber som normalt.
    let visibleClubs = clubs;
    if (searchTerm) {
      const normTerm = normalize(searchTerm);
      const matchingClubs = clubs.filter(c => matchesSearch(normTerm, normalize(stripGender(c.klubnavn || '')), ''));
      if (matchingClubs.length > 0) visibleClubs = matchingClubs;
    }

    for (const club of visibleClubs) {
      if (!club.latitude || !club.longitude) continue;

      // For is_earliest-klubber: brug top-level koordinater (fra DBU-geocoded, step 05)
      // så pinnen sidder det SAMME sted som i "Første klub"-mode.
      // Undgår at Wikidata-koordinater (allClubs) afviger fra DBU-koordinater (top-level).
      const rawLat = (club.is_earliest && player.latitude) ? player.latitude : club.latitude;
      const rawLng = (club.is_earliest && player.longitude) ? player.longitude : club.longitude;

      const lat = typeof rawLat === 'number' ? rawLat : parseFloat(rawLat);
      const lng = typeof rawLng === 'number' ? rawLng : parseFloat(rawLng);

      // Merge-check: find eksisterende pin med samme (gender-strippede) navn inden for 10 km,
      // eller et pin hvis stripped navn er indeholdt i det andet inden for 50 km.
      // Fanger: Silkeborg IF med lidt forskellige koordinater, og kvindehold under herrehold.
      // locName bruger altid det gender-strippede navn, så "(kvinder)"/"(women)" aldrig vises.
      const clubName = stripGender((club.klubnavn || '').toLowerCase());
      let existingKey = null;
      for (const [k, g] of clubMap) {
        const gName = (g.locName || '').toLowerCase();
        const dist = distKm(g.lat, g.lng, lat, lng);
        // Exact-name merge within 10 km
        if (gName === clubName && dist < 10) { existingKey = k; break; }
        // Partial-name merge within 50 km:
        // 1) Substring: "real madrid" ⊂ "real madrid c.f."
        // 2) Word-prefix: "inter" er prefix af "internazionale" → Inter Milan ↔ FC Internazionale Milano
        if (dist < 50 && clubName.length >= 5 && gName.length >= 5) {
          if (gName.includes(clubName) || clubName.includes(gName)) { existingKey = k; break; }
          const wordsA = clubName.split(/\s+/).filter(w => w.length >= 4);
          const wordsB = gName.split(/\s+/).filter(w => w.length >= 4);
          // Kræv mindst 2 signifikante ord på BEGGE sider for at undgå
          // at "Vejle FC" (1 ord) fejlagtigt merger med "Vejle Kammeraterne".
          // "Inter Milan" (2 ord) ↔ "FC Internazionale Milano" (2 ord) virker stadig.
          if (wordsA.length >= 2 && wordsB.length >= 2 &&
              wordsA.every(wa => wordsB.some(wb => wb.startsWith(wa) || wa.startsWith(wb)))) {
            existingKey = k; break;
          }
        }
      }

      // Display-navn: title case, uden gender-suffiks
      const displayName = stripGender(club.klubnavn || '');
      const key = existingKey ?? clubKey(club);
      if (!clubMap.has(key)) {
        clubMap.set(key, {
          locName: displayName,
          lat,
          lng,
          klub_logo: club.klub_logo,
          klub_dbu_url: club.klub_id ? `https://www.dbu.dk/resultater/klub/${club.klub_id}/klubinfo` : null,
          players: []
        });
      }
      const g = clubMap.get(key);
      if (!g.players.some(pl => pl.dbuID === player.dbuID)) {
        g.players.push(player);
      }
    }
  }

  clubMap.forEach(g => g.players.sort((a, b) => b.n_matches - a.n_matches));
  const groups = Array.from(clubMap.values());

  // Jitter: spred pins der sidder på præcis samme koordinat i en cirkel.
  // Radius ~400m (0.004°) – lille nok til at det ser samlet ud, stor nok til at alle er klikbare.
  const coordGroups = new Map();
  for (const g of groups) {
    const key = `${g.lat},${g.lng}`;
    if (!coordGroups.has(key)) coordGroups.set(key, []);
    coordGroups.get(key).push(g);
  }
  for (const stack of coordGroups.values()) {
    if (stack.length < 2) continue;
    const r = 0.004; // grader ≈ 400 m
    stack.forEach((g, i) => {
      const angle = (2 * Math.PI * i) / stack.length;
      g.lat += r * Math.cos(angle);
      g.lng += r * Math.sin(angle);
    });
  }

  return groups;
}

// ===== Markers =====
function createMarker(group, mapType, birthLevel, perCapita) {
  const { lat, lng, locName, players } = group;
  if (!lat || !lng) return null;

  let marker;

  if (mapType === 'club' || mapType === 'all_clubs') {
    const logoUrl = group.klub_logo;
    const hasLogo = logoUrl && logoUrl.length > 0;

    if (hasLogo) {
      // Pre-check logo with Image to fall back to SVG badge on error
      const img = new Image();
      img.src = logoUrl;
      const icon = L.icon({
        iconUrl: logoUrl,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
      });
      marker = L.marker([lat, lng], { icon });

      // If logo fails to load, replace with SVG badge
      img.onerror = () => {
        const fullText = escapeHtml(locName);
        const badgeHtml = buildSvgBadge(fullText);
        const fallbackIcon = L.divIcon({
          className: '',
          html: badgeHtml,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          popupAnchor: [0, -15]
        });
        marker.setIcon(fallbackIcon);
      };
    } else {
      // Round badge resembling a logo - full name curved inside circle
      const fullText = escapeHtml(locName);
      const badgeHtml = buildSvgBadge(fullText);
      const icon = L.divIcon({
        className: '',
        html: badgeHtml,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
      });
      marker = L.marker([lat, lng], { icon });
    }

    marker.bindTooltip(`${locName} (${players.length})`, {
      direction: 'auto',
      className: 'leaflet-tooltip'
    });
  } else if (mapType === 'birth' && (birthLevel === 'kommune' || birthLevel === 'region')) {
    // Kommune / Region: cirkel med antal eller pr.-1000-tal
    const value = perCapita && group.befolkning
      ? (players.length / group.befolkning * 1000)
      : players.length;
    const baseSize = birthLevel === 'region' ? 60 : 44;
    const size = baseSize + Math.sqrt(value) * (perCapita ? 20 : (birthLevel === 'region' ? 2 : 3));
    const clampedSize = Math.max(36, Math.min(size, 110));
    const displayValue = perCapita
      ? value.toFixed(2)
      : players.length;
    const label = perCapita ? `${displayValue}/1k` : `${displayValue} spl.`;
    const shortName = birthLevel === 'region' ? locName.replace('Region ', '') : locName;
    const tooltipText = perCapita
      ? `${locName}: ${displayValue} pr. 1.000 indb. (${players.length} spillere)`
      : `${locName}: ${players.length} spillere`;
    const pct = group.totalPlayers > 0
      ? Math.round(players.length / group.totalPlayers * 100)
      : 0;
    const subLabel = perCapita ? `${pct}%` : '';
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:${clampedSize}px;height:${clampedSize}px;border-radius:50%;background:rgba(200,16,46,0.75);border:3px solid white;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;">
               ${subLabel ? `<span style="color:white;font-weight:bold;font-size:${Math.min(14, clampedSize/4)}px;line-height:1.1">${subLabel}</span>` : ''}
               <span style="color:white;font-size:${Math.min(10, clampedSize/5)}px;text-align:center;padding:0 3px;line-height:1.2">${label}</span>
               <span style="color:white;font-size:${Math.min(9, clampedSize/6)}px;text-align:center;padding:0 3px;line-height:1.2">${escapeHtml(shortName)}</span>
             </div>`,
      iconSize: [clampedSize, clampedSize],
      iconAnchor: [clampedSize / 2, clampedSize / 2],
      popupAnchor: [0, -clampedSize / 2]
    });
    marker = L.marker([lat, lng], { icon });
    marker.bindTooltip(tooltipText, { direction: 'auto' });
  } else {
    // Birth city: circle marker
    const radius = Math.sqrt(players.length) * 3 + 5;
    marker = L.circleMarker([lat, lng], {
      radius,
      color: 'white',
      fillColor: '#C8102E',
      fillOpacity: 0.6,
      weight: 2
    });
    marker.bindTooltip(`${locName} (${players.length})`, {
      direction: 'auto'
    });
  }

  marker.bindPopup(() => buildPopupHtml(group, mapType), {
    maxWidth: 340,
    minWidth: 260,
    closeButton: true,
    autoPan: false
  });

  return marker;
}

// ===== Popup HTML =====
function buildPopupHtml(group, mapType) {
  const { locName, players } = group;

  // Header
  let headerHtml = '';
  if (mapType === 'club' || mapType === 'all_clubs') {
    const logoUrl = group.klub_logo;
    const logoHtml = logoUrl
      ? `<img class="club-logo" src="${escapeHtml(logoUrl)}" onerror="this.style.display='none'" alt="">`
      : '';

    const klubSlug = slugify(locName);
    const nameHtml = klubSlugs.has(klubSlug)
      ? `<a href="/klub/${klubSlug}/">${escapeHtml(locName)}</a>`
      : escapeHtml(locName);

    headerHtml = `
      <div class="popup-header">
        ${logoHtml}
        <div class="location-name">${nameHtml}</div>
        <div class="player-total">${players.length} spillere</div>
      </div>`;
  } else {
    headerHtml = `
      <div class="popup-header">
        <div class="location-name"><a href="/by/${slugify(locName)}/">${escapeHtml(locName)}</a></div>
        <div class="player-total">${players.length} spillere</div>
      </div>`;
  }

  // Players list
  const isMobile = window.innerWidth <= 768;
  const maxVisible = isMobile ? 10 : players.length;
  const visiblePlayers = players.slice(0, maxVisible);
  const hiddenCount = players.length - visiblePlayers.length;

  const playersHtml = visiblePlayers.map(p => {
    const imgHtml = p.image
      ? `<img class="popup-player-img" src="${escapeHtml(p.image)}" onerror="this.style.display='none'" alt="">`
      : '';

    const birth = p.birthday_dbu || 'Ukendt';
    const stats = `Landskampe: ${p.n_matches} | Mål: ${p.n_goals}`;

    // Links
    const links = [];
    const wikiUrl = p.wikipediaURL_da || p.wikipediaURL_en;
    if (wikiUrl) {
      links.push(`<a href="${escapeHtml(wikiUrl)}" target="_blank" rel="noopener">Wikipedia</a>`);
    }
    if (p.dbuID) {
      links.push(`<a href="https://www.dbu.dk/landshold/landsholdsdatabasen/PlayerInfo/${p.dbuID}" target="_blank" rel="noopener">DBU</a>`);
    }


    return `
      <div class="popup-player">
        ${imgHtml}
        <div class="popup-player-info">
          <div class="popup-player-name"><a href="/spiller/${slugify(p.playerLabel)}-${p.dbuID}/" style="color:#C0392B;text-decoration:none;font-weight:inherit;display:inline-flex;align-items:center;gap:3px" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(p.playerLabel)}<svg width="11" height="11" viewBox="0 0 12 12" fill="none" style="flex-shrink:0;opacity:.7"><path d="M3 9L9 3M9 3H5M9 3V7" stroke="#C0392B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a></div>
          <div class="popup-player-detail">Født: ${escapeHtml(birth)}</div>
          <div class="popup-player-detail">${stats}</div>
          ${links.length ? `<div class="popup-player-links">${links.join(' ')}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="popup-wrapper">
      ${headerHtml}
      <div class="popup-players">${playersHtml}${hiddenCount > 0 ? `<div style="padding:8px 12px;color:#888;font-size:13px;text-align:center">... og ${hiddenCount} flere spillere</div>` : ''}</div>
    </div>`;
}

// ===== SVG Badge (curved text like DBU logo) =====
function buildSvgBadge(name) {
  // Split name: top arc and bottom arc
  const words = name.split(/\s+/);
  let topText, bottomText;
  if (words.length >= 2) {
    const mid = Math.ceil(words.length / 2);
    topText = words.slice(0, mid).join(' ');
    bottomText = words.slice(mid).join(' ');
  } else {
    topText = name;
    bottomText = '';
  }

  // Dynamic font size based on longest text
  const maxLen = Math.max(topText.length, bottomText.length);
  const fontSize = maxLen > 12 ? 3 : maxLen > 8 ? 3.5 : 4;

  return `<svg viewBox="0 0 30 30" width="30" height="30" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <path id="arc-top-${name.length}" d="M 4,15 A 11,11 0 0,1 26,15" fill="none"/>
      <path id="arc-bot-${name.length}" d="M 4,17 A 11,11 0 0,0 26,17" fill="none"/>
    </defs>
    <circle cx="15" cy="15" r="14" fill="#C8102E" stroke="white" stroke-width="2"/>
    <circle cx="15" cy="15" r="10.5" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.3"/>
    <text font-family="Inter,Arial,sans-serif" font-size="${fontSize}" font-weight="700" fill="white" text-anchor="middle" letter-spacing="0.3">
      <textPath href="#arc-top-${name.length}" startOffset="50%">${topText}</textPath>
    </text>
    ${bottomText ? `<text font-family="Inter,Arial,sans-serif" font-size="${fontSize}" font-weight="700" fill="white" text-anchor="middle" letter-spacing="0.3">
      <textPath href="#arc-bot-${name.length}" startOffset="50%">${bottomText}</textPath>
    </text>` : ''}
  </svg>`;
}

// ===== Missing Players Panel =====
let missingSortCol = null;
let missingSortAsc = true;

function initMissingPanel() {
  // Om kortet modal
  const omBtn = document.getElementById('om-btn');
  const omModal = document.getElementById('om-modal');
  const omClose = document.getElementById('om-close');
  omBtn.addEventListener('click', () => omModal.classList.add('open'));
  omClose.addEventListener('click', () => omModal.classList.remove('open'));
  omModal.addEventListener('click', (e) => { if (e.target === omModal) omModal.classList.remove('open'); });

  const btn = document.getElementById('show-missing-btn');
  const modal = document.getElementById('missing-modal');
  const closeBtn = document.getElementById('missing-close');

  btn.addEventListener('click', () => {
    populateMissingTable();
    modal.classList.add('open');
  });

  closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  // Filters
  document.getElementById('missing-filter-gender').addEventListener('change', populateMissingTable);
  document.getElementById('missing-filter-type').addEventListener('change', populateMissingTable);
  document.getElementById('missing-search').addEventListener('input', populateMissingTable);

  // Sortable headers
  document.querySelectorAll('#missing-table th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (missingSortCol === col) {
        missingSortAsc = !missingSortAsc;
      } else {
        missingSortCol = col;
        missingSortAsc = true;
      }
      document.querySelectorAll('#missing-table th[data-col]').forEach(t => t.classList.remove('sort-asc','sort-desc'));
      th.classList.add(missingSortAsc ? 'sort-asc' : 'sort-desc');
      populateMissingTable();
    });
  });
}

function populateMissingTable() {
  const tbody = document.getElementById('missing-tbody');
  const countEl = document.getElementById('missing-count');
  const filterGender = document.getElementById('missing-filter-gender').value;
  const filterType = document.getElementById('missing-filter-type').value;
  const searchVal = document.getElementById('missing-search').value.toLowerCase().trim();

  let missing = allPlayers.filter(p => {
    const noBirth = !p.lat || !p.lon || !p.birthPlaceLabel;
    const noClub = !p.latitude || !p.longitude || !p.klubnavn;
    if (!noBirth && !noClub) return false;
    if (filterGender !== 'alle' && p.gender !== filterGender) return false;
    if (filterType === 'birth' && !noBirth) return false;
    if (filterType === 'club' && !noClub) return false;
    if (searchVal && !((p.playerLabel || '').toLowerCase().includes(searchVal))) return false;
    return true;
  });

  // Sort
  if (missingSortCol) {
    missing = [...missing].sort((a, b) => {
      let va, vb;
      if (missingSortCol === 'name') { va = a.playerLabel || ''; vb = b.playerLabel || ''; }
      else if (missingSortCol === 'matches') { va = a.n_matches || 0; vb = b.n_matches || 0; }
      else if (missingSortCol === 'goals') { va = a.n_goals || 0; vb = b.n_goals || 0; }
      else if (missingSortCol === 'gender') { va = a.gender || ''; vb = b.gender || ''; }
      else { va = ''; vb = ''; }
      if (va < vb) return missingSortAsc ? -1 : 1;
      if (va > vb) return missingSortAsc ? 1 : -1;
      return 0;
    });
  }

  countEl.textContent = missing.length;

  const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfihPXtuif_-GwYUC0R-JG7sMlCsVgpl1JfWvsUvqoW3EYMFw/viewform';

  tbody.innerHTML = missing.map(p => {
    const wikiDa = p.wikipediaURL_da ? `<a href="${escapeHtml(p.wikipediaURL_da)}" target="_blank" rel="noopener">DA</a>` : '';
    const wikiEn = p.wikipediaURL_en ? `<a href="${escapeHtml(p.wikipediaURL_en)}" target="_blank" rel="noopener">EN</a>` : '';
    const wiki = [wikiDa, wikiEn].filter(Boolean).join(' / ') || '–';
    const dbuLink = p.dbuID ? `<a href="https://www.dbu.dk/landshold/landsholdsdatabasen/PlayerInfo/${p.dbuID}" target="_blank" rel="noopener">${p.dbuID}</a>` : '–';
    const gender = p.gender === 'mand' ? 'Mand' : p.gender === 'kvinde' ? 'Kvinde' : '–';
    const noBirth = !p.lat || !p.lon || !p.birthPlaceLabel;
    const noClub = !p.latitude || !p.longitude || !p.klubnavn;

    const playerName = encodeURIComponent(p.playerLabel || '');
    const retLink = `<a href="${formUrl}?usp=pp_url&entry.name=${playerName}" target="_blank" rel="noopener" class="missing-ret-link" title="Indsend rettelse/feedback">Ret</a>`;

    return `<tr>
      <td>${escapeHtml(p.playerLabel || '–')} ${retLink}</td>
      <td>${noBirth ? '<em class="missing-tag">mangler</em>' : escapeHtml(p.birthPlaceLabel)}</td>
      <td>${noClub ? '<em class="missing-tag">mangler</em>' : escapeHtml(p.klubnavn)}</td>
      <td>${wiki}</td>
      <td>${dbuLink}</td>
      <td>${gender}</td>
      <td>${p.n_matches || 0}</td>
      <td>${p.n_goals || 0}</td>
    </tr>`;
  }).join('');
}

// ===== Utility =====
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
