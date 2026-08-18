/**
 * TOTP (RFC 6238) — implémentation native, sans dépendance npm.
 */
const crypto = require('crypto');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function genererSecret(bytes) {
    bytes = bytes || 20;
    const buf = crypto.randomBytes(bytes);
    let bits = '';
    for (let i = 0; i < buf.length; i++) {
        bits += buf[i].toString(2).padStart(8, '0');
    }
    let out = '';
    for (let i = 0; i + 5 <= bits.length; i += 5) {
        out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
    }
    return out;
}

function base32Decode(str) {
    str = String(str).toUpperCase().replace(/=+$/g, '').replace(/\s/g, '');
    let bits = '';
    for (let i = 0; i < str.length; i++) {
        const val = BASE32.indexOf(str[i]);
        if (val < 0) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return Buffer.from(bytes);
}

function hotp(secretBuf, counter) {
    const bufr = Buffer.alloc(8);
    // write counter as big-endian 64-bit
    bufr.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    bufr.writeUInt32BE(counter >>> 0, 4);
    const hmac = crypto.createHmac('sha1', secretBuf).update(bufr).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    return String(code % 1000000).padStart(6, '0');
}

function totp(secretBase32, step, atMs) {
    if (step == null) step = 30;
    if (atMs == null) atMs = Date.now();
    const counter = Math.floor(atMs / 1000 / step);
    const secretBuf = base32Decode(secretBase32);
    return hotp(secretBuf, counter);
}

function verifierTotp(secretBase32, token, fenetre) {
    if (fenetre == null) fenetre = 1;
    if (!secretBase32 || !token) return false;
    const t = String(token).replace(/\s/g, '');
    if (!/^\d{6}$/.test(t)) return false;
    const now = Date.now();
    for (let i = -fenetre; i <= fenetre; i++) {
        if (totp(secretBase32, 30, now + i * 30 * 1000) === t) return true;
    }
    return false;
}

function otpauthUrl(opts) {
    opts = opts || {};
    const secret = opts.secret;
    const label = encodeURIComponent(opts.label || 'user');
    const issuer = encodeURIComponent(opts.issuer || 'GLO');
    return 'otpauth://totp/' + issuer + ':' + label +
        '?secret=' + secret +
        '&issuer=' + issuer +
        '&algorithm=SHA1&digits=6&period=30';
}

module.exports = { genererSecret, totp, verifierTotp, otpauthUrl };
