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

// Rend l'utilisateur connecté disponible dans toutes les vues EJS
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    res.locals.page = '';
    next();
});

app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/activites', activiteRoutes);
app.use('/sous-activites', sousActiviteRoutes);
app.use('/utilisateurs', utilisateurRoutes);
app.use('/outils', outilRoutes);
app.use('/roles', roleRoutes);
app.use('/acces', accesRoutes);

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
    console.log(`🖥️  Interface GLO démarrée sur http://localhost:${PORT}`);
});
