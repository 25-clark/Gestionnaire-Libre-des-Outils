const { execFile } = require('child_process');
const net = require('net');

// Sécurité : la cible est toujours passée en argument de tableau à execFile
// (jamais via un shell), donc pas d'injection de commande possible. On valide
// quand même le format pour rejeter les entrées absurdes tôt et donner un
// message clair, plutôt que de laisser la commande système échouer.
const REGEX_CIBLE = /^[a-zA-Z0-9](?:[a-zA-Z0-9\-.]{0,253}[a-zA-Z0-9])?$/;

function cibleValide(cible) {
    return typeof cible === 'string' && cible.length > 0 && cible.length <= 255 && REGEX_CIBLE.test(cible);
}

function executer(commande, args, res) {
    execFile(commande, args, { timeout: 10000, windowsHide: true }, (err, stdout, stderr) => {
        if (err && err.killed) {
            return res.json({ ok: false, sortie: (stdout || '') + '\n[Interrompu : délai de 10s dépassé]' });
        }
        if (err && err.code === 'ENOENT') {
            return res.json({ ok: false, sortie: `La commande "${commande}" n'est pas disponible sur ce serveur.` });
        }
        // ping/traceroute renvoient un code de sortie != 0 en cas d'hôte
        // injoignable : ce n'est pas une erreur serveur, juste un résultat
        // négatif à afficher tel quel.
        const sortie = (stdout || '') + (stderr ? `\n${stderr}` : '');
        res.json({ ok: true, sortie: sortie.trim() || '(aucune sortie)' });
    });
}

function commandePing(cible) {
    return process.platform === 'win32'
        ? { commande: 'ping', args: ['-n', '4', cible] }
        : { commande: 'ping', args: ['-c', '4', cible] };
}

function commandeTraceroute(cible) {
    return process.platform === 'win32'
        ? { commande: 'tracert', args: ['-h', '15', '-w', '2000', cible] }
        : { commande: 'traceroute', args: ['-m', '15', '-w', '2', cible] };
}

async function ping(req, res) {
    const { cible } = req.query;
    if (!cibleValide(cible)) return res.status(400).json({ ok: false, sortie: 'Adresse ou nom d\'hôte invalide.' });
    const { commande, args } = commandePing(cible);
    executer(commande, args, res);
}

async function traceroute(req, res) {
    const { cible } = req.query;
    if (!cibleValide(cible)) return res.status(400).json({ ok: false, sortie: 'Adresse ou nom d\'hôte invalide.' });
    const { commande, args } = commandeTraceroute(cible);
    executer(commande, args, res);
}

async function nslookup(req, res) {
    const { cible } = req.query;
    if (!cibleValide(cible)) return res.status(400).json({ ok: false, sortie: 'Adresse ou nom d\'hôte invalide.' });
    executer('nslookup', [cible], res);
}

// Pas de commande système : implémenté directement en Node (net.Socket),
// donc toujours disponible, quel que soit l'OS du serveur.
async function testPort(req, res) {
    const { cible, port } = req.query;
    const numPort = parseInt(port, 10);

    if (!cibleValide(cible)) return res.status(400).json({ ok: false, sortie: 'Adresse ou nom d\'hôte invalide.' });
    if (!numPort || numPort < 1 || numPort > 65535) {
        return res.status(400).json({ ok: false, sortie: 'Port invalide (1-65535).' });
    }

    const debut = Date.now();
    const socket = new net.Socket();
    let repondu = false;

    socket.setTimeout(4000);

    socket.on('connect', () => {
        repondu = true;
        const duree = Date.now() - debut;
        socket.destroy();
        res.json({ ok: true, sortie: `Port ${numPort} sur ${cible} : OUVERT (connexion établie en ${duree} ms)` });
    });

    socket.on('timeout', () => {
        if (repondu) return;
        socket.destroy();
        res.json({ ok: true, sortie: `Port ${numPort} sur ${cible} : PAS DE RÉPONSE (délai de 4s dépassé — probablement filtré ou fermé)` });
    });

    socket.on('error', (err) => {
        if (repondu) return;
        socket.destroy();
        res.json({ ok: true, sortie: `Port ${numPort} sur ${cible} : FERMÉ ou injoignable (${err.code || err.message})` });
    });

    socket.connect(numPort, cible);
}

module.exports = { ping, traceroute, nslookup, testPort };
