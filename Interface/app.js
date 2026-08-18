require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const activiteRoutes = require('./routes/activiteRoutes');
const sousActiviteRoutes = require('./routes/sousActiviteRoutes');
const utilisateurRoutes = require('./routes/utilisateurRoutes');
const outilRoutes = require('./routes/outilRoutes');
const roleRoutes = require('./routes/roleRoutes');
const accesRoutes = require('./routes/accesRoutes');
const rechercheRoutes = require('./routes/rechercheRoutes');
const parametreRoutes = require('./routes/parametreRoutes');
const diagnosticRoutes = require('./routes/diagnosticRoutes');
const journalRoutes = require('./routes/journalRoutes');
const statistiqueRoutes = require('./routes/statistiqueRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const ldapRoutes = require('./routes/ldapRoutes');
const installationRoutes = require('./routes/installationRoutes');
const aideRoutes = require('./routes/aideRoutes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    etag: true,
    lastModified: true,
    index: false
}));

app.use(session({
    secret: process.env.SESSION_SECRET || 'glo_interface_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8h
}));

const { peutFaire } = require('./middlewares/requireLogin');
const { creerTraducteur, normaliserPreferences } = require('./utils/i18n');
const { apiClient, apiClientAnonyme } = require('./config/api');

// Petit cache en mémoire (30s) pour éviter d'appeler l'API à chaque requête
// juste pour le nom de l'entreprise, affiché dans l'en-tête et le login.
let cachePublic = { nom_entreprise: null, credentials_actifs: false, expire: 0 };
async function obtenirParametresPublics() {
    if (Date.now() < cachePublic.expire) return cachePublic;
    try {
        const { data } = await apiClientAnonyme().get('/parametres/public');
        cachePublic = {
            nom_entreprise: data.nom_entreprise,
            credentials_actifs: !!data.credentials_actifs,
            installation_terminee: !!data.installation_terminee,
            expire: Date.now() + 60000
        };
    } catch {
        cachePublic = { nom_entreprise: null, credentials_actifs: false, installation_terminee: true, expire: Date.now() + 60000 };
    }
    return cachePublic;
}
async function obtenirNomEntreprise() {
    const p = await obtenirParametresPublics();
    return p.nom_entreprise;
}

// Rend l'utilisateur connecté disponible dans toutes les vues EJS, ainsi
// qu'une fonction peut(resource, action) pour n'afficher que les actions
// que l'utilisateur a réellement le droit de faire (cohérent avec les
// permissions vérifiées côté Server, qui reste la source de vérité).
// Cache court du badge notifications (évite 1 requête API / page HTML)
const NOTIF_CACHE_MS = 45 * 1000;

app.use(async (req, res, next) => {
    // Les fichiers statiques sont déjà servis avant ; filet de sécurité
    const pth = req.path || '';
    if (/\.(css|js|png|jpg|jpeg|gif|ico|svg|webp|woff2?|ttf|map)$/i.test(pth)) {
        return next();
    }

    res.locals.currentUser = req.session.user || null;
    res.locals.page = '';
    res.locals.peut = (resource, action) => peutFaire(res.locals.currentUser, resource, action);
    const prefs = normaliserPreferences(res.locals.currentUser && res.locals.currentUser.preferences);
    if (res.locals.currentUser) {
        res.locals.currentUser.preferences = prefs;
    }
    res.locals.prefs = prefs;
    res.locals.lang = prefs.langue;
    res.locals.t = creerTraducteur(prefs.langue);

    // Paramètres publics (cache mémoire 60s — une seule source)
    const pub = await obtenirParametresPublics();
    res.locals.nomEntreprise = pub.nom_entreprise;
    res.locals.credentialsActifs = pub.credentials_actifs;
    res.locals.nomApplication = res.locals.nomEntreprise || 'Gestionnaire Outils';

    // Badge notif : session cache, pas d'appel API à chaque navigation
    res.locals.notificationsNonLues = 0;
    if (res.locals.currentUser && req.session.apiCookie) {
        const now = Date.now();
        const cached = req.session._notifBadge;
        if (cached && (now - cached.ts) < NOTIF_CACHE_MS) {
            res.locals.notificationsNonLues = cached.n;
        } else {
            try {
                const { data } = await apiClient(req).get('/notifications/non-lues/nombre');
                const n = data.nombre || 0;
                req.session._notifBadge = { n, ts: now };
                res.locals.notificationsNonLues = n;
            } catch { /* non bloquant */ }
        }
    }

    const estInstallation = pth === '/installation' || pth.startsWith('/installation/');
    const estPublic = pth === '/login' || pth.startsWith('/login') || pth === '/cgu';
    if (!pub.installation_terminee && !estInstallation && !estPublic) {
        return res.redirect('/installation');
    }

    next();
});

app.use('/installation', installationRoutes);
app.use('/aide', aideRoutes);
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/activites', activiteRoutes);
app.use('/sous-activites', sousActiviteRoutes);
app.use('/utilisateurs', utilisateurRoutes);
app.use('/outils', outilRoutes);
app.use('/roles', roleRoutes);
app.use('/acces', accesRoutes);
app.use('/recherche', rechercheRoutes);
app.use('/parametres', parametreRoutes);
app.use('/diagnostic', diagnosticRoutes);
app.use('/journal', journalRoutes);
app.use('/statistiques', statistiqueRoutes);
app.use('/notifications', notificationRoutes);
app.use('/tickets', ticketRoutes);
app.use('/ldap', ldapRoutes);

// 404
app.use((req, res) => {
    res.status(404).render('erreur', { titre: 'Page introuvable', message: "Cette page n'existe pas." });
});

// Gestion d'erreurs
app.use((err, req, res, next) => {
    console.error(err);
    const message = err.response?.data?.message || err.message || 'Erreur inattendue.';
    res.status(err.response?.status || 500).render('erreur', { titre: 'Erreur', message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Interface GLO démarrée sur http://localhost:${PORT}`);
});
