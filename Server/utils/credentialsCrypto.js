/**
 * Chiffrement des credentials au repos.
 * Algorithmes supportés : aes-256-gcm (défaut), aes-256-cbc, chacha20-poly1305.
 * Format : "enc:<algo>:<iv_hex>:<tag_hex_ou_vide>:<cipher_hex>"
 * Ancien format "enc:<iv>:<tag>:<data>" = aes-256-gcm (rétrocompat).
 */
const crypto = require('crypto');
const { Parametre } = require('../models');

const PREFIX = 'enc:';
const KEY_LEN = 32;
const ALGOS = {
    'aes-256-gcm': { ivLen: 12, auth: true },
    'aes-256-cbc': { ivLen: 16, auth: false },
    'chacha20-poly1305': { ivLen: 12, auth: true }
};

let _keyCache = null;
let _algoCache = null;

function obtenirCle() {
    if (_keyCache) return _keyCache;
    const secret = process.env.CREDENTIALS_SECRET || process.env.SESSION_SECRET || 'glo-dev-credentials-insecure';
    _keyCache = crypto.scryptSync(String(secret), 'glo-credentials-v1', KEY_LEN);
    return _keyCache;
}

async function obtenirAlgo() {
    if (_algoCache) return _algoCache;
    try {
        const p = await Parametre.findByPk(1);
        const a = (p && p.chiffrement_algo) || 'aes-256-gcm';
        _algoCache = ALGOS[a] ? a : 'aes-256-gcm';
    } catch {
        _algoCache = 'aes-256-gcm';
    }
    return _algoCache;
}

function definirAlgo(algo) {
    _algoCache = ALGOS[algo] ? algo : 'aes-256-gcm';
}

function chiffrerValeur(texte, algoForce) {
    if (texte == null || texte === '') return '';
    const plain = String(texte);
    if (plain.startsWith(PREFIX)) return plain;

    const algo = (algoForce && ALGOS[algoForce]) ? algoForce : (_algoCache || 'aes-256-gcm');
    const meta = ALGOS[algo];
    const iv = crypto.randomBytes(meta.ivLen);
    const cipher = crypto.createCipheriv(algo, obtenirCle(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = meta.auth ? cipher.getAuthTag() : Buffer.alloc(0);
    return PREFIX + [algo, iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

function dechiffrerValeur(stocke) {
    if (stocke == null || stocke === '') return '';
    const s = String(stocke);
    if (!s.startsWith(PREFIX)) return s;
    try {
        const parts = s.slice(PREFIX.length).split(':');
        let algo, ivHex, tagHex, dataHex;
        if (parts.length === 4 && ALGOS[parts[0]]) {
            [algo, ivHex, tagHex, dataHex] = parts;
        } else if (parts.length === 3) {
            // Ancien format GCM
            algo = 'aes-256-gcm';
            [ivHex, tagHex, dataHex] = parts;
        } else {
            return '';
        }
        const meta = ALGOS[algo] || ALGOS['aes-256-gcm'];
        const iv = Buffer.from(ivHex, 'hex');
        const data = Buffer.from(dataHex, 'hex');
        const decipher = crypto.createDecipheriv(algo, obtenirCle(), iv);
        if (meta.auth && tagHex) {
            decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        }
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch (err) {
        console.error('[credentialsCrypto] échec déchiffrement:', err.message);
        return '[déchiffrement impossible]';
    }
}

function chiffrerCredentials(liste) {
    if (!Array.isArray(liste)) return [];
    return liste
        .filter(c => c && (c.label || c.valeur))
        .map(c => ({
            label: String(c.label || '').trim() || 'Champ',
            valeur: chiffrerValeur(c.valeur == null ? '' : String(c.valeur))
        }));
}

function dechiffrerCredentials(liste) {
    if (!Array.isArray(liste)) return [];
    return liste.map(c => ({
        label: c && c.label != null ? String(c.label) : 'Champ',
        valeur: dechiffrerValeur(c && c.valeur != null ? c.valeur : '')
    }));
}

function dechiffrerOutil(outil) {
    if (!outil) return outil;
    const json = typeof outil.toJSON === 'function' ? outil.toJSON() : { ...outil };
    if (json.credentials) {
        json.credentials = dechiffrerCredentials(json.credentials);
    }
    return json;
}

function dechiffrerOutils(outils) {
    if (!Array.isArray(outils)) return outils;
    return outils.map(dechiffrerOutil);
}

module.exports = {
    chiffrerValeur,
    dechiffrerValeur,
    chiffrerCredentials,
    dechiffrerCredentials,
    dechiffrerOutil,
    dechiffrerOutils,
    obtenirAlgo,
    definirAlgo,
    ALGOS: Object.keys(ALGOS)
};
