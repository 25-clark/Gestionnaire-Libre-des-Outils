const { execFile } = require('child_process');
const net = require('net');

// Sécurité : la cible est toujours passée en argument de tableau à execFile
// (jamais via un shell), donc pas d'injection de commande possible.
const REGEX_CIBLE = /^[a-zA-Z0-9](?:[a-zA-Z0-9\-.]{0,253}[a-zA-Z0-9])?$/;

function cibleValide(cible) {
    return typeof cible === 'string' && cible.length > 0 && cible.length <= 255 && REGEX_CIBLE.test(cible);
}

/**
 * Décodage de la sortie console Windows.
 * ping / tracert / nslookup écrivent en page de code OEM (souvent CP850 en FR),
 * pas en UTF-8 → d'où les « � » si on décode mal.
 */
const CP850 = (() => {
    // Table partielle CP850 → Unicode (caractères utiles FR + ponctuation console)
    const map = {
        0x80: 0x00C7, 0x81: 0x00FC, 0x82: 0x00E9, 0x83: 0x00E2, 0x84: 0x00E4,
        0x85: 0x00E0, 0x86: 0x00E5, 0x87: 0x00E7, 0x88: 0x00EA, 0x89: 0x00EB,
        0x8A: 0x00E8, 0x8B: 0x00EF, 0x8C: 0x00EE, 0x8D: 0x00EC, 0x8E: 0x00C4,
        0x8F: 0x00C5, 0x90: 0x00C9, 0x91: 0x00E6, 0x92: 0x00C6, 0x93: 0x00F4,
        0x94: 0x00F6, 0x95: 0x00F2, 0x96: 0x00FB, 0x97: 0x00F9, 0x98: 0x00FF,
        0x99: 0x00D6, 0x9A: 0x00DC, 0x9B: 0x00F8, 0x9C: 0x00A3, 0x9D: 0x00D8,
        0x9E: 0x00D7, 0x9F: 0x0192, 0xA0: 0x00E1, 0xA1: 0x00ED, 0xA2: 0x00F3,
        0xA3: 0x00FA, 0xA4: 0x00F1, 0xA5: 0x00D1, 0xA6: 0x00AA, 0xA7: 0x00BA,
        0xA8: 0x00BF, 0xA9: 0x00AE, 0xAA: 0x00AC, 0xAB: 0x00BD, 0xAC: 0x00BC,
        0xAD: 0x00A1, 0xAE: 0x00AB, 0xAF: 0x00BB, 0xB5: 0x00C1, 0xB6: 0x00C2,
        0xB7: 0x00C0, 0xB8: 0x00A9, 0xC6: 0x00E3, 0xC7: 0x00C3, 0xD0: 0x00F0,
        0xD1: 0x00D0, 0xD2: 0x00CA, 0xD3: 0x00CB, 0xD4: 0x00C8, 0xD5: 0x0131,
        0xD6: 0x00CD, 0xD7: 0x00CE, 0xD8: 0x00CF, 0xDD: 0x00A6, 0xDE: 0x00CC,
        0xE0: 0x00D3, 0xE1: 0x00DF, 0xE2: 0x00D4, 0xE3: 0x00D2, 0xE4: 0x00F5,
        0xE5: 0x00D5, 0xE7: 0x00FE, 0xE8: 0x00DE, 0xE9: 0x00DA, 0xEA: 0x00DB,
        0xEB: 0x00D9, 0xEC: 0x00FD, 0xED: 0x00DD, 0xEE: 0x00AF, 0xEF: 0x00B4,
        0xF8: 0x00B0, 0xF9: 0x00B7, 0xFA: 0x00B7, 0xF3: 0x00BE, 0xF6: 0x00F7
    };
    const table = new Array(256);
    for (let i = 0; i < 256; i++) {
        table[i] = map[i] ? String.fromCharCode(map[i]) : String.fromCharCode(i);
    }
    return table;
})();

function decoderSortie(buf) {
    if (buf == null) return '';
    if (typeof buf === 'string') return buf;
    if (!Buffer.isBuffer(buf) || buf.length === 0) return '';

    // UTF-8 valide et sans caractère de remplacement
    const utf8 = buf.toString('utf8');
    if (!utf8.includes('\uFFFD')) {
        return utf8;
    }

    // Windows console FR : CP850 (OEM)
    if (process.platform === 'win32') {
        let s = '';
        for (let i = 0; i < buf.length; i++) {
            s += CP850[buf[i]];
        }
        return s;
    }

    // Fallback latin1
    return buf.toString('latin1');
}

function executer(commande, args, res) {
    execFile(
        commande,
        args,
        { timeout: 15000, windowsHide: true, encoding: 'buffer', maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
            if (err && err.killed) {
                return res.json({
                    ok: false,
                    sortie: decoderSortie(stdout) + '\n[Interrompu : délai dépassé]'
                });
            }
            if (err && err.code === 'ENOENT') {
                return res.json({
                    ok: false,
                    sortie: `La commande "${commande}" n'est pas disponible sur ce serveur.`
                });
            }
            // Code de sortie != 0 (hôte injoignable) : on affiche quand même la sortie
            const sortie = decoderSortie(stdout) + (stderr && stderr.length ? '\n' + decoderSortie(stderr) : '');
            res.json({ ok: true, sortie: sortie.trim() || '(aucune sortie)' });
        }
    );
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
    if (!cibleValide(cible)) {
        return res.status(400).json({ ok: false, sortie: 'Adresse ou nom d\'hôte invalide.' });
    }
    const { commande, args } = commandePing(cible);
    executer(commande, args, res);
}

async function traceroute(req, res) {
    const { cible } = req.query;
    if (!cibleValide(cible)) {
        return res.status(400).json({ ok: false, sortie: 'Adresse ou nom d\'hôte invalide.' });
    }
    const { commande, args } = commandeTraceroute(cible);
    executer(commande, args, res);
}

async function nslookup(req, res) {
    const { cible } = req.query;
    if (!cibleValide(cible)) {
        return res.status(400).json({ ok: false, sortie: 'Adresse ou nom d\'hôte invalide.' });
    }
    executer('nslookup', [cible], res);
}

async function testPort(req, res) {
    const { cible, port } = req.query;
    const numPort = parseInt(port, 10);

    if (!cibleValide(cible)) {
        return res.status(400).json({ ok: false, sortie: 'Adresse ou nom d\'hôte invalide.' });
    }
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
        res.json({
            ok: true,
            sortie: `Port ${numPort} sur ${cible} : OUVERT (connexion établie en ${duree} ms)`
        });
    });

    socket.on('timeout', () => {
        if (repondu) return;
        socket.destroy();
        res.json({
            ok: true,
            sortie: `Port ${numPort} sur ${cible} : PAS DE RÉPONSE (délai de 4s dépassé — probablement filtré ou fermé)`
        });
    });

    socket.on('error', (err) => {
        if (repondu) return;
        socket.destroy();
        res.json({
            ok: true,
            sortie: `Port ${numPort} sur ${cible} : FERMÉ ou injoignable (${err.code || err.message})`
        });
    });

    socket.connect(numPort, cible);
}


/** Commandes réseau autorisées (pas d'accès shell arbitraire). */
const ALLOW_WIN = new Set([
    'ping', 'tracert', 'pathping', 'nslookup', 'ipconfig', 'netstat',
    'arp', 'hostname', 'route', 'systeminfo', 'getmac'
]);
const ALLOW_PS = new Set([
    'get-netipconfiguration', 'get-netipaddress', 'get-dnsclientserveraddress',
    'get-netroute', 'test-netconnection', 'resolve-dnsname', 'get-netadapter',
    'get-nettcpconnection'
]);
const ALLOW_UNIX = new Set([
    'ping', 'traceroute', 'tracepath', 'nslookup', 'dig', 'host',
    'ip', 'ifconfig', 'netstat', 'ss', 'arp', 'hostname', 'route'
]);

function argsSur(args) {
    // Autorise lettres, chiffres, points, tirets, underscore, :, /, =, *, espaces déjà découpés
    return args.every(a => typeof a === 'string' && a.length <= 200 && /^[a-zA-Z0-9._:\/\-=*@]+$/.test(a));
}

function parserCommande(ligne) {
    const brute = String(ligne || '').trim();
    if (!brute || brute.length > 400) return { erreur: 'Commande vide ou trop longue (max 400 caractères).' };
    if (/[|&;`$<>(){}\[\]!"']/.test(brute)) {
        return { erreur: 'Caractères interdits (|; & $ ` < > ( ) { } [ ] " \'). Utilisez une commande simple sans pipe ni redirection.' };
    }
    const parts = brute.split(/\s+/).filter(Boolean);
    const head = parts[0].toLowerCase();
    const args = parts.slice(1);
    if (!argsSur(args)) {
        return { erreur: 'Arguments non autorisés. Utilisez uniquement des valeurs simples (IP, noms, options -n, etc.).' };
    }

    if (process.platform === 'win32') {
        if (ALLOW_WIN.has(head)) {
            return { commande: head, args };
        }
        if (ALLOW_PS.has(head)) {
            // PowerShell : un seul cmdlet + args sûrs
            const psLine = parts.join(' ');
            return {
                commande: 'powershell.exe',
                args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psLine]
            };
        }
        return {
            erreur: 'Commande non autorisée. Autorisées : ' +
                [...ALLOW_WIN].join(', ') + ' · PowerShell : ' + [...ALLOW_PS].join(', ')
        };
    }

    if (ALLOW_UNIX.has(head)) {
        return { commande: head, args };
    }
    return {
        erreur: 'Commande non autorisée. Autorisées : ' + [...ALLOW_UNIX].join(', ')
    };
}

async function commandeLibre(req, res) {
    const ligne = req.body && req.body.commande != null ? req.body.commande : req.query.commande;
    const parsed = parserCommande(ligne);
    if (parsed.erreur) {
        return res.status(400).json({ ok: false, sortie: parsed.erreur });
    }
    executer(parsed.commande, parsed.args, res);
}

module.exports = { ping, traceroute, nslookup, testPort, commandeLibre };

