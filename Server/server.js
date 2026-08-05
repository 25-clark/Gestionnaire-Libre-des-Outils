require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

const { sequelize } = require('./models');

const authRoutes = require('./routes/authRoutes');
const roleRoutes = require('./routes/roleRoutes');
const utilisateurRoutes = require('./routes/utilisateurRoutes');
const activiteRoutes = require('./routes/activiteRoutes');
const sousActiviteRoutes = require('./routes/sousActiviteRoutes');
const outilRoutes = require('./routes/outilRoutes');
const accesRoutes = require('./routes/accesRoutes');

const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:2521',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'KEY_MY_KEY_OTHER_KEY',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 8 // 8h
    }
}));

// Fichiers statiques (logos d'activités, images d'outils)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/utilisateurs', utilisateurRoutes);
app.use('/api/activites', activiteRoutes);
app.use('/api/sous-activites', sousActiviteRoutes);
app.use('/api/outils', outilRoutes);
app.use('/api/acces', accesRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// Gestion des erreurs centralisée
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || 'Erreur serveur.' });
});

const PORT = process.env.PORT || 2520;

sequelize.authenticate()
    .then(() => {
        console.log('Connexion à la base de données réussie.');
        app.listen(PORT, () => {
            console.log(`Serveur GLO démarré sur http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Impossible de se connecter à la base de données :', err.message);
        process.exit(1);
    });
