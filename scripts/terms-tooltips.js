// scripts/terms-tooltips.js
(function () {
  if (typeof window.$rdf === 'undefined') return;
  if (!document.querySelector('.term[data-iri]')) return;

  const $rdf = window.$rdf;
  const store = $rdf.graph();
  const BASE  = location.origin + '/';
  const TTL_PATH = location.pathname.includes('/pages/') ? '../data/onto.ttl' : 'data/onto.ttl';

  const RDF_TYPE    = $rdf.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
  const VCARD_NS    = 'http://www.w3.org/2006/vcard/ns#';
  const VCARD       = (local) => $rdf.sym(VCARD_NS + local);
  const SKOS_DEF    = $rdf.sym('http://www.w3.org/2004/02/skos/core#definition');
  const RDFS_COMM   = $rdf.sym('http://www.w3.org/2000/01/rdf-schema#comment');
  const RDFS_LABEL  = $rdf.sym('http://www.w3.org/2000/01/rdf-schema#label');

  function lit(subjectSym, predSym) { const v = store.any(subjectSym, predSym); return v ? v.value : ''; }
  function getDef(iri) { const s = $rdf.sym(iri); const v = store.any(s, SKOS_DEF) || store.any(s, RDFS_COMM); return v ? v.value : ''; }
  function getLabel(iri) { const s = $rdf.sym(iri); const v = store.any(s, RDFS_LABEL); return v ? v.value : ''; }
  function isOrganization(subjectSym) { return store.holds(subjectSym, RDF_TYPE, VCARD('Organization')); }
  function orgAddressLine(subjectSym) {
    let street  = lit(subjectSym, VCARD('street-address'));
    let postal  = lit(subjectSym, VCARD('postal-code'));
    let city    = lit(subjectSym, VCARD('locality'));
    let country = lit(subjectSym, VCARD('country-name'));
    if (!(street || postal || city || country)) {
      const addrNode = store.any(subjectSym, VCARD('adr')) || store.any(subjectSym, VCARD('hasAddress'));
      if (addrNode) {
        street  = lit(addrNode, VCARD('street-address')) || street;
        postal  = lit(addrNode, VCARD('postal-code'))   || postal;
        city    = lit(addrNode, VCARD('locality'))      || city;
        country = lit(addrNode, VCARD('country-name'))  || country;
      }
    }
    const left  = street ? `${street}` : '';
    const mid   = (postal || city) ? `${postal ? postal + ' ' : ''}${city || ''}`.trim() : '';
    const right = country || '';
    const parts = [left, mid, right].filter(Boolean);
    return parts.length ? parts.join(', ') : '';
  }

  let tip = null;
  function hideTip(){ if (tip) { tip.remove(); tip = null; } }
  function showTip(el, iri) {
    hideTip();
    const s = $rdf.sym(iri);
    const title = getLabel(iri) || el.textContent.trim();
    const def   = getDef(iri) || 'No definition available.';
    const addr  = isOrganization(s) ? orgAddressLine(s) : '';
    const addrHtml = addr ? `<div class="tip-addr">${addr}</div>` : '';
    tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.innerHTML = `<div class="tip-title">${title}</div>${def}${addrHtml}
                     <div class="tip-more"><a href="${iri}" target="_blank" rel="noopener noreferrer">More</a></div>`;
    document.body.appendChild(tip);
    const r = el.getBoundingClientRect();
    const aboveTop = window.scrollY + r.top - tip.offsetHeight - 8;
    const left = window.scrollX + Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8));
    tip.style.left = left + 'px';
    tip.style.top  = (aboveTop > 0 ? aboveTop : window.scrollY + r.bottom + 8) + 'px';
  }

  fetch(TTL_PATH, { cache: 'no-store' })
    .then(r => r.text())
    .then(ttlText => {
      $rdf.parse(ttlText, store, BASE, 'text/turtle');
      document.querySelectorAll('.term[data-iri]').forEach(el => {
        const iri = el.getAttribute('data-iri');
        el.setAttribute('tabindex', '0');
        el.addEventListener('mouseenter', () => showTip(el, iri));
        el.addEventListener('mouseleave', hideTip);
        el.addEventListener('focus',    () => showTip(el, iri));
        el.addEventListener('blur',     hideTip);
        el.addEventListener('click',    () => showTip(el, iri));
      });
      document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') hideTip(); });
    })
    .catch(err => console.error('terms-tooltips: failed to load ontology:', err));
})();
