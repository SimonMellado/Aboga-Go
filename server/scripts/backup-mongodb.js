/* Creado por LimónStudioss. s.melladoo */
require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { keyMaterial } = require('../utils/encryption');

const uri = String(process.env.MONGODB_URI || '').trim();
if (!uri) throw new Error('MONGODB_URI no está configurada');
const dir = path.resolve(process.env.BACKUP_OUTPUT_DIR || path.join(__dirname, '..', 'backups'));
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const plain = path.join(dir, `abogago-${stamp}.archive.gz`);
const encrypted = `${plain}.aesgcm`;

function runDump() {
  return new Promise((resolve, reject) => {
    const p = spawn('mongodump', [`--uri=${uri}`, '--archive=' + plain, '--gzip'], { stdio: 'inherit' });
    p.on('error', reject);
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`mongodump terminó con código ${code}`)));
  });
}

async function encryptBackup() {
  const key = keyMaterial('BACKUP_ENCRYPTION_KEY');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const input = fs.createReadStream(plain);
  const output = fs.createWriteStream(encrypted);
  output.write(Buffer.from('ABOGAGO-BACKUP-V1\n'));
  output.write(iv);
  await new Promise((resolve, reject) => {
    input.pipe(cipher).pipe(output, { end: false });
    input.on('error', reject); cipher.on('error', reject); output.on('error', reject);
    cipher.on('end', () => {
      output.write(cipher.getAuthTag());
      output.end(resolve);
    });
  });
  fs.unlinkSync(plain);
}

(async () => {
  await runDump();
  await encryptBackup();
  console.log(`Backup cifrado creado: ${encrypted}`);
})().catch(err => { console.error(err.message); process.exit(1); });
