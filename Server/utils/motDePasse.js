const crypto = require('crypto');

// Hachage de mot de passe avec scrypt (module natif de Node, pas de
// dépendance externe comme bcrypt à installer). Format stocké :
// "sel:hachage" (les deux en hexadécimal).

function hacher(motDePasse) {
    const sel = crypto.randomBytes(16).toString('hex');
    const hachage = crypto.scryptSync(motDePasse, sel, 64).toString('hex');
    return `${sel}:${hachage}`;
}

function verifier(motDePasse, valeurStockee) {
    if (!motDePasse || !valeurStockee || !valeurStockee.includes(':')) return false;
    const [sel, hachage] = valeurStockee.split(':');
    const hachageCalcule = crypto.scryptSync(motDePasse, sel, 64);
    const hachageAttendu = Buffer.from(hachage, 'hex');
    if (hachageCalcule.length !== hachageAttendu.length) return false;
    return crypto.timingSafeEqual(hachageCalcule, hachageAttendu);
}

module.exports = { hacher, verifier };
