const express = require('express');
const router = express.Router();
const { apiClientAnonyme } = require('../config/api');

router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { titre: 'Connexion', erreur: null });
});

router.post('/login', async (req, res) => {
    try {
        const { matricule } = req.body;
        const api = apiClientAnonyme();
        const response = await api.post('/auth/login', { matricule });

        // On récupère le cookie de session renvoyé par le Server (connect.sid)
        const setCookie = response.headers['set-cookie'];
        if (setCookie && setCookie.length) {
            req.session.apiCookie = setCookie[0].split(';')[0]; // ex: "connect.sid=xxx"
        }

        req.session.user = response.data.user;
        res.redirect('/');
    } catch (err) {
        const message = err.response?.data?.message || 'Impossible de se connecter au serveur.';
        res.render('login', { titre: 'Connexion', erreur: message });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

module.exports = router;
