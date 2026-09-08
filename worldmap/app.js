// ===== State =====
let allPlayers = [];
let map;
let markersLayer;
let debounceTimer;
let cityPageSlugs = new Set();
let natSelected = '';
let fullLoaded = false;
let fullLoading = false;

// Pageviews filter
let pageviewsMap = null; // QID → views
const PV_STEPS = [0, 100000, 500000, 1000000, 2000000, 5000000, 10000000, 20000000, 50000000, 100000000];
const PV_LABELS = ['0', '100K', '500K', '1M', '2M', '5M', '10M', '20M', '50M', '100M'];

function getMinPageviews() {
  const step = parseInt(document.getElementById('min-pageviews').value, 10);
  return PV_STEPS[step] || 0;
}

function loadPageviewsData(cb) {
  if (pageviewsMap) { cb(); return; }
  fetch('most-read-data.json').then(r => r.json()).then(rows => {
    pageviewsMap = {};
    rows.forEach(p => { pageviewsMap[p.q] = p.views; });
    cb();
  });
}

const ACCENT = '#1B3A6B';

function getMinPlayers() {
  const v = parseInt(document.getElementById('min-players').value, 10);
  // Logarithmic: slider 0–100 → players 1–500
  return Math.round(Math.pow(500, v / 100));
}
const WIKI_BASE = 'https://en.wikipedia.org/wiki/';

// commons.wikimedia.org/wiki/Special:FilePath/... is a redirecting endpoint
// (301/302 chains) that Chrome blocks as an <img> source via ORB when the
// final response type doesn't match. Wikimedia's actual file storage is a
// deterministic md5(filename)-based path on upload.wikimedia.org, so we
// compute the direct CDN URL client-side instead (no redirects, no ORB).
// Minimal MD5 impl (public domain, Joseph Myers' md5.js), needed because
// Web Crypto's subtle.digest doesn't support MD5.
function md5cycle(x,k){var a=x[0],b=x[1],c=x[2],d=x[3];a=ff(a,b,c,d,k[0],7,-680876936);d=ff(d,a,b,c,k[1],12,-389564586);c=ff(c,d,a,b,k[2],17,606105819);b=ff(b,c,d,a,k[3],22,-1044525330);a=ff(a,b,c,d,k[4],7,-176418897);d=ff(d,a,b,c,k[5],12,1200080426);c=ff(c,d,a,b,k[6],17,-1473231341);b=ff(b,c,d,a,k[7],22,-45705983);a=ff(a,b,c,d,k[8],7,1770035416);d=ff(d,a,b,c,k[9],12,-1958414417);c=ff(c,d,a,b,k[10],17,-42063);b=ff(b,c,d,a,k[11],22,-1990404162);a=ff(a,b,c,d,k[12],7,1804603682);d=ff(d,a,b,c,k[13],12,-40341101);c=ff(c,d,a,b,k[14],17,-1502002290);b=ff(b,c,d,a,k[15],22,1236535329);a=gg(a,b,c,d,k[1],5,-165796510);d=gg(d,a,b,c,k[6],9,-1069501632);c=gg(c,d,a,b,k[11],14,643717713);b=gg(b,c,d,a,k[0],20,-373897302);a=gg(a,b,c,d,k[5],5,-701558691);d=gg(d,a,b,c,k[10],9,38016083);c=gg(c,d,a,b,k[15],14,-660478335);b=gg(b,c,d,a,k[4],20,-405537848);a=gg(a,b,c,d,k[9],5,568446438);d=gg(d,a,b,c,k[14],9,-1019803690);c=gg(c,d,a,b,k[3],14,-187363961);b=gg(b,c,d,a,k[8],20,1163531501);a=gg(a,b,c,d,k[13],5,-1444681467);d=gg(d,a,b,c,k[2],9,-51403784);c=gg(c,d,a,b,k[7],14,1735328473);b=gg(b,c,d,a,k[12],20,-1926607734);a=hh(a,b,c,d,k[5],4,-378558);d=hh(d,a,b,c,k[8],11,-2022574463);c=hh(c,d,a,b,k[11],16,1839030562);b=hh(b,c,d,a,k[14],23,-35309556);a=hh(a,b,c,d,k[1],4,-1530992060);d=hh(d,a,b,c,k[4],11,1272893353);c=hh(c,d,a,b,k[7],16,-155497632);b=hh(b,c,d,a,k[10],23,-1094730640);a=hh(a,b,c,d,k[13],4,681279174);d=hh(d,a,b,c,k[0],11,-358537222);c=hh(c,d,a,b,k[3],16,-722521979);b=hh(b,c,d,a,k[6],23,76029189);a=hh(a,b,c,d,k[9],4,-640364487);d=hh(d,a,b,c,k[12],11,-421815835);c=hh(c,d,a,b,k[15],16,530742520);b=hh(b,c,d,a,k[2],23,-995338651);a=ii(a,b,c,d,k[0],6,-198630844);d=ii(d,a,b,c,k[7],10,1126891415);c=ii(c,d,a,b,k[14],15,-1416354905);b=ii(b,c,d,a,k[5],21,-57434055);a=ii(a,b,c,d,k[12],6,1700485571);d=ii(d,a,b,c,k[3],10,-1894986606);c=ii(c,d,a,b,k[10],15,-1051523);b=ii(b,c,d,a,k[1],21,-2054922799);a=ii(a,b,c,d,k[8],6,1873313359);d=ii(d,a,b,c,k[15],10,-30611744);c=ii(c,d,a,b,k[6],15,-1560198380);b=ii(b,c,d,a,k[13],21,1309151649);a=ii(a,b,c,d,k[4],6,-145523070);d=ii(d,a,b,c,k[11],10,-1120210379);c=ii(c,d,a,b,k[2],15,718787259);b=ii(b,c,d,a,k[9],21,-343485551);x[0]=add32(a,x[0]);x[1]=add32(b,x[1]);x[2]=add32(c,x[2]);x[3]=add32(d,x[3]);}
function cmn(q,a,b,x,s,t){a=add32(add32(a,q),add32(x,t));return add32((a<<s)|(a>>>(32-s)),b);}
function ff(a,b,c,d,x,s,t){return cmn((b&c)|((~b)&d),a,b,x,s,t);}
function gg(a,b,c,d,x,s,t){return cmn((b&d)|(c&(~d)),a,b,x,s,t);}
function hh(a,b,c,d,x,s,t){return cmn(b^c^d,a,b,x,s,t);}
function ii(a,b,c,d,x,s,t){return cmn(c^(b|(~d)),a,b,x,s,t);}
function md51(s){var n=s.length,state=[1732584193,-271733879,-1732584194,271733878],i;for(i=64;i<=n;i+=64)md5cycle(state,md5blk(s.substring(i-64,i)));s=s.substring(i-64);var tail=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(i=0;i<s.length;i++)tail[i>>2]|=s.charCodeAt(i)<<((i%4)<<3);tail[i>>2]|=0x80<<((i%4)<<3);if(i>55){md5cycle(state,tail);for(i=0;i<16;i++)tail[i]=0;}tail[14]=n*8;md5cycle(state,tail);return state;}
function md5blk(s){var md5blks=[],i;for(i=0;i<64;i+=4){md5blks[i>>2]=s.charCodeAt(i)+(s.charCodeAt(i+1)<<8)+(s.charCodeAt(i+2)<<16)+(s.charCodeAt(i+3)<<24);}return md5blks;}
var hex_chr='0123456789abcdef'.split('');
function rhex(n){var s='',j=0;for(;j<4;j++)s+=hex_chr[(n>>(j*8+4))&0x0F]+hex_chr[(n>>(j*8))&0x0F];return s;}
function hex(x){for(var i=0;i<x.length;i++)x[i]=rhex(x[i]);return x.join('');}
function add32(a,b){return (a+b)&0xFFFFFFFF;}
function md5(s){return hex(md51(unescape(encodeURIComponent(s))));}

function wikiImageUrl(filename) {
  // Note: Wikimedia's /thumb/.../{width}px-... resize path returned 400s
  // in testing for these filenames (likely needs an uncached render pass
  // via commons.wikimedia.org rather than the raw upload CDN), so we use
  // the full-resolution file directly. Callers should keep loading="lazy".
  if (!filename) return '';
  const h = md5(filename);
  const encoded = encodeURIComponent(filename);
  return `https://upload.wikimedia.org/wikipedia/commons/${h[0]}/${h.slice(0,2)}/${encoded}`;
}

function slugify(s) {
  return (s || '').toLowerCase()
    .replace(/[àáâãäå]/g,'a').replace(/[èéêë]/g,'e').replace(/[ìíîï]/g,'i')
    .replace(/[òóôõöø]/g,'o').replace(/[ùúûü]/g,'u').replace(/[ýÿ]/g,'y')
    .replace(/[ñ]/g,'n').replace(/[ç]/g,'c').replace(/[ß]/g,'ss')
    .replace(/[æ]/g,'ae').replace(/[ø]/g,'oe').replace(/[å]/g,'aa')
    .replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
}

function citySlug(city, country) {
  return slugify(city) + '-' + slugify(country);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  initSidebar();
  initControls();
  await loadData();
  updateMap();
});

// ===== Helpers =====
function normalize(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function updateDualSliderFill(container, minEl, maxEl) {
  const min = parseFloat(minEl.min), max = parseFloat(minEl.max);
  const lo = Math.min(parseFloat(minEl.value), parseFloat(maxEl.value));
  const hi = Math.max(parseFloat(minEl.value), parseFloat(maxEl.value));
  container.style.setProperty('--fill-lo', ((lo - min) / (max - min)) * 100 + '%');
  container.style.setProperty('--fill-hi', ((hi - min) / (max - min)) * 100 + '%');
}

function updateSingleSliderFill(el) {
  const min = parseFloat(el.min), max = parseFloat(el.max);
  const pct = ((parseFloat(el.value) - min) / (max - min)) * 100;
  el.style.setProperty('--fill-pct', pct + '%');
}

// ===== Map =====
function initMap() {
  const isMobile = window.innerWidth <= 768;
  map = L.map('map', {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 18,
    tap: true,
    tapTolerance: 15,
    scrollWheelZoom: !isMobile
  }).setView([20, 10], 2);

  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // Was a plain L.layerGroup() with no clustering, so the whole-world default
  // view rendered ~14,000 city-group circle markers directly into the DOM —
  // an unreadable, untappable mess and a serious mobile perf hit. Cluster
  // like the main map, scaling radius down and disabling clustering once
  // zoomed in enough for individual pins to be usefully tappable.
  markersLayer = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    showCoverageOnHover: false,
    maxClusterRadius: (zoom) => (zoom <= 4 ? 80 : zoom <= 7 ? 55 : zoom <= 9 ? 35 : 20),
    disableClusteringAtZoom: 11,
    spiderfyDistanceMultiplier: 2.0,
    iconCreateFunction: (cluster) => {
      const count = cluster.getChildCount();
      const size = Math.min(56, 30 + Math.sqrt(count) * 3.5);
      return L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(27,58,107,0.85);border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4);color:white;font-weight:700;font-size:${size > 44 ? 13 : 11}px;cursor:pointer;">${count >= 1000 ? Math.round(count/1000) + 'k' : count}</div>`,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });
    }
  });
  map.addLayer(markersLayer);
}

// ===== Sidebar =====
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  const handle = document.getElementById('sidebar-drag-handle');
  const mobileToggle = document.getElementById('sidebar-toggle-mobile');

  const openSheet = () => sidebar.classList.add('open');
  const closeSheet = () => sidebar.classList.remove('open');

  toggle.addEventListener('click', () => {
    if (window.innerWidth <= 768) openSheet();
    else sidebar.classList.toggle('open');
  });
  if (mobileToggle) mobileToggle.addEventListener('click', openSheet);
  if (handle) handle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSheet() : openSheet();
  });

  let touchStartY = 0;
  sidebar.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
  sidebar.addEventListener('touchend', e => {
    if (e.changedTouches[0].clientY - touchStartY < -40) openSheet();
  }, { passive: true });
  sidebar.addEventListener('click', e => {
    if (window.innerWidth <= 768 && !sidebar.classList.contains('open')) openSheet();
  });
  map.on('click', () => { if (window.innerWidth <= 768) closeSheet(); });

  const searchDesktop = document.getElementById('search');
  const searchMobile = document.getElementById('search-mobile');
  if (searchMobile) {
    searchMobile.addEventListener('input', () => { searchDesktop.value = searchMobile.value; debouncedUpdate(); });
    searchDesktop.addEventListener('input', () => { searchMobile.value = searchDesktop.value; });
  }
}

// ===== Controls =====
function initControls() {
  document.querySelectorAll('input[name="gender"]').forEach(el => el.addEventListener('change', debouncedUpdate));
  document.getElementById('country-select').addEventListener('input', debouncedUpdate);
  document.getElementById('search').addEventListener('input', debouncedUpdate);

  // Position info-tooltip within sidebar bounds
  document.querySelectorAll('.info-icon').forEach(icon => {
    const tip = icon.querySelector('.info-tooltip');
    if (!tip) return;
    icon.addEventListener('mouseenter', () => {
      const sidebar = document.getElementById('sidebar');
      const sRect = sidebar.getBoundingClientRect();
      const iRect = icon.getBoundingClientRect();
      tip.style.visibility = 'hidden';
      tip.style.display = 'block';
      const tipH = tip.offsetHeight;
      tip.style.display = '';
      tip.style.visibility = '';
      const spaceAbove = iRect.top - 8;
      if (spaceAbove >= tipH) {
        tip.style.top = (iRect.top - tipH - 8) + 'px';
      } else {
        tip.style.top = (iRect.bottom + 8) + 'px';
      }
      tip.style.left = (sRect.left + 16) + 'px';
      tip.style.width = (sRect.width - 32) + 'px';
    });
  });

  // Birth year dual slider
  const byMin = document.getElementById('birth-year-min');
  const byMax = document.getElementById('birth-year-max');
  const byLabel = document.getElementById('birth-year-range-label');
  const byContainer = byMin.parentElement;

  function updateBirthYearLabel() {
    const lo = Math.min(parseInt(byMin.value), parseInt(byMax.value));
    const hi = Math.max(parseInt(byMin.value), parseInt(byMax.value));
    byLabel.textContent = `${lo} – ${hi}`;
    updateDualSliderFill(byContainer, byMin, byMax);
  }

  byMin.addEventListener('input', () => {
    if (parseInt(byMin.value) > parseInt(byMax.value)) byMin.value = byMax.value;
    updateBirthYearLabel();
    debouncedUpdate();
  });
  byMax.addEventListener('input', () => {
    if (parseInt(byMax.value) < parseInt(byMin.value)) byMax.value = byMin.value;
    updateBirthYearLabel();
    debouncedUpdate();
  });
  updateBirthYearLabel();

  const sitelinksEl = document.getElementById('min-sitelinks');
  const sitelinksLabel = document.getElementById('sitelinks-label');
  updateSingleSliderFill(sitelinksEl);
  sitelinksEl.addEventListener('input', () => {
    sitelinksLabel.textContent = sitelinksEl.value;
    updateSingleSliderFill(sitelinksEl);
    if (parseInt(sitelinksEl.value) < 40 && !fullLoaded) loadFull();
    else debouncedUpdate();
  });

  const pvEl = document.getElementById('min-pageviews');
  const pvLabel = document.getElementById('pageviews-label');
  updateSingleSliderFill(pvEl);
  pvEl.addEventListener('input', () => {
    const step = parseInt(pvEl.value, 10);
    pvLabel.textContent = PV_LABELS[step];
    updateSingleSliderFill(pvEl);
    if (step > 0) {
      loadPageviewsData(() => debouncedUpdate());
    } else {
      debouncedUpdate();
    }
  });

  const minPlayersEl = document.getElementById('min-players');
  const minPlayersLabel = document.getElementById('min-players-label');
  minPlayersEl.min = 0; minPlayersEl.max = 100; minPlayersEl.value = 0;
  updateSingleSliderFill(minPlayersEl);
  minPlayersEl.addEventListener('input', () => {
    minPlayersLabel.textContent = getMinPlayers();
    updateSingleSliderFill(minPlayersEl);
    debouncedUpdate();
  });
}

function debouncedUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(updateMap, 200);
}

// ===== Load Data =====
function expandPlayer(p) {
  p.qid        = p.q;
  p.name       = p.n;
  p.city       = p.c;
  p.lat        = p.la;
  p.lon        = p.lo;
  p.gender     = p.g === 'm' ? 'male' : p.g === 'f' ? 'female' : 'unknown';
  p.notability = p.s;
  p.birth_year = p.y;
  p.nationality= p.nat;
  p.country    = p.co;
  p.slug       = p.sl;
  if (p.w) p.wiki  = WIKI_BASE + p.w;
  if (p.i) p.image = wikiImageUrl(p.i);
  return p;
}

async function loadFull() {
  if (fullLoaded || fullLoading) return;
  fullLoading = true;
  const resp = await fetch('players-full.json');
  const raw  = await resp.json();
  const byQid = new Map(allPlayers.map(p => [p.qid, p]));
  for (const p of raw) {
    if (!byQid.has(p.q)) { byQid.set(p.q, expandPlayer(p)); }
  }
  allPlayers = Array.from(byQid.values());
  fullLoaded  = true;
  fullLoading = false;
  document.getElementById('total-label').textContent = allPlayers.length.toLocaleString('da-DK');
  updateMap();
}

async function loadData() {
  const loadingEl = document.getElementById('loading-overlay');
  if (loadingEl) loadingEl.style.display = 'flex';

  const resp = await fetch('players.json');
  const raw = await resp.json();

  for (const p of raw) expandPlayer(p);

  // Deduplicate on QID
  const byQid = new Map();
  for (const p of raw) {
    if (!byQid.has(p.qid)) byQid.set(p.qid, p);
  }
  allPlayers = Array.from(byQid.values());

  // Build set of city slugs that have a subpage (5+ players)
  const cityCount = new Map();
  for (const p of allPlayers) {
    if (p.slug) cityCount.set(p.slug, (cityCount.get(p.slug) || 0) + 1);
  }
  for (const [slug, count] of cityCount) {
    if (count >= 5) cityPageSlugs.add(slug);
  }

  if (loadingEl) loadingEl.style.display = 'none';

  document.getElementById('total-label').textContent = allPlayers.length.toLocaleString('da-DK');

  // Nationality autocomplete
  const allNationalities = [...new Set(allPlayers.map(p => p.nationality).filter(Boolean))].sort();
  const natInput = document.getElementById('country-select');
  const natDropdown = document.getElementById('country-dropdown');
  function renderDropdown(term) {
    const norm = normalize(term);
    const matches = norm
      ? allNationalities.filter(n => normalize(n).includes(norm))
      : allNationalities;
    natDropdown.innerHTML = '';
    if (!matches.length) { natDropdown.style.display = 'none'; return; }
    if (!norm) {
      const all = document.createElement('div');
      all.textContent = 'All nationalities';
      all.style.cssText = 'padding:8px 12px;cursor:pointer;color:#888;font-style:italic';
      all.addEventListener('mousedown', () => { natInput.value = ''; natSelected = ''; natDropdown.style.display = 'none'; debouncedUpdate(); });
      natDropdown.appendChild(all);
    }
    matches.slice(0, 80).forEach(n => {
      const el = document.createElement('div');
      el.textContent = n;
      el.style.cssText = 'padding:8px 12px;cursor:pointer';
      el.addEventListener('mouseover', () => el.style.background = '#eef2f9');
      el.addEventListener('mouseout',  () => el.style.background = '');
      el.addEventListener('mousedown', () => {
        natInput.value = n; natSelected = n;
        natDropdown.style.display = 'none';
        debouncedUpdate();
      });
      natDropdown.appendChild(el);
    });
    natDropdown.style.display = 'block';
  }

  natInput.addEventListener('focus', () => renderDropdown(natInput.value));
  natInput.addEventListener('input', () => { natSelected = ''; renderDropdown(natInput.value); debouncedUpdate(); });
  natInput.addEventListener('blur',  () => setTimeout(() => { natDropdown.style.display = 'none'; }, 150));
  document.addEventListener('click', e => { if (!natInput.contains(e.target) && !natDropdown.contains(e.target)) natDropdown.style.display = 'none'; });
}

// ===== Filter =====
function getFiltered() {
  const gender = document.querySelector('input[name="gender"]:checked').value;
  const country = document.getElementById('country-select').value;
  const minNotability = parseInt(document.getElementById('min-sitelinks').value, 10);
  const minPV = getMinPageviews();
  const searchTerm = normalize(document.getElementById('search').value.trim());
  const minBY = Math.min(parseInt(document.getElementById('birth-year-min').value), parseInt(document.getElementById('birth-year-max').value));
  const maxBY = Math.max(parseInt(document.getElementById('birth-year-min').value), parseInt(document.getElementById('birth-year-max').value));
  const birthYearActive = minBY > 1800 || maxBY < 2019;

  return allPlayers.filter(p => {
    if (gender !== 'alle' && p.gender !== gender) return false;
    if (country && !normalize(p.nationality).includes(normalize(natSelected || country))) return false;
    if ((p.notability ?? 0) < minNotability) return false;
    if (minPV > 0) {
      const views = pageviewsMap ? (pageviewsMap[p.qid] || 0) : 0;
      if (views < minPV) return false;
    }
    if (birthYearActive) {
      if (!p.birth_year) return false;
      if (p.birth_year < minBY || p.birth_year > maxBY) return false;
    }
    if (searchTerm) {
      const nameMatch = normalize(p.name).includes(searchTerm);
      const cityMatch = normalize(p.city).includes(searchTerm);
      const natMatch  = normalize(p.nationality).includes(searchTerm);
      if (!nameMatch && !cityMatch && !natMatch) return false;
    }
    return true;
  });
}

// ===== Group by city =====
function groupByCity(players) {
  const cityMap = new Map();
  for (const p of players) {
    if (!p.lat || !p.lon) continue;
    const key = `${Math.round(p.lat * 100) / 100},${Math.round(p.lon * 100) / 100}`;
    if (!cityMap.has(key)) {
      cityMap.set(key, { city: p.city, nat: p.country || p.nationality, slug: p.slug, lat: p.lat, lon: p.lon, players: [] });
    }
    cityMap.get(key).players.push(p);
  }
  cityMap.forEach(g => g.players.sort((a, b) => b.notability - a.notability));
  return Array.from(cityMap.values());
}

// ===== Update Map =====
function updateMap() {
  const filtered = getFiltered();
  let groups = groupByCity(filtered);

  const minPlayers = getMinPlayers();
  if (minPlayers > 1) groups = groups.filter(g => g.players.length >= minPlayers);

  document.getElementById('player-count').textContent = filtered.length.toLocaleString('da-DK');
  document.getElementById('pin-count').textContent = groups.length.toLocaleString('da-DK');

  markersLayer.clearLayers();

  const bounds = [];
  for (const group of groups) {
    const marker = createMarker(group);
    if (marker) {
      markersLayer.addLayer(marker);
      bounds.push([group.lat, group.lon]);
    }
  }

  const searchTerm = document.getElementById('search').value.trim();
  if (searchTerm && bounds.length > 0 && bounds.length < 50) {
    if (bounds.length === 1) map.setView(bounds[0], 10);
    else map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
  }
}

// ===== Marker =====
function createMarker(group) {
  const { lat, lon, city, nat, players } = group;
  const radius = Math.min(Math.sqrt(players.length) * 3 + 5, 30);

  const marker = L.circleMarker([lat, lon], {
    radius,
    color: 'white',
    fillColor: ACCENT,
    fillOpacity: 0.65,
    weight: 2
  });

  marker.bindTooltip(`${escapeHtml(city)}, ${escapeHtml(nat)} (${players.length})`, {
    direction: 'auto',
    className: 'leaflet-tooltip'
  });

  const isMob = window.innerWidth <= 768;
  if (isMob) {
    marker.on('click', () => openMobilePopup(group));
  } else {
    marker.bindPopup(() => buildPopupHtml(group), {
      maxWidth: 320,
      minWidth: 240,
      closeButton: true,
      autoPan: true,
      autoPanPadding: L.point(40, 80)
    });
  }

  return marker;
}

// ===== Popup =====
function buildPopupHtml(group) {
  const { city, nat, slug, players } = group;
  const isMobile = window.innerWidth <= 768;
  const maxVisible = isMobile ? 10 : Math.min(players.length, 30);
  const visible = players.slice(0, maxVisible);
  const hidden = players.length - visible.length;

  const playersHtml = visible.map(p => {
    const imgHtml = p.image
      ? `<img class="popup-player-img" src="${escapeHtml(p.image)}" onerror="this.style.display='none'" alt="${escapeHtml(p.name || '')}" style="width:44px;height:44px;object-fit:cover;border-radius:50%;flex-shrink:0">`
      : '';

    return `
    <div class="popup-player" style="display:flex;align-items:flex-start;gap:10px">
      ${imgHtml}
      <div class="popup-player-info">
        <div class="popup-player-name">
          ${p.wiki && !p.wiki.includes('Special:EntityPage') ? `
          <a href="${escapeHtml(p.wiki)}" target="_blank" rel="noopener"
             style="color:${ACCENT};text-decoration:none;font-weight:600"
             onmouseover="this.style.textDecoration='underline'"
             onmouseout="this.style.textDecoration='none'">
            ${escapeHtml(p.name)}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style="opacity:.6;vertical-align:middle">
              <path d="M3 9L9 3M9 3H5M9 3V7" stroke="${ACCENT}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </a>` : `<span style="font-weight:600">${escapeHtml(p.name)}</span>`}
        </div>
        ${p.city ? `<div class="popup-player-detail" style="color:var(--gray-500);font-size:12px"><strong>Birthplace:</strong> ${
          p.slug && cityPageSlugs.has(p.slug)
            ? `<a href="/worldmap/city/${p.slug}/" style="color:${ACCENT};text-decoration:none" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(p.city)}</a>`
            : escapeHtml(p.city)
        }</div>` : ''}
        ${p.birth_year && p.birth_year > 1800 ? `<div class="popup-player-detail" style="color:var(--gray-500);font-size:12px"><strong>Birth year:</strong> ${p.birth_year}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  return `
    <div class="popup-wrapper">
      <div class="popup-header">
        <div class="location-name">${
          slug && cityPageSlugs.has(slug)
            ? `<a href="/worldmap/city/${slug}/" style="color:inherit;text-decoration:none;border-bottom:2px solid ${ACCENT}22" onmouseover="this.style.borderBottomColor='${ACCENT}'" onmouseout="this.style.borderBottomColor='${ACCENT}22'">${escapeHtml(city)}</a>`
            : escapeHtml(city)
        }</div>
        <div class="player-total">${escapeHtml(nat)} · ${players.length} players</div>
      </div>
      <div class="popup-players">
        ${playersHtml}
        ${hidden > 0 ? `<div style="padding:8px 12px;color:#888;font-size:13px;text-align:center">... and ${hidden} more</div>` : ''}
      </div>
    </div>`;
}

// ===== Mobile Popup =====
function openMobilePopup(group) {
  const panel = document.getElementById('mobile-popup-panel');
  const overlay = document.getElementById('mobile-popup-overlay');
  const content = document.getElementById('mobile-popup-content');
  if (!panel) return;
  content.innerHTML = buildPopupHtml(group);
  overlay.classList.add('open');
  panel.classList.add('open');
  overlay.onclick = closeMobilePopup;
  let startY = 0;
  panel.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true, once: true });
  panel.addEventListener('touchend', e => {
    if (e.changedTouches[0].clientY - startY > 60) closeMobilePopup();
  }, { passive: true, once: true });
}

function closeMobilePopup() {
  document.getElementById('mobile-popup-panel')?.classList.remove('open');
  document.getElementById('mobile-popup-overlay')?.classList.remove('open');
}
