const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
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

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'change_moi',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new FileSessionStore(),
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 8 // 8h par défaut
    }
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

const PORT = process.env.PORT || 4000;

sequelize.authenticate()
    .then(() => {
        console.log('Connexion à la base de données réussie.');
        return assurerColonnes();
    })
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Serveur GLO démarré sur http://localhost:${PORT}`);
            demarrerSurveillance();
            demarrerSlaTickets();
            demarrerPlanification();
        });
    })
    .catch((err) => {
        console.error('Impossible de se connecter à la base de données :', err.message);
        process.exit(1);
    });
