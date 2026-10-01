const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

function keyPath(databasePath) {
  return path.join(path.dirname(databasePath), 'WebCredentials', 'keyring.json');
}

function readKeyring(filePath) {
  if (!fs.existsSync(filePath)) return { version: 1, activeKeyId: '', keys: {} };
  let ring;
  try { ring = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { throw new Error('無法讀取網頁密碼金鑰檔，請檢查檔案權限與完整性。'); }
  if (ring.version !== 1 || !ring.keys || typeof ring.keys !== 'object') throw new Error('網頁密碼金鑰檔格式不正確。');
  for (const [id, key] of Object.entries(ring.keys)) {
    if (!/^[a-f0-9]{32}$/.test(id) || typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) {
      throw new Error('網頁密碼金鑰檔內容不正確。');
    }
  }
  if (ring.activeKeyId && !ring.keys[ring.activeKeyId]) throw new Error('網頁密碼使用中的金鑰不存在。');
  return ring;
}

function writeKeyring(filePath, ring) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(ring), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.renameSync(temporaryPath, filePath);
}

function validatePassword(password, card = '') {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128 || password !== password.trim()) {
    throw new Error('個人網頁密碼須為 8 至 128 個字元，前後不可留空白。');
  }
  if (password === String(card || '').trim()) throw new Error('個人網頁密碼不可與卡號相同。');
}

async function createCredential(databasePath, employeeId, password) {
  const filePath = keyPath(databasePath);
  const ring = readKeyring(filePath);
  if (!ring.activeKeyId) {
    ring.activeKeyId = crypto.randomBytes(16).toString('hex');
    ring.keys[ring.activeKeyId] = crypto.randomBytes(32).toString('hex');
    writeKeyring(filePath, ring);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ring.keys[ring.activeKeyId], 'hex'), iv);
  cipher.setAAD(Buffer.from(`TanChin-web-password:${employeeId}`, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return {
    version: 1, salt, hash, keyId: ring.activeKeyId,
    iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: encrypted.toString('hex')
  };
}

async function verifyPassword(credential, password) {
  if (!credential || typeof password !== 'string' || password.length > 128 || !/^[a-f0-9]{128}$/.test(credential.hash || '')) return false;
  const actual = await scrypt(password, credential.salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(credential.hash, 'hex'));
}

function revealPassword(databasePath, employeeId, credential) {
  const ring = readKeyring(keyPath(databasePath));
  const key = ring.keys[credential.keyId];
  if (!key) throw new Error('缺少這個帳號的網頁密碼解密金鑰，請還原完整備份或重設密碼。');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(credential.iv, 'hex'));
  decipher.setAAD(Buffer.from(`TanChin-web-password:${employeeId}`, 'utf8'));
  decipher.setAuthTag(Buffer.from(credential.tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(credential.ciphertext, 'hex')), decipher.final()]).toString('utf8');
}

function backupKeys(databasePath, backupPath, requiredKeyIds) {
  if (!requiredKeyIds.length) return '';
  const source = keyPath(databasePath);
  const ring = readKeyring(source);
  if (requiredKeyIds.some((id) => !ring.keys[id])) throw new Error('缺少網頁密碼金鑰，無法產生可完整還原的備份。');
  const sidecarPath = `${backupPath}.web-credentials.json`;
  fs.copyFileSync(source, sidecarPath);
  return sidecarPath;
}

function prepareRestoreKeys(databasePath, backupPath, requiredKeyIds) {
  if (!requiredKeyIds.length) return;
  const destination = keyPath(databasePath);
  const ring = readKeyring(destination);
  const incoming = readKeyring(`${backupPath}.web-credentials.json`);
  for (const [id, key] of Object.entries(incoming.keys)) {
    if (ring.keys[id] && ring.keys[id] !== key) throw new Error('備份網頁密碼金鑰與目前金鑰衝突，已停止還原。');
  }
  const keys = { ...ring.keys, ...incoming.keys };
  if (requiredKeyIds.some((id) => !keys[id])) throw new Error('備份缺少網頁密碼金鑰附檔，已停止還原；目前資料庫未變更。');
  // Keep old keys so pre-restore emergency backups remain decryptable.
  writeKeyring(destination, { version: 1, activeKeyId: ring.activeKeyId || incoming.activeKeyId, keys });
}

module.exports = { createCredential, verifyPassword, revealPassword, validatePassword, backupKeys, prepareRestoreKeys, keyPath };
