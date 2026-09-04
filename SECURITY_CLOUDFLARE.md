# Seguridad Cloudflare para ABOGA GO

Configuración recomendada para `abogago.online` y `api.abogago.online`.

1. DNS: cambiar `api` de **Solo DNS** a **Proxied** (nube naranja) para que el WAF y la mitigación DDoS también cubran la API de Render.
2. SSL/TLS: usar **Full (strict)** y mantener HTTPS obligatorio.
3. Security > WAF > Managed rules: activar **Cloudflare Free Managed Ruleset**.
4. Security > WAF > Custom rules: crear una regla con acción **Managed Challenge** para `/api/auth/local/login`, `/api/auth/local/register/*` y `/api/auth/local/password/*` cuando el tráfico sea sospechoso. No bloquear callbacks de pagos ni OAuth por regla genérica.
5. Mantener la protección DDoS administrada de Cloudflare activada. Es automática para zonas incorporadas a Cloudflare.
6. Revisar Security Events durante la primera semana antes de endurecer reglas para evitar falsos positivos.
7. No exponer directamente el hostname de Render en el frontend. El navegador debe usar únicamente `https://api.abogago.online/api`.
8. En Render mantener los rate limits del backend como segunda capa, aunque Cloudflare ya filtre tráfico.

No se deben crear reglas que bloqueen `Googlebot`, callbacks de Flow/Transbank o el webhook de transferencias sin una excepción explícita.
