ABOGA GO V7.0.6

Versión pública reforzada.

Cambios principales:
- Registro mejorado con selección Cliente / Abogado desde el inicio.
- Login local con selección de portal Cliente / Abogado sin permitir cambio de privilegios.
- Dueña y administradores conservan acceso como abogados verificados y al panel administrativo.
- JWT firmado y verificado con issuer, audience y HS256.
- Cookies de sesión Secure + HttpOnly + SameSite=Lax en producción.
- Códigos de correo protegidos con SECURITY_PEPPER.
- Contraseñas locales de mínimo 10 caracteres con letras y números.
- Reintento controlado de Resend para errores transitorios.
- Flow con timeout de red.
- Transbank verdaderamente opcional en producción.
- Renovación Premium con bloqueo anti-solapamiento, ejecución inicial y revisión cada 30 minutos.
- Cabeceras de seguridad reforzadas para Netlify y API.
- Variables de entorno de ejemplo limpias y sin secretos.
- Healthcheck reporta versión 7.0.6.

Antes de publicar:
- Configura secretos solamente en Render.
- Verifica el dominio de Resend.
- Deja TRANSBANK_ENABLED=false hasta tener credenciales productivas.
- Activa TRANSFER_AUTOMATION_ENABLED solo si tu proveedor bancario realmente firma y llama al webhook.
- .gitignore raíz reforzado para impedir publicar archivos .env y secretos.

V7.0.5: Webpay/Transbank se muestra como Próximamente y permanece bloqueado en frontend y backend mientras TRANSBANK_ENABLED no esté habilitado. Flow queda seleccionado por defecto y transferencia continúa disponible.


V7.0.5: Google Ads configurado con Google Tag AW-18421015765. Incluye Consent Mode, aviso de medición, page_view automático, eventos sign_up, generate_lead, begin_checkout, purchase, contacto WhatsApp y selección de caso. Las conversiones específicas de Google Ads quedan preparadas mediante ABOGAGO_GOOGLE_ADS_CONVERSIONS; para activarlas como acciones de conversión en Google Ads se deben crear esas acciones en Google Ads y copiar únicamente sus etiquetas/labels en runtime-config.js.

Configuración opcional en Netlify para acciones de conversión de Google Ads:
GOOGLE_ADS_ID=AW-18421015765
GOOGLE_ADS_CONVERSION_REGISTRATION=
GOOGLE_ADS_CONVERSION_CASE_PUBLISHED=
GOOGLE_ADS_CONVERSION_PAYMENT_SUCCESS=
GOOGLE_ADS_CONVERSION_WHATSAPP=

Los cuatro labels quedan vacíos hasta crear cada acción de conversión en Google Ads. No son claves secretas. El Google Tag base funciona desde esta versión con Consent Mode y eventos de medición.


V7.0.6: SEO técnico y contenido público para Google.
- Inicio optimizado para la marca ABOGA GO y búsquedas de abogados/consultas legales en Chile.
- robots.txt y sitemap.xml públicos.
- Schema.org Organization, WebSite, WebPage, BreadcrumbList y FAQPage.
- hreflang es-CL, canonical, Open Graph y metadatos reforzados.
- 6 páginas públicas originales: abogados en Chile, familia, laboral, deudas, civil y consulta legal online.
- Enlazado interno desde la portada y entre páginas temáticas.
- admin.html protegido con noindex/noarchive y 404 con noindex.
- No se han añadido afirmaciones de resultados jurídicos garantizados ni contenido jurídico individualizado.

Después de desplegar en Netlify:
1. Verifica https://abogago.online/robots.txt
2. Verifica https://abogago.online/sitemap.xml
3. Crea una propiedad de dominio abogago.online en Google Search Console y verifica por DNS.
4. Envía sitemap.xml en Search Console.
5. Usa Inspección de URL para solicitar indexación de la portada y páginas principales.
6. No es necesario cambiar Google Ads; AW-18421015765 permanece instalado.
