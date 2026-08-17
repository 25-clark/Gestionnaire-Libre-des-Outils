const express = require('express');
const router = express.Router();
const { apiClient, apiClientAnonyme } = require('../config/api');

router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { titre: 'Connexion', erreur: null });
});

router.post('/login', async (req, res) => {
    try {
        const { matricule, mot_de_passe } = req.body;
        const api = apiClientAnonyme();
        const response = await api.post('/auth/login', { matricule, mot_de_passe });

        // On récupère le cookie de session renvoyé par le Server (connect.sid)
        const setCookie = response.headers['set-cookie'];
        if (setCookie && setCookie.length) {
            req.session.apiCookie = setCookie[0].split(';')[0]; // ex: "connect.sid=xxx"
        }

        req.session.user = response.data.user;
        res.redirect(req.session.user.doit_changer_mdp ? '/changer-mot-de-passe' : '/');
    } catch (err) {
        const message = err.response?.data?.message || 'Impossible de se connecter au serveur.';
        res.render('login', { titre: 'Connexion', erreur: message });
    }
});

router.post('/logout', async (req, res) => {
    try {
        const api = apiClient(req);
        await api.post('/auth/logout');
    } catch { /* on déconnecte quand même côté Interface même si l'appel échoue */ }

    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Changement de mot de passe : à froid (menu utilisateur, 🔑) ou forcé
// après une connexion avec le mot de passe par défaut (requireLogin
// redirige systématiquement ici tant que doit_changer_mdp est vrai).
router.get('/changer-mot-de-passe', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('changerMotDePasse', {
        titre: 'Changer mon mot de passe',
        force: !!req.session.user.doit_changer_mdp,
        erreur: null
    });
});

router.post('/changer-mot-de-passe', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const api = apiClient(req);
        await api.post('/auth/changer-mot-de-passe', {
            ancien_mot_de_passe: req.body.ancien_mot_de_passe,
            nouveau_mot_de_passe: req.body.nouveau_mot_de_passe
        });

        req.session.user.doit_changer_mdp = false;
        res.redirect('/');
    } catch (err) {
        res.render('changerMotDePasse', {
            titre: 'Changer mon mot de passe',
            force: !!req.session.user.doit_changer_mdp,
            erreur: err.response?.data?.message || 'Erreur lors du changement de mot de passe.'
        });
    }
});


// ---- Profil utilisateur (champs enrichis + préférences) ----
router.get('/profil', async (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const api = apiClient(req);
        const { data: user } = await api.get(`/utilisateurs/${req.session.user.id}`);
        // Synchroniser les préférences en session (ex. après reload)
        if (user.preferences) {
            req.session.user.preferences = user.preferences;
        }
        let succes = null;
        if (req.query.succes === 'prefs') succes = 'prefs';
        if (req.query.succes === 'infos') succes = 'infos';
        res.render('profil', {
            titre: 'Mon profil',
            user,
            erreur: null,
            succes
        });
    } catch (err) { next(err); }
});

router.post('/profil', async (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const api = apiClient(req);
        const section = req.body.section || 'infos';
        const body = {};

        if (section === 'preferences') {
            body.preferences = {
                theme: req.body.theme || 'clair',
                langue: req.body.langue || 'fr'
            };
        } else {
            // Infos personnelles
            body.email = req.body.email || null;
            body.telephone = req.body.telephone || null;
            body.fonction = req.body.fonction || null;
            body.adresse = req.body.adresse || null;
            // autres_contacts[] peut arriver comme string ou tableau
            let contacts = req.body['autres_contacts[]'] ?? req.body.autres_contacts;
            if (contacts == null) contacts = [];
            if (!Array.isArray(contacts)) contacts = [contacts];
            contacts = contacts.map(c => String(c || '').trim()).filter(Boolean);
            body.autres_contacts = contacts;
        }

        const { data: user } = await api.put(`/utilisateurs/${req.session.user.id}/profil`, body);
        // Mettre à jour la session (thème + langue appliqués au prochain rendu)
        Object.assign(req.session.user, {
            email: user.email,
            telephone: user.telephone,
            autres_contacts: user.autres_contacts,
            fonction: user.fonction,
            adresse: user.adresse,
            preferences: user.preferences || body.preferences
        });
        // Redirection pour recharger header (lang/theme) proprement
        if (section === 'preferences') {
            return res.redirect('/profil?succes=prefs');
        }
        return res.redirect('/profil?succes=infos');
    } catch (err) {
        res.render('profil', {
            titre: 'Mon profil',
            user: req.session.user,
            erreur: err.response?.data?.message || 'Erreur lors de la sauvegarde.',
            succes: null
        });
    }
});

module.exports = router;
