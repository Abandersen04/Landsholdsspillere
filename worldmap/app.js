// ===== State =====
let allPlayers = [];
let map;
let markersLayer;
let debounceTimer;
let cityPageSlugs = new Set();

const ACCENT = '#1B3A6B';
const WIKI_BASE = 'https://en.wikipedia.org/wiki/';
const IMG_BASE  = 'https://commons.wikimedia.org/wiki/Special:FilePath/';

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

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  markersLayer = L.layerGroup();
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
    debouncedUpdate();
  });

  const minPlayersEl = document.getElementById('min-players');
  const minPlayersLabel = document.getElementById('min-players-label');
  updateSingleSliderFill(minPlayersEl);
  minPlayersEl.addEventListener('input', () => {
    minPlayersLabel.textContent = minPlayersEl.value;
    updateSingleSliderFill(minPlayersEl);
    debouncedUpdate();
  });
}

function debouncedUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(updateMap, 200);
}

// ===== Load Data =====
async function loadData() {
  const loadingEl = document.getElementById('loading-overlay');
  if (loadingEl) loadingEl.style.display = 'flex';

  const resp = await fetch('players.json');
  const raw = await resp.json();

  // Expand short keys
  for (const p of raw) {
    p.qid        = p.q;
    p.name       = p.n;
    p.city       = p.c;
    p.lat        = p.la;
    p.lon        = p.lo;
    p.gender     = p.g === 'm' ? 'male' : p.g === 'f' ? 'female' : 'unknown';
    p.notability = p.s;
    p.birth_year = p.y;
    p.nationality= p.nat;
    p.slug       = p.sl;
    if (p.w) p.wiki  = WIKI_BASE + p.w;
    if (p.i) p.image = IMG_BASE + encodeURIComponent(p.i).replace(/%20/g, '_');
  }

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
  let natSelected = '';

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
  const searchTerm = normalize(document.getElementById('search').value.trim());
  const minBY = Math.min(parseInt(document.getElementById('birth-year-min').value), parseInt(document.getElementById('birth-year-max').value));
  const maxBY = Math.max(parseInt(document.getElementById('birth-year-min').value), parseInt(document.getElementById('birth-year-max').value));
  const birthYearActive = minBY > 1800 || maxBY < 2019;

  return allPlayers.filter(p => {
    if (gender !== 'alle' && p.gender !== gender) return false;
    if (country && !normalize(p.nationality).includes(normalize(natSelected || country))) return false;
    if ((p.notability ?? 0) < minNotability) return false;
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
      cityMap.set(key, { city: p.city, nat: p.nationality, slug: p.slug, lat: p.lat, lon: p.lon, players: [] });
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

  const minPlayers = parseInt(document.getElementById('min-players').value, 10);
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
      ? `<img class="popup-player-img" src="${escapeHtml(p.image)}" onerror="this.style.display='none'" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:50%;flex-shrink:0">`
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
