# Despliegue seguro ABOGA GO V7.1.0

## 1. Render
Añadir las variables `DATA_ENCRYPTION_KEY`, `TWO_FACTOR_ISSUER=ABOGA GO` y `FORCE_STAFF_2FA=false`.
La clave de cifrado debe ser aleatoria, exclusiva y de al menos 32 bytes efectivos.

## 2. Migración de datos existentes
Después de desplegar y antes de rotar la clave, ejecutar una sola vez `npm run migrate:encryption` con acceso a `MONGODB_URI`.
El script es idempotente: omite valores que ya comienzan con el formato cifrado V1.

## 3. 2FA
En Mi cuenta > Seguridad, configurar 2FA, escanear el QR, validar un TOTP y guardar los 10 códigos de recuperación.
Primero activar 2FA en creador/admin. Solo después establecer `FORCE_STAFF_2FA=true` en Render.

## 4. Cloudflare
El Worker usa `wrangler.jsonc` y `worker.js`; el comando de despliegue debe ser `npx wrangler deploy`.
Los headers de seguridad se aplican en el edge.
Seguir `SECURITY_CLOUDFLARE.md` para WAF y DDoS.

## 5. Backups
El workflow `.github/workflows/mongodb-backup.yml` se ejecuta cada 2 días y también manualmente.
Crear en GitHub Actions Secrets:
- `MONGODB_URI`
- `BACKUP_ENCRYPTION_KEY`
- `SECURITY_PEPPER`
Los archivos se guardan cifrados como artifacts durante 30 días.
