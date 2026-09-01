/* Creado por LimónStudioss. s.melladoo */
(function () {
  const ADS_ID = window.ABOGAGO_GOOGLE_ADS_ID || 'AW-18421015765';
  const CONSENT_KEY = 'abogago_google_ads_consent_v1';
  const conversionLabels = window.ABOGAGO_GOOGLE_ADS_CONVERSIONS || {};

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  });
  gtag('js', new Date());
  gtag('config', ADS_ID, { send_page_view: true });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ADS_ID)}`;
  document.head.appendChild(script);

  function updateConsent(granted) {
    gtag('consent', 'update', {
      ad_storage: granted ? 'granted' : 'denied',
      ad_user_data: granted ? 'granted' : 'denied',
      ad_personalization: granted ? 'granted' : 'denied',
      analytics_storage: granted ? 'granted' : 'denied'
    });
    try { localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied'); } catch (_) {}
    document.getElementById('google-consent-banner')?.remove();
  }

  function showConsentBanner() {
    if (document.getElementById('google-consent-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'google-consent-banner';
    banner.className = 'google-consent-banner';
    banner.innerHTML = '<div class="google-consent-copy"><strong>Medición y publicidad</strong><span>ABOGA GO usa Google Ads para medir campañas y mejorar la publicidad. Puedes aceptar la medición o continuar solo con cookies necesarias.</span><a href="/legal/cookies.html">Ver política de cookies</a></div><div class="google-consent-actions"><button type="button" class="btn btn-outline btn-sm" data-google-consent="denied">Solo necesarias</button><button type="button" class="btn btn-ink btn-sm" data-google-consent="granted">Aceptar medición</button></div>';
    document.body.appendChild(banner);
    banner.querySelectorAll('[data-google-consent]').forEach(btn => btn.addEventListener('click', () => updateConsent(btn.dataset.googleConsent === 'granted')));
  }

  let storedConsent = null;
  try { storedConsent = localStorage.getItem(CONSENT_KEY); } catch (_) {}
  if (storedConsent === 'granted') updateConsent(true);
  else if (storedConsent === 'denied') updateConsent(false);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showConsentBanner, { once: true });
  else showConsentBanner();

  window.abogaTrackEvent = function (name, params = {}) {
    if (!name) return;
    gtag('event', name, { ...params, transport_type: 'beacon' });
  };

  window.abogaTrackPageView = function (view, title) {
    if (!view) return;
    gtag('event', 'page_view', {
      page_title: title || `ABOGA GO · ${view}`,
      page_location: `${location.origin}${location.pathname}?view=${encodeURIComponent(view)}`,
      page_path: `${location.pathname}?view=${encodeURIComponent(view)}`,
      transport_type: 'beacon'
    });
  };

  window.abogaTrackConversion = function (key, params = {}) {
    const label = conversionLabels[key];
    if (!label) return false;
    const sendTo = String(label).startsWith('AW-') ? String(label) : `${ADS_ID}/${label}`;
    gtag('event', 'conversion', { send_to: sendTo, ...params, transport_type: 'beacon' });
    return true;
  };

  window.abogaTrackOnce = function (key, callback) {
    if (!key || typeof callback !== 'function') return;
    const storageKey = `abogago_ads_once_${key}`;
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, '1');
    } catch (_) {}
    callback();
  };

  document.addEventListener('click', event => {
    const whatsapp = event.target.closest('a[href*="wa.me/"]');
    if (whatsapp) {
      window.abogaTrackEvent('contact', { method: 'whatsapp' });
      window.abogaTrackConversion('whatsapp_contact');
    }
    const publicCase = event.target.closest('.case-option-card');
    if (publicCase) window.abogaTrackEvent('select_content', { content_type: 'legal_case' });
  });
})();
