// Anti-brute-force par IP, en complément du blocage par matricule (voir
// Utilisateur.tentatives_echouees, persisté en base). Celui-ci protège contre
// quelqu'un qui teste plusieurs matricules différents depuis la même machine
// (le blocage par matricule seul ne l'empêcherait pas).
//
// Stocké en mémoire (Map), pas en base : c'est une protection complémentaire
// et temporaire, pas une donnée métier — un redémarrage du serveur remet les
// compteurs à zéro, ce qui est acceptable pour un outil interne mono-instance.

const tentativesParIp = new Map();

/**
 * Renvoie le nombre de millisecondes restantes avant déblocage (0 si
 * l'IP n'est pas bloquée). Purge automatiquement l'entrée si le blocage
 * est expiré.
 */
function verifierBlocageIp(ip) {
    const entree = tentativesParIp.get(ip);
    if (!entree || !entree.bloqueJusqua) return 0;

    const restant = entree.bloqueJusqua - Date.now();
    if (restant <= 0) {
        tentativesParIp.delete(ip);
        return 0;
    }
    return restant;
}

/**
 * Enregistre un échec de connexion pour cette IP. Si le nombre de tentatives
 * atteint le seuil configuré, bloque l'IP pour la durée configurée.
 */
function enregistrerEchecIp(ip, maxTentatives, dureeBlocageMs) {
    const entree = tentativesParIp.get(ip) || { compte: 0, bloqueJusqua: null };
    entree.compte += 1;

    if (entree.compte >= maxTentatives) {
        entree.bloqueJusqua = Date.now() + dureeBlocageMs;
    }

    tentativesParIp.set(ip, entree);
}

/**
 * Remet le compteur à zéro pour cette IP (à appeler après une connexion réussie).
 */
function reinitialiserIp(ip) {
    tentativesParIp.delete(ip);
}

// Purge périodique des entrées inactives (non bloquées ou expirées), pour
// éviter une fuite mémoire lente sur un serveur qui tourne longtemps.
// .unref() : ce timer ne doit jamais empêcher le process de s'arrêter.
setInterval(() => {
    const maintenant = Date.now();
    for (const [ip, entree] of tentativesParIp.entries()) {
        if (!entree.bloqueJusqua || entree.bloqueJusqua < maintenant) {
            tentativesParIp.delete(ip);
        }
    }
}, 30 * 60 * 1000).unref();

module.exports = { verifierBlocageIp, enregistrerEchecIp, reinitialiserIp };
