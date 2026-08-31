/* Creado por LimónStudioss. s.melladoo */
const fs = require('fs');
const configured = String(process.env.BACKEND_URL || 'https://api.abogago.online').trim().replace(/\/$/, '');
if (!configured.startsWith('https://')) throw new Error('BACKEND_URL debe usar HTTPS');
const api = `${configured}/api`;
const content = `/* Creado por LimónStudioss. s.melladoo */\nwindow.ABOGAGO_API_BASE = ${JSON.stringify(api)};\n`;
fs.writeFileSync('js/runtime-config.js', content, 'utf8');
console.log(`ABOGA GO API configurada: ${api}`);
