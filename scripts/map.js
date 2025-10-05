(function () {
  const mapEl = document.getElementById('map');
  if (!mapEl || typeof window.L === 'undefined') return;
  if (typeof window.$rdf === 'undefined') {
    console.error('map: rdflib not loaded; cannot read onto.ttl');
    return;
  }

  const LBL = {
    conference: 'Conference',
    personal: 'Personal',
    research: 'Research Visit'
  };

  const COLORS = {
    [LBL.conference]: '#DC143C', // crimson
    [LBL.personal]:   '#326273', // payne's gray
    [LBL.research]:   '#E39774', // atomic orange
    default:          '#808080'
  };
  const STROKE = '#FFFFFF';

  const $rdf = window.$rdf;
  const store = $rdf.graph();

  // Paths work both from / and /pages/
  const TTL_PATH = location.pathname.includes('/pages/') ? '../data/onto.ttl' : 'data/onto.ttl';
  const BASE = new URL(TTL_PATH, location.href).href;

  // Namespaces
  const RDF  = $rdf.Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
  const RDFS = $rdf.Namespace('http://www.w3.org/2000/01/rdf-schema#');
  const DCT  = $rdf.Namespace('http://purl.org/dc/terms/');
  const GEO  = $rdf.Namespace('http://www.opengis.net/ont/geosparql#');
  const SCHEMA = $rdf.Namespace('http://schema.org/');
  const TBM = $rdf.Namespace('https://tomas-bueno-momcilovic.github.io/ontology#');

  function asStr(obj) { return obj ? obj.value : ''; }

  // Parse WKT "POINT(lon lat)" → [lat, lon]
  function parseWKTPoint(wktLiteral) {
    // Accept variations like "POINT (24.888 41.136)" with optional CRS IRI before it
    // e.g. "<http://www.opengis.net/def/crs/OGC/1.3/CRS84> POINT(…)"
    const s = String(wktLiteral || '');
    const m = s.match(/POINT\s*\(\s*([+-]?\d+(\.\d+)?)\s+([+-]?\d+(\.\d+)?)\s*\)/i);
    if (!m) return null;
    const lon = parseFloat(m[1]);
    const lat = parseFloat(m[3]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
    return null;
  }

  // Category detection by rdf:type
  function categoryFor(subject) {
    // tweak these class IRIs to what you actually use
    const isConf = store.holds(subject, RDF('type'), TBM('Conference'));
    const isPers = store.holds(subject, RDF('type'), TBM('PersonalEntry'));
    const isRes  = store.holds(subject, RDF('type'), TBM('ResearchVisit'));
    if (isConf) return LBL.conference;
    if (isPers) return LBL.personal;
    if (isRes)  return LBL.research;
    return 'default';
  }

  function dotStyle(cat) {
    const fill = COLORS[cat] || COLORS.default;
    return {
      radius: 7,
      fillColor: fill,
      color: STROKE,
      weight: 3,
      opacity: 1,
      fillOpacity: 0.95
    };
  }

  // Build features array from triples
  function extractVisits() {
    const features = [];

    // Find subjects that have a geometry with a WKT literal
    const geomStmts = store.match(null, GEO('hasGeometry'), null);
    geomStmts.forEach(st => {
      const subj = st.subject;      // the visit individual
      const geom = st.object;       // the geometry node (blank node or IRI)
      const wkt  = store.any(geom, GEO('asWKT')); // literal with ^^geo:wktLiteral
      if (!wkt) return;

      const coords = parseWKTPoint(asStr(wkt));
      if (!coords) return;

      const label = asStr(store.any(subj, RDFS('label'))) || subj.value.split(/[#/]/).pop();
      const date  = asStr(store.any(subj, DCT('date')));
      const notes = asStr(store.any(subj, RDFS('comment')));
      const city  = asStr(store.any(subj, SCHEMA('addressLocality')));
      const country = asStr(store.any(subj, SCHEMA('addressCountry')));
      const cat  = categoryFor(subj);

      features.push({
        latlng: { lat: coords[0], lng: coords[1] },
        props: {
          title: label,
          date,
          category: cat,
          notes,
          city,
          country,
          uri: subj.value
        }
      });
    });

    return features;
  }

  function popupHtml(p) {
    const title = p.title ? `<strong>${p.title}</strong>` : '';
    const loc   = (p.city || p.country) ? `${p.city || ''}${p.city && p.country ? ', ' : ''}${p.country || ''}` : '';
    const meta  = [p.category !== 'default' ? p.category : '', p.date].filter(Boolean).join(' • ');
    const notes = p.notes ? `<div style="margin-top:.3em">${p.notes}</div>` : '';
    const locHtml = loc ? `<div style="margin-top:.3em">${loc}</div>` : '';
    const link  = p.uri ? `<div style="margin-top:.3em"><a href="${p.uri}" target="_blank" rel="noopener">IRI</a></div>` : '';
    return `${title}${meta ? `<div>${meta}</div>` : ''}${notes}${locHtml}`;
  }

  // Init map (Europe view by default)
  const map = L.map('map', { scrollWheelZoom: false }).setView([50, 10], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  // Load ontology and render
  fetch(TTL_PATH, { cache: 'no-store' })
    .then(r => r.text())
    .then(ttl => {
      $rdf.parse(ttl, store, BASE, 'text/turtle');

      const visits = extractVisits();
      if (!visits.length) {
        console.warn('map: no visits found in ontology (did you use geo:hasGeometry/geo:asWKT POINT(lon lat)?)');
      }

      const layers = [];
      visits.forEach(v => {
        const m = L.circleMarker(v.latlng, dotStyle(v.props.category)).bindPopup(popupHtml(v.props));
        m.addTo(map);
        layers.push(m);
      });

      if (layers.length) {
        const group = L.featureGroup(layers);
        // Optionally fit to bounds of all visits (comment out if you want fixed Europe view)
        map.fitBounds(group.getBounds(), { padding: [20, 20] });
      }

      // Legend (top-left)
      const legend = L.control({ position: 'topright' });
      legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'legend');
        const items = [
          [LBL.conference, COLORS[LBL.conference]],
          [LBL.personal,   COLORS[LBL.personal]],
          [LBL.research,   COLORS[LBL.research]]
        ];
        div.innerHTML = `
          <div class="legend-box">
            <div class="legend-title">Categories</div>
            ${items.map(([label, color]) => `
              <div class="legend-row">
                <span class="legend-dot" style="background:${color}; outline:3px solid ${STROKE};"></span>
                <span class="legend-label">${label}</span>
              </div>
            `).join('')}
          </div>`;
        return div;
      };
      legend.addTo(map);
    })
    .catch(err => console.error('map: failed to load onto.ttl', err));
})();
