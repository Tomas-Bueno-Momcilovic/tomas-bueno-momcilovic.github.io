// scripts/theme.js
(function () {
  const KEY = 'theme'; // 'light' | 'dark' | '' (no manual override)

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  function systemMode() { return mq.matches ? 'dark' : 'light'; }

  function apply(mode, { persist = true } = {}) {
    const root = document.documentElement;

    // mode: 'dark' | 'light' | '' (empty string => remove manual override)
    if (mode) {
      root.setAttribute('data-theme', mode);
    } else {
      root.removeAttribute('data-theme'); // allow :root:not([data-theme]) @media block to take over
    }

    if (persist) localStorage.setItem(KEY, mode);

    // Update any toggle button state
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      const effective = mode || systemMode();
      btn.setAttribute('aria-pressed', String(effective === 'dark'));
      btn.textContent = effective === 'dark' ? '🌞' : '🌙';
    }

    // Tell the map (if present) to switch tiles
    const effective = mode || systemMode();
    if (typeof window.__setMapTheme === 'function') {
      window.__setMapTheme(effective);
    }
  }

  // Public helper if you ever want to call from other scripts
  window.setTheme = (mode /* 'dark' | 'light' | '' */) => apply(mode);

  // Initial apply: use saved manual choice, otherwise let system decide
  const saved = localStorage.getItem(KEY) || '';
  apply(saved, { persist: false });

  // Handle button clicks (works even if the button is added later)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#theme-toggle');
    if (!btn) return;
    const current = document.documentElement.getAttribute('data-theme') || systemMode();
    apply(current === 'dark' ? 'light' : 'dark');
  });

  // If there is no manual override, follow system changes live
  const onSystemChange = (e) => {
    const manual = document.documentElement.getAttribute('data-theme');
    if (!manual) apply('', { persist: false }); // re-apply system mode
  };
  if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
  else if (mq.addListener) mq.addListener(onSystemChange); // Safari < 14
})();
