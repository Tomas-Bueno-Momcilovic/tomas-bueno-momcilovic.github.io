(async function () {
    const mapEl = document.getElementById('map');
    if (!mapEl || typeof window.L === 'undefined') return;
    // Theme
    const COLORS = {
        conference: '#DC143C', // crimson
        personal: '#326273', // payne's gray
        research: '#E39774', // atomic orange
        default: '#808080'  // fallback
    };
    const STROKE = '#FFFFFF'; // fat white outline

    // Map
    const map = L.map('map', { scrollWheelZoom: false }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    // Style helpers
    const norm = v => String(v || '').trim().toLowerCase(); // normalize labels
    function colorByCategory(cat) {
        switch (norm(cat)) {
            case 'conference': return COLORS.conference;
            case 'personal': return COLORS.personal;
            case 'research': return COLORS.research;
            default: return COLORS.default;
        }
    }
    function dotStyle(cat) {
        return {
            radius: 7,
            fillColor: colorByCategory(cat),
            color: STROKE,    // white outline
            weight: 3,        // thicker stroke
            opacity: 1,
            fillOpacity: 0.95
        };
    }

    // Load data (keeps your file:// fallback if you added the inline <script id="visits-data">)
    async function loadVisits() {
        try {
            const r = await fetch('data/visits.geojson', { cache: 'no-store' });
            if (r.ok) return await r.json();
            throw new Error('HTTP ' + r.status);
        } catch (e) {
            const el = document.getElementById('visits-data');
            if (el) return JSON.parse(el.textContent);
            console.warn('No visits data found.');
            return { type: 'FeatureCollection', features: [] };
        }
    }

    const geojson = await loadVisits();

    // Build layer
    const layer = L.geoJSON(geojson, {
        pointToLayer: (feature, latlng) => {
            const cat = feature?.properties?.category;
            return L.circleMarker(latlng, dotStyle(cat));
        },
        onEachFeature: (feature, layer) => {
            const p = feature.properties || {};
            const title = p.title ? `<strong>${p.title}</strong>` : '';
            const meta = [p.category, p.date].filter(Boolean).join(' • ');
            const notes = p.notes ? `<div style="margin-top:.3em">${p.notes}</div>` : '';
            const notesHtml = notes ? `<div class="popup-notes">${notes}</div>` : '';
            const link = p.link ? `<div style="margin-top:.3em"><a href="${p.link}" target="_blank" rel="noopener">More</a></div>` : '';
            layer.bindPopup(`${title}${meta ? `<div>${meta}</div>` : ''}${notes}${link}`);
        }
    }).addTo(map);

    if (geojson.features?.length) {
        map.fitBounds(layer.getBounds(), { padding: [20, 20] });
    }

    // Legend (bottom-right)
    const legend = L.control({ position: 'topright' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'legend');
        const items = [
            ['conference', COLORS.conference],
            ['personal', COLORS.personal],
            ['research', COLORS.research]
        ];
        div.innerHTML = `
        <div class="legend-box">
          <div class="legend-title">Categories</div>
          ${items.map(([label, color]) => `
            <div class="legend-row">
              <span class="legend-dot" style="background:${color}; box-shadow: 0 0 0 3px ${STROKE} inset, 0 0 0 2px ${STROKE};"></span>
              <span class="legend-label">${label}</span>
            </div>
          `).join('')}
        </div>`;
        return div;
    };
    legend.addTo(map);
})();