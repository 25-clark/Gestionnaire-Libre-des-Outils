/**
 * Chiffrement des credentials d'outils au repos (AES-256-GCM).
 *
 * Format stocké pour chaque valeur : "enc:<iv_hex>:<tag_hex>:<cipher_hex>"
 * Les libellés restent en clair (non secrets). Les anciennes valeurs en clair
 * sont acceptées à la lecture (rétrocompatibilité) et re-chiffrées à la
 * prochaine sauvegarde.
 *
 * Clé : CREDENTIALS_SECRET (32 octets hex ou chaîne quelconque dérivée via
 * scrypt). À défaut, SESSION_SECRET est utilisé — à définir en production.
 */
const crypto = require('crypto');

const PREFIX = 'enc:';
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;

let _keyCache = null;

function obtenirCle() {
    if (_keyCache) return _keyCache;
    const secret = process.env.CREDENTIALS_SECRET || process.env.SESSION_SECRET || 'glo-dev-credentials-insecure';
    // Dérivation déterministe pour obtenir exactement 32 octets
    _keyCache = crypto.scryptSync(String(secret), 'glo-credentials-v1', KEY_LEN);
    return _keyCache;
}

function chiffrerValeur(texte) {
    if (texte == null || texte === '') return '';
    const plain = String(texte);
    // Déjà chiffré → ne pas re-chiffrer
    if (plain.startsWith(PREFIX)) return plain;

    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, obtenirCle(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + [iv, tag, encrypted].map(b => b.toString('hex')).join(':');
}

function dechiffrerValeur(stocke) {
    if (stocke == null || stocke === '') return '';
    const s = String(stocke);
    if (!s.startsWith(PREFIX)) {
        // Ancienne valeur en clair (migration)
        return s;
    }
    try {
        const parts = s.slice(PREFIX.length).split(':');
        if (parts.length !== 3) return '';
        const [ivHex, tagHex, dataHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const data = Buffer.from(dataHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGO, obtenirCle(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch (err) {
        // Clé incorrecte ou données corrompues
        console.error('[credentialsCrypto] échec déchiffrement:', err.message);
        return '[déchiffrement impossible]';
    }
}

/**
 * Chiffre un tableau de credentials [{ label, valeur }, ...]
 * → valeurs chiffrées pour stockage en base.
 */
function chiffrerCredentials(liste) {
    if (!Array.isArray(liste)) return [];
    return liste
        .filter(c => c && (c.label || c.valeur))
        .map(c => ({
            label: String(c.label || '').trim() || 'Champ',
            valeur: chiffrerValeur(c.valeur == null ? '' : String(c.valeur))
        }));
}

/**
 * Déchiffre un tableau de credentials pour exposition API / UI.
 */
function dechiffrerCredentials(liste) {
    if (!Array.isArray(liste)) return [];
    return liste.map(c => ({
        label: c && c.label != null ? String(c.label) : 'Champ',
        valeur: dechiffrerValeur(c && c.valeur != null ? c.valeur : '')
    }));
}

/**
 * Applique le déchiffrement sur un objet outil (instance Sequelize ou plain).
 * Mutile une copie JSON pour ne pas toucher l'instance en cache.
 */
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
    dechiffrerOutils
};
