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

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

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
            expire: Date.now() + 15000
        };
    } catch {
        cachePublic = { nom_entreprise: null, credentials_actifs: false, installation_terminee: true, expire: Date.now() + 15000 };
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
app.use(async (req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    res.locals.page = '';
    res.locals.peut = (resource, action) => peutFaire(res.locals.currentUser, resource, action);
    // Préférences compte (thème / langue)
    const prefs = normaliserPreferences(res.locals.currentUser && res.locals.currentUser.preferences);
    if (res.locals.currentUser) {
        res.locals.currentUser.preferences = prefs;
    }
    res.locals.prefs = prefs;
    res.locals.lang = prefs.langue;
    res.locals.t = creerTraducteur(prefs.langue);
    const pub = await obtenirParametresPublics();
    res.locals.nomEntreprise = pub.nom_entreprise;
    res.locals.credentialsActifs = pub.credentials_actifs;
    res.locals.nomApplication = res.locals.nomEntreprise || 'Gestionnaire Outils';

    res.locals.notificationsNonLues = 0;
    if (res.locals.currentUser && req.session.apiCookie) {
        try {
            const { data } = await apiClient(req).get('/notifications/non-lues/nombre');
            res.locals.notificationsNonLues = data.nombre;
        } catch { /* pas bloquant : l'en-tête s'affiche juste sans le badge */ }
    }

    // Première installation : rediriger vers l'assistant
    const path = req.path || '';
    const estInstallation = path === '/installation' || path.startsWith('/installation/');
    const estPublic = path === '/login' || path.startsWith('/login') || path === '/cgu';
    if (!pub.installation_terminee && !estInstallation && !estPublic && !path.startsWith('/css') && !path.startsWith('/js') && !path.startsWith('/favicon')) {
        return res.redirect('/installation');
    }

    next();
});

app.use('/installation', installationRoutes);
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
