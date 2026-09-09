/* Ciclo COMPLETO de una transacción Webpay Plus de prueba: create -> pagas en el navegador
 * -> el script recibe el callback automáticamente -> commit() -> (opcional) refund().
 *
 * Requiere: transbank-sdk (ya está en server/package.json)
 * Uso:
 *   node webpay-test.js aprobada-credito         (Pago con tarjeta de crédito aprobada y sin cuotas)
 *   node webpay-test.js rechazada-credito        (Pago con tarjeta de crédito rechazado y sin cuotas)
 *   node webpay-test.js aprobada-credito-cuotas  (Pago con tarjeta de crédito aprobado y con cuotas)
 *   node webpay-test.js aprobada-debito          (Pago con tarjeta de débito o prepago aprobada)
 *   node webpay-test.js rechazada-debito         (Pago con tarjeta de débito o prepago rechazado)
 *   node webpay-test.js anular-parcial           (Prueba de anulación PARCIAL)
 *   node webpay-test.js anular-total             (Prueba de anulación TOTAL)
 *
 * Para "aprobada-credito-cuotas": usa la MISMA tarjeta de éxito, pero cuando la página de
 * Webpay te pregunte por el número de cuotas, elige cualquier valor mayor a 1 (ej. 3).
 */
const http = require('http');
const { WebpayPlus, Options, IntegrationApiKeys, IntegrationCommerceCodes, Environment } = require('transbank-sdk');

const scenario = process.argv[2];
const VALID = ['aprobada-credito', 'rechazada-credito', 'aprobada-credito-cuotas', 'aprobada-debito', 'rechazada-debito', 'anular-parcial', 'anular-total'];
if (!VALID.includes(scenario)) {
  console.log('Uso: node webpay-test.js <escenario>');
  console.log('Escenarios válidos: ' + VALID.join(', '));
  process.exit(1);
}

const PORT = 4780;
const options = new Options(IntegrationCommerceCodes.WEBPAY_PLUS, IntegrationApiKeys.WEBPAY, Environment.Integration);
const tx = new WebpayPlus.Transaction(options);

const isRefundScenario = scenario === 'anular-parcial' || scenario === 'anular-total';
const buyOrder = 'orden-' + Date.now();
const sessionId = 'sesion-' + Date.now();
const amount = 10000; // CLP
const returnUrl = `http://localhost:${PORT}/return`;

console.log('\nTarjetas de prueba a usar según el escenario:');
console.log('  Éxito  (crédito o débito): 4051 8856 0044 6623 | CVV 123 | fecha futura');
console.log('  Fracaso (crédito o débito): 5186 0595 9590 568 | CVV 123 | fecha futura');
console.log('  Si pide RUT/clave: 11.111.111-1 / 123\n');
if (scenario === 'aprobada-credito-cuotas') {
  console.log('>>> En este escenario, usa la tarjeta de ÉXITO y elige "3 cuotas" (o cualquiera > 1) en la página de pago.\n');
}
if (isRefundScenario) {
  console.log('>>> Este escenario primero aprueba una transacción normal con la tarjeta de ÉXITO, y luego el script la anula automáticamente.\n');
}

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/return')) { res.writeHead(404); return res.end(); }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    const params = new URLSearchParams(body);
    const token = params.get('token_ws') || new URL(req.url, returnUrl).searchParams.get('token_ws');

    if (!token) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>No llegó token_ws (¿abortaste el pago?)</h2>');
      console.log('\nNo se recibió token_ws. ¿Cancelaste el pago en la página de Webpay?');
      server.close();
      return;
    }

    try {
      const commit = await tx.commit(token);
      console.log('\n=== Resultado del commit ===');
      console.log('Token:', token);
      console.log('Estado:', commit.status);
      console.log('Código de respuesta:', commit.response_code);
      console.log('Código autorización:', commit.authorization_code);
      console.log('Monto:', commit.amount);
      console.log('Orden de compra:', commit.buy_order);
      console.log('=============================\n');

      let refundResult = null;
      if (isRefundScenario && commit.status === 'AUTHORIZED') {
        const refundAmount = scenario === 'anular-parcial' ? Math.floor(amount / 2) : amount;
        console.log(`Anulando ${scenario === 'anular-parcial' ? 'PARCIALMENTE' : 'TOTALMENTE'} por $${refundAmount}...`);
        refundResult = await tx.refund(token, refundAmount);
        console.log('\n=== Resultado de la anulación ===');
        console.log('Token usado (este es el que pegas en el formulario):', token);
        console.log(JSON.stringify(refundResult, null, 2));
        console.log('==================================\n');
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h2>Listo. Estado: ${commit.status}</h2><p>Token: ${token}</p><p>Revisa la consola para el detalle completo. Ya puedes cerrar esta pestaña.</p>`);
    } catch (err) {
      console.error('Error en commit/refund:', err.message || err);
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>Error procesando la transacción, revisa la consola</h2>');
    } finally {
      server.close();
    }
  });
});

server.listen(PORT, async () => {
  try {
    const response = await tx.create(buyOrder, sessionId, amount, returnUrl);
    console.log('Transacción creada. Token:', response.token);
    console.log('\n>>> Abre esta URL en tu navegador para pagar:');
    console.log(response.url + '?token_ws=' + response.token);
    console.log('\nEsperando a que completes el pago... (no cierres esta terminal)\n');
  } catch (err) {
    console.error('Error creando la transacción:', err.message || err);
    server.close();
  }
});