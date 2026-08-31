/* Creado por LimónStudioss. s.melladoo */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.classList.add('js');
  document.body.classList.add('animations-ready');

  if (reduceMotion) return;

  const selectors = [
    '.section-head',
    '.step',
    '.area-card',
    '.debt-banner',
    '.client-free-copy',
    '.client-step',
    '.client-free-note',
    '.pricing-card',
    '.public-credit-pack',
    '.payments-panel',
    '.portal-plan-card',
    '.portal-credit-pack',
    '.app-head',
    '.tabbar',
    '#view-admin > .app-shell > .card',
    '.faq-list details',
    '.site-footer'
  ];

  const elements = [...document.querySelectorAll(selectors.join(','))];

  elements.forEach((el, index) => {
    el.classList.add('reveal-item');
    el.style.setProperty('--reveal-delay', `${(index % 5) * 55}ms`);
  });

  if (!('IntersectionObserver' in window)) {
    elements.forEach(el => el.classList.add('reveal-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('reveal-visible');
      obs.unobserve(entry.target);
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -7% 0px'
  });

  elements.forEach(el => observer.observe(el));

  const hiddenViews = document.querySelectorAll('section[id^="view-"]');
  const viewObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      const view = mutation.target;
      if (!view.classList.contains('hidden')) {
        view.querySelectorAll('.reveal-item:not(.reveal-visible)').forEach(el => observer.observe(el));
      }
    });
  });

  hiddenViews.forEach(view => viewObserver.observe(view, { attributes:true, attributeFilter:['class'] }));
})();
