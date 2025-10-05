// scripts/terms-tooltips.js
(function () {
  if (typeof window.$rdf === 'undefined') return;
  const hasTargets = document.querySelector('.term[data-iri], .auto-terms, .main-text');
  if (!hasTargets) return;

  const $rdf = window.$rdf;
  const store = $rdf.graph();
  const TTL_PATH = location.pathname.includes('/pages/') ? '../data/onto.ttl' : 'data/onto.ttl';
  const BASE = new URL(TTL_PATH, location.href).href;

  const RDF_TYPE = $rdf.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
  const VCARD_NS = 'http://www.w3.org/2006/vcard/ns#';
  const VCARD = (local) => $rdf.sym(VCARD_NS + local);
  const SKOS_DEF = $rdf.sym('http://www.w3.org/2004/02/skos/core#definition');
  const RDFS_COMM = $rdf.sym('http://www.w3.org/2000/01/rdf-schema#comment');
  const RDFS_LABEL = $rdf.sym('http://www.w3.org/2000/01/rdf-schema#label');
  const FOAF_URL = $rdf.sym('http://xmlns.com/foaf/0.1/homepage');

  function lit(subjectSym, predSym) { const v = store.any(subjectSym, predSym); return v ? v.value : ''; }
  function getDef(iri) { const s = $rdf.sym(iri); const v = store.any(s, SKOS_DEF) || store.any(s, RDFS_COMM); return v ? v.value : ''; }
  function getURL(iri) { const s = $rdf.sym(iri); const v = store.any(s, FOAF_URL); return v ? v.value : ''; }
  function getLabel(iri) { const s = $rdf.sym(iri); const v = store.any(s, RDFS_LABEL); return v ? v.value : ''; }
  function isOrganization(subjectSym) { return store.holds(subjectSym, RDF_TYPE, VCARD('Organization')); }
  function orgAddressLine(subjectSym) {
    let street = lit(subjectSym, VCARD('street-address'));
    let postal = lit(subjectSym, VCARD('postal-code'));
    let city = lit(subjectSym, VCARD('locality'));
    let country = lit(subjectSym, VCARD('country-name'));
    if (!(street || postal || city || country)) {
      const addrNode = store.any(subjectSym, VCARD('adr')) || store.any(subjectSym, VCARD('hasAddress'));
      if (addrNode) {
        street = lit(addrNode, VCARD('street-address')) || street;
        postal = lit(addrNode, VCARD('postal-code')) || postal;
        city = lit(addrNode, VCARD('locality')) || city;
        country = lit(addrNode, VCARD('country-name')) || country;
      }
    }
    const left = street ? `${street}` : '';
    const mid = (postal || city) ? `${postal ? postal + ' ' : ''}${city || ''}`.trim() : '';
    const right = country || '';
    const parts = [left, mid, right].filter(Boolean);
    return parts.length ? parts.join(', ') : '';
  }
  function slugify(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip accents
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  function buildAliasIndex(store) {
    const aliasToIri = Object.create(null);
    const labelStmts = store.match(null, RDFS_LABEL, null) || [];
    labelStmts.forEach(st => {
      const iri = st.subject && st.subject.value;
      const label = st.object && st.object.value;
      if (!iri || !label) return;
      const slug = slugify(label);
      if (slug && !aliasToIri[slug]) aliasToIri[slug] = iri;
    });

    // 2) From ALL subjects in the graph (local names)
    const allStmts = store.match(null, null, null) || [];
    const subjSet = new Set(allStmts.map(st => st.subject && st.subject.value).filter(Boolean));
    subjSet.forEach(iri => {
      const local = iri.split(/[#/]/).pop();
      const slug = slugify(local);
      if (slug && !aliasToIri[slug]) aliasToIri[slug] = iri;
    });

    return aliasToIri;
  }

  // Replace hashtags in text nodes under a root element
  function replaceHashtagsIn(root, aliasToIri, getLabel) {
    const SKIP = new Set(['A', 'CODE', 'PRE', 'SCRIPT', 'STYLE']);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (SKIP.has(p.tagName) || p.closest('.no-hashtags')) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !node.nodeValue.includes('#')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const re = /(^|[^#\w])(#)([a-z0-9][\w-]*)(?![#\w])/gi; // capture prefix, '#', token
    const ESC = /(^|[^#])##([a-z0-9][\w-]*)(?![#\w])/gi;   // '##token' → keep literal '#token'

    let textNode;
    const converts = [];

    while ((textNode = walker.nextNode())) {
      let text = textNode.nodeValue;

      // Quick check: if it only contains escaped hashes like '##', skip full pass
      if (!re.test(text) && ESC.test(text)) {
        // unescape later in place
        converts.push({ node: textNode, textOnly: true });
        continue;
      }

      // Reset regex state for actual replacement
      re.lastIndex = 0; ESC.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let lastIndex = 0;
      let m;

      while ((m = re.exec(text)) !== null) {
        const [full, prefix, hash, token] = m;
        const start = m.index;
        const end = start + full.length;

        // Handle escaped form beforehand: if prefix ends with '#', this was '##token' → literal
        const escaped = prefix.endsWith('#'); // because re ensures [^#] or start
        if (escaped) continue;

        // Add text before match
        frag.appendChild(document.createTextNode(text.slice(lastIndex, start) + prefix));

        const slug = token.toLowerCase();
        const iri = aliasToIri[slug];

        if (iri) {
          const label = getLabel(iri) || token.replace(/-/g, ' ');
          const span = document.createElement('span');
          span.className = 'term';
          span.setAttribute('data-iri', iri);
          span.textContent = label;
          frag.appendChild(span);
        } else {
          // Unknown token → keep literal '#token'
          frag.appendChild(document.createTextNode('#' + token));
        }

        lastIndex = end;
      }

      if (lastIndex > 0) {
        // Tail after last match + also handle '##token' → '#token'
        const tail = text.slice(lastIndex).replace(ESC, '$1#$2');
        frag.appendChild(document.createTextNode(tail));
        converts.push({ node: textNode, frag });
      } else if (ESC.test(text)) {
        // Only had escaped hashes; unescape them
        converts.push({ node: textNode, text: text.replace(ESC, '$1#$2') });
      }
    }

    // Apply mutations after walking
    converts.forEach(({ node, frag, text, textOnly }) => {
      if (frag) {
        node.parentNode.replaceChild(frag, node);
      } else if (typeof text === 'string') {
        node.nodeValue = text;
      } else if (textOnly) {
        node.nodeValue = node.nodeValue.replace(ESC, '$1#$2');
      }
    });
  }

  let tip = null;
  let pinned = false;
  let currentAnchor = null;

  function hideTip() {
    if (tip) {
      tip.remove();
      tip = null;
    }
    pinned = false;
    currentAnchor = null;
  }
  let themeObserver = null;

  function currentThemeInfo() {
    const html = document.documentElement;
    const themedEl = document.querySelector('[data-theme]'); // DaisyUI / custom
    const theme = themedEl?.getAttribute('data-theme')
      || (html.classList.contains('dark') ? 'dark' : 'light');
    return { theme, themedEl: themedEl || html };
  }

  function applyThemeToTip(t) {
    if (!t) return;
    const { theme } = currentThemeInfo();
    // 1) If you use CSS variables bound to [data-theme], set it locally:
    t.setAttribute('data-theme', theme);
    // 2) If you use a .dark class (e.g., Tailwind), mirror it:
    document.documentElement.classList.contains('dark')
      ? t.classList.add('dark')
      : t.classList.remove('dark');
  }

  function watchThemeChangesFor(t) {
    const { themedEl } = currentThemeInfo();
    if (!themedEl) return;
    if (themeObserver) themeObserver.disconnect();
    themeObserver = new MutationObserver(() => applyThemeToTip(t));
    themeObserver.observe(themedEl, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  }

  function hideTip() { if (tip) { tip.remove(); tip = null; } }
  function showTip(el, iri) {
    hideTip();
    const s = $rdf.sym(iri);
    const title = getLabel(iri) || el.textContent.trim();
    const def = getDef(iri) || 'No definition available.';
    const url = getURL(iri);
    const urlHtml = url ? `<div class="tip-more"><a href="${url}" target="_blank" rel="noopener noreferrer">Homepage</a></div>` : '';
    const addr = isOrganization(s) ? orgAddressLine(s) : '';
    const addrHtml = addr ? `<div class="tip-addr">${addr}</div>` : '';
    tip = document.createElement('div');
    tip.setAttribute('role', 'tooltip');
    tip.className = 'tooltip';
    ['mousedown', 'click', 'touchstart'].forEach(ev =>
      tip.addEventListener(ev, e => e.stopPropagation(), { passive: true })
    );
    currentAnchor = el;
    tip.innerHTML = `<div class="tip-title">${title}</div>${def}${addrHtml}${urlHtml}
                     <div class="tip-more"><a href="${iri}" target="_blank" rel="noopener noreferrer">More</a></div>`;
    document.body.appendChild(tip);
    applyThemeToTip(tip);
    watchThemeChangesFor(tip);

    const r = el.getBoundingClientRect();
    const aboveTop = window.scrollY + r.top - tip.offsetHeight - 8;
    const left = window.scrollX + Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8));
    tip.style.left = left + 'px';
    tip.style.top = (aboveTop > 0 ? aboveTop : window.scrollY + r.bottom + 8) + 'px';
  }

  fetch(TTL_PATH, { cache: 'no-store' })
    .then(r => r.text())
    .then(ttlText => {
      $rdf.parse(ttlText, store, BASE, 'text/turtle');
      const aliasToIri = buildAliasIndex(store);
      console.debug('terms-tooltips: alias count =', Object.keys(aliasToIri).length,
        'sample keys:', Object.keys(aliasToIri).slice(0, 8));
      const roots = document.querySelectorAll('.main-text, .auto-terms');
      roots.forEach(root => replaceHashtagsIn(root, aliasToIri, getLabel));
      document.querySelectorAll('.term[data-iri]').forEach(el => {
        const iri = el.getAttribute('data-iri');
        el.setAttribute('tabindex', '0');
        el.addEventListener('mouseenter', () => { if (!pinned) showTip(el, iri); });
        el.addEventListener('focus', () => { if (!pinned) showTip(el, iri); });
        el.addEventListener('mouseleave', () => { if (!pinned) hideTip(); });
        el.addEventListener('blur', () => { if (!pinned) hideTip(); });
        el.addEventListener('click', (e) => {
          if (e.button !== 0) return;     // left-click only
          e.preventDefault();             // keep page from selecting text etc.

          // If already pinned on this same term, toggle off
          if (pinned && currentAnchor === el) {
            hideTip();
            return;
          }

          // Otherwise show (or move) and pin
          showTip(el, iri);
          pinned = true;
        });
      });
      // Click anywhere outside → close if pinned
      document.addEventListener('mousedown', (e) => {
        if (!pinned) return;
        // If the click is inside the tooltip or the anchor, ignore
        if (tip && tip.contains(e.target)) return;
        if (currentAnchor && currentAnchor.contains(e.target)) return;
        hideTip();
      });

      // Esc key closes (whether pinned or not)
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideTip();
      });

    })
    .catch(err => console.error('terms-tooltips: failed to load ontology:', err));
})();
