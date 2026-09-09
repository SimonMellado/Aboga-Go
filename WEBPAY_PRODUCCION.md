# Webpay Plus producción — ABOGA GO

Esta versión habilita Webpay Plus para créditos y planes. Oneclick permanece deshabilitado hasta una integración separada.

## Variables Render

```env
TRANSBANK_ENABLED=true
TBK_WEBPAY_COMMERCE_CODE=597053098150
TBK_WEBPAY_API_KEY=<API KEY SECRET DE TRANSBANK>
ONECLICK_ENABLED=false
```

No guardes la API Key Secret en GitHub ni en el frontend. Configúrala únicamente como variable secreta en Render.

## Flujo

1. ABOGA GO crea la transacción con precio del catálogo bloqueado.
2. Transbank devuelve token y URL.
3. El backend redirige al usuario a Webpay Plus.
4. Transbank retorna `token_ws` a `/api/payments/credits/return` o `/api/payments/plans/return`.
5. El backend ejecuta `commit` y valida estado `AUTHORIZED`, `response_code = 0`, monto, orden y sesión.
6. Solo después de esa validación se acreditan créditos o se activa Premium por 30 días.
7. Las compras duplicadas no vuelven a acreditar porque el registro pasa de `pending` a `processing` antes de aplicar el beneficio.

## Importante

El código de comercio se mantiene fuera del código ejecutable y se entrega mediante `TBK_WEBPAY_COMMERCE_CODE`. La API Key Secret tampoco debe aparecer en commits.

La integración sigue el flujo Webpay Plus documentado por Transbank: crear transacción, redirigir con `token_ws` y confirmar mediante `commit`.
