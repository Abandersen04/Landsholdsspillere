// ===== State =====
let allPlayers = [];
let map;
let markersLayer;
let debounceTimer;

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  initSidebar();
  initControls();
  initMissingPanel();
  await loadData();
  updateMap();
});

// ===== Map Setup =====
function initMap() {
  map = L.map('map', {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 18
  }).setView([56, 10.5], 7);

  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  markersLayer = L.layerGroup();
  map.addLayer(markersLayer);
}

// ===== Sidebar Mobile Toggle =====
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  const close = document.getElementById('sidebar-close');

  toggle.addEventListener('click', () => sidebar.classList.add('open'));
  close.addEventListener('click', () => sidebar.classList.remove('open'));

  // Close sidebar when clicking on map (mobile)
  map.on('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.remove('open');
    }
  });
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
      updateClubPlayersVisibility();
      updateMap();
    });
  });

  document.querySelectorAll('input[name="gender"]').forEach(el => {
    el.addEventListener('change', () => updateMap());
  });

  // Vis/skjul min-spillere filter
  function updateClubPlayersVisibility() {
    const mapType = document.querySelector('input[name="map_type"]:checked').value;
    const group = document.getElementById('club-players-group');
    const groupLabel = document.getElementById('club-players-group-label');
    group.style.display = (mapType === 'club' || mapType === 'birth' || mapType === 'all_clubs') ? '' : 'none';
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
  const resp = await fetch('data/players.json');
  const data = await resp.json();

  allPlayers = data.map(p => ({
    ...p,
    birthYear: p.birthday_dbu ? parseBirthYear(p.birthday_dbu) : null,
    n_matches: parseInt(p.n_matches, 10) || 0,
    n_goals: parseInt(p.n_goals, 10) || 0,
    lat: p.lat ? parseFloat(p.lat) : null,
    lon: p.lon ? parseFloat(p.lon) : null,
    latitude: p.latitude ? parseFloat(p.latitude) : null,
    longitude: p.longitude ? parseFloat(p.longitude) : null
  }));
}

function parseBirthYear(dateStr) {
  // Format: dd-mm-yyyy
  const parts = dateStr.split('-');
  return parts.length === 3 ? parseInt(parts[2], 10) : null;
}

// ===== Filter =====
function getFilteredPlayers() {
  const mapType = document.querySelector('input[name="map_type"]:checked').value;
  const gender = document.querySelector('input[name="gender"]:checked').value;
  const minBirthYear = Math.min(parseInt(document.getElementById('birth-year-min').value, 10), parseInt(document.getElementById('birth-year-max').value, 10));
  const maxBirthYear = Math.max(parseInt(document.getElementById('birth-year-min').value, 10), parseInt(document.getElementById('birth-year-max').value, 10));
  const minMatches = Math.min(parseInt(document.getElementById('matches-min').value, 10), parseInt(document.getElementById('matches-max').value, 10));
  const maxMatches = Math.max(parseInt(document.getElementById('matches-min').value, 10), parseInt(document.getElementById('matches-max').value, 10));
  const searchTerm = document.getElementById('search').value.trim().toLowerCase();

  return allPlayers.filter(p => {
    if (p.birthYear !== null && (p.birthYear < minBirthYear || p.birthYear > maxBirthYear)) return false;
    if (p.n_matches < minMatches || p.n_matches > maxMatches) return false;
    if (gender !== 'alle' && p.gender !== gender) return false;

    if (mapType === 'birth') {
      if (!p.lat || !p.lon || !p.birthPlaceLabel) return false;
    } else if (mapType === 'region') {
      if (!p.region || !p.lat || !p.lon) return false;
    } else if (mapType === 'all_clubs') {
      const hasAllClubs = p.allClubs && p.allClubs.length > 0;
      const hasFirstClub = p.latitude && p.longitude && p.klubnavn;
      if (!hasAllClubs && !hasFirstClub) return false;
    } else {
      if (!p.latitude || !p.longitude || !p.klubnavn) return false;
    }

    if (searchTerm) {
      const baseHay = [p.playerLabel, p.klubnavn].filter(Boolean).join(' ').toLowerCase();
      if (mapType === 'all_clubs' && p.allClubs && p.allClubs.length > 0) {
        const clubNames = p.allClubs.map(c => c.klubnavn || '').join(' ').toLowerCase();
        if (!baseHay.includes(searchTerm) && !clubNames.includes(searchTerm)) return false;
      } else {
        if (!baseHay.includes(searchTerm)) return false;
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
  if (mapType === 'all_clubs') {
    const searchTerm = document.getElementById('search').value.trim().toLowerCase();
    groups = groupAllClubs(players, searchTerm);
  } else {
    groups = groupPlayers(players, mapType);
  }

  // Filtrer på minimum spillere per sted (klub- og fødested-visning)
  if (mapType === 'club' || mapType === 'birth') {
    const minCP = parseInt(document.getElementById('min-club-players').value, 10);
    if (minCP > 1) {
      groups = groups.filter(g => g.players.length >= minCP);
    }
    const qualifyingCount = groups.reduce((sum, g) => sum + g.players.length, 0);
    document.getElementById('player-count').textContent = qualifyingCount;
  } else if (mapType === 'all_clubs') {
    const minCP = parseInt(document.getElementById('min-club-players').value, 10);
    if (minCP > 1) {
      groups = groups.filter(g => g.players.length >= minCP);
    }
    // Tæl unikke spillere (en spiller kan have pins ved flere klubber)
    const uniquePlayers = new Set(groups.flatMap(g => g.players.map(p => p.dbuID)));
    document.getElementById('player-count').textContent = uniquePlayers.size;
  } else {
    document.getElementById('player-count').textContent = players.length;
  }

  // Beregn total for procentvisning (region-mode)
  if (mapType === 'region') {
    const total = groups.reduce((s, g) => s + g.players.length, 0);
    groups.forEach(g => { g.totalPlayers = total; });
  }

  // Clear and rebuild markers
  markersLayer.clearLayers();

  const bounds = [];
  groups.forEach(group => {
    const marker = createMarker(group, mapType);
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

const REGION_CENTERS = {
  'Region Nordjylland':  [57.05, 9.93],
  'Region Midtjylland':  [56.25, 9.50],
  'Region Syddanmark':   [55.35, 9.50],
  'Region Sjælland':     [55.47, 11.86],
  'Region Hovedstaden':  [55.77, 12.55]
};

function groupPlayers(players, mapType) {
  const map = new Map();

  players.forEach(p => {
    let key, lat, lng, locName;

    if (mapType === 'birth') {
      key = p.birthPlaceLabel;
      lat = p.lat;
      lng = p.lon;
      locName = p.birthPlaceLabel;
    } else if (mapType === 'region') {
      key = p.region;
      const center = REGION_CENTERS[p.region];
      lat = center ? center[0] : null;
      lng = center ? center[1] : null;
      locName = p.region;
    } else {
      const klubKey = p.klubnavn.toUpperCase();
      key = `${klubKey}|${p.latitude}|${p.longitude}`;
      lat = p.latitude;
      lng = p.longitude;
      locName = klubKey;
    }

    if (!map.has(key)) {
      map.set(key, {
        locName,
        lat,
        lng,
        players: [],
        // Club metadata (from first player)
        klub_logo: p.klub_logo,
        klub_website: p.klub_website,
        klub_dbu_url: p.klub_dbu_url
      });
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

    // Første klub garanteres altid med – også hvis allClubs mangler den.
    // Tjek på navn (case-insensitiv) for at undgå dubletter når allClubs allerede
    // har samme klub under et andet nøgle-skema (fx QID vs. klub_id).
    if (player.latitude && player.longitude && player.klubnavn) {
      const firstName = (player.klubnavn || '').toLowerCase();
      const firstKey  = clubKey(player);
      const alreadyIn = clubs.some(c =>
        clubKey(c) === firstKey ||
        (c.klubnavn || '').toLowerCase() === firstName
      );
      if (!alreadyIn) {
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

    // Søgefilter: når der søges på en klubnavn-streng, vis kun matchende klubber for denne spiller.
    // Hvis søgningen matcher spillerens navn (ikke en klubnavn), vis alle klubber som normalt.
    let visibleClubs = clubs;
    if (searchTerm) {
      const matchingClubs = clubs.filter(c => (c.klubnavn || '').toLowerCase().includes(searchTerm));
      if (matchingClubs.length > 0) visibleClubs = matchingClubs;
    }

    for (const club of visibleClubs) {
      if (!club.latitude || !club.longitude) continue;

      const lat = typeof club.latitude === 'number' ? club.latitude : parseFloat(club.latitude);
      const lng = typeof club.longitude === 'number' ? club.longitude : parseFloat(club.longitude);

      // Merge-check: find eksisterende pin med samme navn inden for 10 km.
      // Fanger tilfælde som Silkeborg IF der har lidt forskellige koordinater
      // fra DBU-databasen og Wikidata, men er samme klub.
      const clubName = (club.klubnavn || '').toLowerCase();
      let existingKey = null;
      for (const [k, g] of clubMap) {
        if ((g.locName || '').toLowerCase() === clubName && distKm(g.lat, g.lng, lat, lng) < 10) {
          existingKey = k;
          break;
        }
      }

      const key = existingKey ?? clubKey(club);
      if (!clubMap.has(key)) {
        clubMap.set(key, {
          locName: club.klubnavn,
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
function createMarker(group, mapType) {
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
      const words = locName.split(/\s+/);
      let line1, line2;
      if (words.length > 2) {
        const mid = Math.ceil(words.length / 2);
        line1 = escapeHtml(words.slice(0, mid).join(' '));
        line2 = escapeHtml(words.slice(mid).join(' '));
      } else if (words.length === 2) {
        line1 = escapeHtml(words[0]);
        line2 = escapeHtml(words[1]);
      } else {
        line1 = escapeHtml(locName);
        line2 = '';
      }
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
  } else if (mapType === 'region') {
    // Region: stor cirkel med procent og antal
    const size = 60 + Math.sqrt(players.length) * 2;
    const regionShort = locName.replace('Region ', '');
    const pct = group.totalPlayers > 0
      ? Math.round(players.length / group.totalPlayers * 100)
      : 0;
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(200,16,46,0.75);border:3px solid white;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;">
               <span style="color:white;font-weight:bold;font-size:${Math.min(16, size/4)}px;line-height:1.1">${pct}%</span>
               <span style="color:white;font-size:${Math.min(9, size/7)}px;text-align:center;padding:0 3px;line-height:1.2">${players.length} spl.</span>
               <span style="color:white;font-size:${Math.min(9, size/7)}px;text-align:center;padding:0 3px;line-height:1.2">${escapeHtml(regionShort)}</span>
             </div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
    marker = L.marker([lat, lng], { icon });
    marker.bindTooltip(`${locName}: ${pct}% (${players.length} spillere)`, { direction: 'auto' });
  } else {
    // Birth place: circle marker
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
    closeButton: true
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

    const nameHtml = group.klub_dbu_url
      ? `<a href="${escapeHtml(group.klub_dbu_url)}" target="_blank" rel="noopener">${escapeHtml(locName)}</a>`
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
        <div class="location-name">${escapeHtml(locName)}</div>
        <div class="player-total">${players.length} spillere</div>
      </div>`;
  }

  // Players list
  const playersHtml = players.map(p => {
    const imgHtml = p.image
      ? `<img class="popup-player-img" src="${escapeHtml(p.image)}" onerror="this.style.display='none'" alt="">`
      : '';

    const birth = p.birthday_dbu || 'Ukendt';
    const stats = `Kampe: ${p.n_matches} | Mål: ${p.n_goals}`;

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
          <div class="popup-player-name">${escapeHtml(p.playerLabel)}</div>
          <div class="popup-player-detail">Født: ${escapeHtml(birth)}</div>
          <div class="popup-player-detail">${stats}</div>
          ${links.length ? `<div class="popup-player-links">${links.join(' ')}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="popup-wrapper">
      ${headerHtml}
      <div class="popup-players">${playersHtml}</div>
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
