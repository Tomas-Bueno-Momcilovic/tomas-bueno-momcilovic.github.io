// scripts/pubs.js
(function () {
  const mount = document.getElementById('pubs');
  if (!mount) return;

  const BIB_PATH = location.pathname.includes('/pages/') ? '../data/papers.bib' : 'data/papers.bib';

  const first = v => Array.isArray(v) ? v[0] : v;
  const text  = v => (typeof v === 'string') ? v
                   : Array.isArray(v) ? v.filter(Boolean).join(' ')
                   : (v && v.literal) ? v.literal
                   : (v ?? '');
  const getYearCSL = d => {
    const dp = d?.issued?.['date-parts'];
    if (Array.isArray(dp) && Array.isArray(dp[0]) && dp[0][0]) return dp[0][0];
    return d?.issued?.year || d?.issued || '';
  };

  function sanitizeBib(bib) {
    if (bib.charCodeAt(0) === 0xFEFF) bib = bib.slice(1);
    bib = bib.replace(/\r\n?/g, '\n');
    bib = bib.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-');
    bib = bib.replace(/@comment\s*{[^{}]*}/gi, '');
    bib = bib.replace(/^[ \t]*%.*$/gm, '');
    bib = bib.replace(/\n\s*(abstract|file|keywords)\s*=\s*{[^{}]*},?/gi, '\n');
    bib = bib.replace(/url\s*=\s*\\url\s*{([^}]*)}/gi, 'url = {$1}');
    bib = bib.replace(/month\s*=\s*([a-z]{3,})\b/gi, 'month = {$1}');
    let auto = 0;
    bib = bib.replace(/@(\w+)\s*{\s*,/g, (m, t) => `@${t}{autoKey${++auto},`);
    bib = bib.replace(/,\s*}\s*$/gm, '\n}\n');
    return bib;
  }

  function render(items, sourceLabel) {
    items.sort((a,b)=>(String(b.year||'0').localeCompare(String(a.year||'0'))) || String(a.title).localeCompare(String(b.title)));
    const html = items.map(it => `
      <li class="pub-item">
        <span class="year-badge">${it.year || '—'}</span>
        <div class="pub-body">
          <b>${it.title}</b><br>
          <span class="pub-meta">${it.authors}${it.venue ? ` — <i>${it.venue}</i>` : ''}</span>
          ${it.url ? ` · <a href="${it.url}" target="_blank" rel="noopener noreferrer">Link</a>` : ''}
        </div>
      </li>
    `).join('');
    mount.innerHTML = `<ul class="pub-list">${html}</ul>`;
    console.debug(`pubs: rendered ${items.length} via ${sourceLabel}`);
  }

  function tryCitation(bib) {
    const Cite = window.Cite;
    const csl = new Cite(bib).get({ type: 'json' });
    return csl.map(d => {
      const year   = getYearCSL(d) || 'In press';
      const title  = text(first(d.title)) || '(untitled)';
      const authors = (d.author || [])
        .map(a => [a.given, a.family].filter(Boolean).join(' '))
        .filter(Boolean).join(', ');
      const venue  = text(first(d['container-title'] || d['collection-title'] || d.publisher || d['event'] || d['event-title']));
      const url    = d.URL || (d.DOI ? `https://doi.org/${d.DOI}` : '');
      return { year, title, authors, venue, url };
    });
  }

  function tryBibtexParse(bib) {
    const parsed = window.bibtexParse.toJSON(bib);
    return parsed.map(it => {
      const t = it.entryTags || {};
      const title = t.title || '(untitled)';
      const authors = (t.author || '').split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean).join(', ');
      const venue = t.booktitle || t.journal || t.publisher || '';
      const year = t.year || '';
      const url = t.url || (t.doi ? `https://doi.org/${t.doi}` : '');
      return { title, authors, venue, year, url };
    });
  }

  fetch(BIB_PATH, { cache: 'no-store' })
    .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); })
    .then(bib => {
      bib = sanitizeBib(bib);
      try {
        if (!window.Cite) throw new Error('Citation.js missing');
        const items = tryCitation(bib);
        render(items, 'Citation.js');
      } catch (e1) {
        console.warn('pubs: Citation.js failed, trying bibtex-parse-js', e1);
        try {
          if (!window.bibtexParse) throw new Error('bibtex-parse-js missing');
          const items = tryBibtexParse(bib);
          render(items, 'bibtex-parse-js');
        } catch (e2) {
          console.error('pubs: all parsers failed', e2);
          mount.textContent = 'Failed to load publications.';
        }
      }
    })
    .catch(err => {
      console.error('pubs: fetch failed', err);
      mount.textContent = 'Failed to load publications.';
    });
})();
