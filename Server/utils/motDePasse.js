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

/**
 * Valide un mot de passe selon la politique configurée (Parametre).
 * Renvoie { valide, message }. "parametre" peut être null/undefined, auquel
 * cas la politique par défaut (6 caractères, pas de complexité exigée)
 * s'applique — ne jamais faire planter la validation faute de réglages.
 */
function validerPolitiqueMotDePasse(motDePasse, parametre) {
    const longueurMin = parametre && parametre.mdp_longueur_min ? parametre.mdp_longueur_min : 6;

    if (!motDePasse || motDePasse.length < longueurMin) {
        return { valide: false, message: `Le mot de passe doit contenir au moins ${longueurMin} caractères.` };
    }

    if (parametre && parametre.mdp_complexite) {
        const aMinuscule = /[a-z]/.test(motDePasse);
        const aMajuscule = /[A-Z]/.test(motDePasse);
        const aChiffre = /[0-9]/.test(motDePasse);
        if (!aMinuscule || !aMajuscule || !aChiffre) {
            return { valide: false, message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.' };
        }
    }

    return { valide: true, message: null };
}

module.exports = { hacher, verifier, validerPolitiqueMotDePasse };
