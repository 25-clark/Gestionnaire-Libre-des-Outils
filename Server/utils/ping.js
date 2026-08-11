const { execFile } = require('child_process');

// Même validation que diagnosticController.js (cible passée en argument de
// tableau à execFile, jamais via un shell : pas d'injection possible).
const REGEX_CIBLE = /^[a-zA-Z0-9](?:[a-zA-Z0-9\-.]{0,253}[a-zA-Z0-9])?$/;

function cibleValide(cible) {
    return typeof cible === 'string' && cible.length > 0 && cible.length <= 255 && REGEX_CIBLE.test(cible);
}

/**
 * Un seul paquet, timeout court : suffisant pour un statut périodique
 * en ligne/hors ligne (contrairement au diagnostic manuel, à 4 paquets,
 * pensé pour être lu par un humain). Ne rejette jamais : renvoie une
 * simple Promise<boolean>, pratique pour un planificateur en arrière-plan.
 */
function pingSimple(cible) {
    return new Promise((resolve) => {
        if (!cibleValide(cible)) return resolve(false);

        const { commande, args } = process.platform === 'win32'
            ? { commande: 'ping', args: ['-n', '1', '-w', '2000', cible] }
            : { commande: 'ping', args: ['-c', '1', '-W', '2', cible] };

        execFile(commande, args, { timeout: 5000, windowsHide: true }, (err) => {
            resolve(!err);
        });
    });
}

module.exports = { pingSimple, cibleValide };
