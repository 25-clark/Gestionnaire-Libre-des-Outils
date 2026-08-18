require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

const { sequelize } = require('./models');
const { demarrerSurveillance } = require('./utils/surveillance');
const { demarrerSlaTickets } = require('./utils/slaTickets');
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
    cookie: {
        httpOnly: true,
        // Valeur de repli avant la première connexion (ex: options publiques
        // /api/parametres/public). La vraie durée, configurable dans les
        // Réglages généraux, est appliquée à chaque connexion réussie
        // (voir authController.js : req.session.cookie.maxAge = ...).
        maxAge: 1000 * 60 * 60 * 8 // 8h
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
        });
    })
    .catch((err) => {
        console.error('Impossible de se connecter à la base de données :', err.message);
        process.exit(1);
    });
