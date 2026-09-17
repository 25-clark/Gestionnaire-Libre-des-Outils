const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { config: envConfig, logDemarrage } = require('./config/env');

// Diagnostic SMTP au démarrage
(function () {
    const host = (process.env.SMTP_HOST || '').trim();
    if (!host) {
        console.warn('[smtp] Non configuré — définissez SMTP_HOST dans Server/.env');
    } else {
        console.log('[smtp] Config détectée:', host, 'port', process.env.SMTP_PORT || 587, 'user', process.env.SMTP_USER || '(vide)');
        try { require('nodemailer'); console.log('[smtp] nodemailer: OK'); }
        catch { console.warn('[smtp] nodemailer MANQUANT → dans Server/: npm install nodemailer'); }
    }
})();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const FileSessionStore = require('./utils/fileSessionStore');

const { sequelize } = require('./models');
const { demarrerSurveillance } = require('./utils/surveillance');
const { demarrerSlaTickets } = require('./utils/slaTickets');
const { demarrerPlanification } = require('./utils/planification');
const { assurerColonnes } = require('./utils/assurerColonnes');

const authRoutes = require('./routes/authRoutes');
const roleRoutes = require('./routes/roleRoutes');
const utilisateurRoutes = require('./routes/utilisateurRoutes');
const activiteRoutes = require('./routes/activiteRoutes');
const sousActiviteRoutes = require('./routes/sousActiviteRoutes');
const outilRoutes = require('./routes/outilRoutes');
const accesRoutes = require('./routes/accesRoutes');
const parametreRoutes = require('./routes/parametreRoutes');
const diagnosticRoutes = require('./routes/diagnosticRoutes');
const journalRoutes = require('./routes/journalRoutes');
const statistiqueRoutes = require('./routes/statistiqueRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const ldapRoutes = require('./routes/ldapRoutes');
const setupRoutes = require('./routes/setupRoutes');
const sauvegardeRoutes = require('./routes/sauvegardeRoutes');
const supportRoutes = require('./routes/supportRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const delegationRoutes = require('./routes/delegationRoutes');
const demandeAccesRoutes = require('./routes/demandeAccesRoutes');

const app = express();
app.disable('x-powered-by');

if (envConfig.trustProxy) {
    app.set('trust proxy', 1);
}

app.use(cors({
    origin: function (origin, cb) {
        // Requêtes same-origin / outils sans Origin (curl, health)
        if (!origin) return cb(null, true);
        if (envConfig.clientOrigins.includes(origin) || envConfig.clientOrigins.includes('*')) {
            return cb(null, true);
        }
        // En dev, accepter localhost sur n'importe quel port
        if (envConfig.isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return cb(null, true);
        }
        console.warn('[cors] Origine refusée :', origin);
        return cb(null, false);
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: envConfig.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new FileSessionStore(),
    cookie: envConfig.cookie,
    proxy: envConfig.trustProxy
}));

// Fichiers statiques (logos d'activités, images d'outils)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '1d', etag: true }));

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/utilisateurs', utilisateurRoutes);
app.use('/api/activites', activiteRoutes);
app.use('/api/sous-activites', sousActiviteRoutes);
app.use('/api/outils', outilRoutes);
app.use('/api/acces', accesRoutes);
app.use('/api/parametres', parametreRoutes);
app.use('/api/diagnostic', diagnosticRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/statistiques', statistiqueRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/ldap', ldapRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/sauvegarde', sauvegardeRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/delegations', delegationRoutes);
app.use('/api/demandes-acces', demandeAccesRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Gestion des erreurs centralisée
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || 'Erreur serveur.' });
});

const PORT = envConfig.port;

logDemarrage();

async function tableExiste(nomTable) {
    try {
        // SHOW TABLES est plus fiable que INFORMATION_SCHEMA sur TiDB Cloud
        const [rows] = await sequelize.query(`SHOW TABLES LIKE :t`, {
            replacements: { t: nomTable }
        });
        return Array.isArray(rows) && rows.length > 0;
    } catch (e) {
        console.warn('[schema] tableExiste:', e.message);
        return false;
    }
}

async function preparerSchema() {
    console.log('Connexion à la base de données réussie.');
    const hasOutils = await tableExiste('outils');
    const hasUsers = await tableExiste('utilisateurs');
    if (!hasOutils || !hasUsers) {
        console.log('[schema] Base vide ou incomplète — création des tables (sync)...');
        await sequelize.sync();
        console.log('[schema] Tables créées.');
    } else {
        console.log('[schema] Tables principales déjà présentes.');
    }
    try {
        await assurerColonnes();
    } catch (e) {
        console.warn('[schema] assurerColonnes (non bloquant):', e.message);
    }
}

sequelize.authenticate()
    .then(() => preparerSchema())
    .then(() => {
        const host = process.env.HOST || '0.0.0.0';
        app.listen(PORT, host, () => {
            console.log(`Serveur GLO démarré sur ${host}:${PORT} [${envConfig.nodeEnv}]`);
            try {
                demarrerSurveillance();
                demarrerSlaTickets();
                demarrerPlanification();
            } catch (e) {
                console.warn('[jobs]', e.message);
            }
        });
    })
    .catch(async (err) => {
        console.error('[schema/db] Erreur:', err.message);
        // Dernier recours : forcer sync puis réessayer d'écouter
        try {
            console.log('[schema] Tentative de récupération (sync forcé)...');
            await sequelize.sync();
            await assurerColonnes().catch(() => {});
            const host = process.env.HOST || '0.0.0.0';
            app.listen(PORT, host, () => {
                console.log(`Serveur GLO démarré sur ${host}:${PORT} (après recovery)`);
            });
        } catch (e2) {
            console.error('[schema] Échec définitif:', e2.message);
            process.exit(1);
        }
    });
