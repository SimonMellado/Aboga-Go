/* Creado por LimónStudioss. s.melladoo */
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://www.google.com https://www.google.cl https://www.googleadservices.com https://googleads.g.doubleclick.net; connect-src 'self' https://api.abogago.online https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googleadservices.com https://googleads.g.doubleclick.net; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://api.abogago.online";

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Resource-Policy', 'same-site');
    headers.set('X-Permitted-Cross-Domain-Policies', 'none');
    headers.set('Content-Security-Policy', CSP);
    const url = new URL(request.url);
    if (url.pathname === '/admin.html') {
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
