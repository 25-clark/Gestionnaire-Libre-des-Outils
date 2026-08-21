
function etendreSessionInterface(req, heures) {
    try {
        let h = parseInt(heures, 10);
        if (!Number.isFinite(h) || h < 1) h = 8;
        if (h > 168) h = 168;
        if (req.session && req.session.cookie) {
            req.session.cookie.maxAge = h * 60 * 60 * 1000;
            if (typeof req.session.touch === 'function') req.session.touch();
        }
    } catch (_) {}
}

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

        if (response.data.needs_2fa) {
            req.session.pending_2fa = true;
            return res.redirect('/login/2fa');
        }
        if (response.data.require_email) {
            return res.render('login', {
                titre: 'Connexion',
                erreur: response.data.message || 'Ajoutez une adresse e-mail dans votre profil pour utiliser le code de connexion.'
            });
        }
        if (response.data.requireAuthEmail) {
            req.session.pendingAuthEmail = true;
            if (response.data.hint) req.session.pendingAuthEmailHint = response.data.hint;
            if (response.data.email_masque) req.session.pendingAuthEmailMasque = response.data.email_masque;
            return res.redirect('/login/auth-email');
        }

        req.session.user = response.data.user;
        etendreSessionInterface(req, 8);
        if (response.data.doit_configurer_2fa) {
            return res.redirect('/profil?setup2fa=1');
        }
        res.redirect(req.session.user.doit_changer_mdp ? '/changer-mot-de-passe' : '/');
    } catch (err) {
        const message = err.response?.data?.message || 'Impossible de se connecter au serveur.';
        res.render('login', { titre: 'Connexion', erreur: message });
    }
});


router.get('/login/auth-email', (req, res) => {
    if (!req.session.pendingAuthEmail || !req.session.apiCookie) {
        return res.redirect('/login');
    }
    res.render('login-auth-email', {
        titre: 'Code de connexion',
        erreur: null,
        hint: req.session.pendingAuthEmailHint || null,
        email_masque: req.session.pendingAuthEmailMasque || null
    });
});

router.post('/login/auth-email', async (req, res) => {
    try {
        const api = apiClient(req);
        const response = await api.post('/auth/code-email', { code: req.body.code });
        const setCookie = response.headers['set-cookie'];
        if (setCookie && setCookie.length) {
            req.session.apiCookie = setCookie[0].split(';')[0];
        }
        delete req.session.pendingAuthEmail;
        delete req.session.pendingAuthEmailHint;

        // Récupérer le profil maintenant que la session Server est authentifiée
        const me = await api.get('/auth/me');
        const user = me.data.user || me.data;
        req.session.user = user;
            etendreSessionInterface(req, (user && user.session_duree_heures) || 8);
        if (user.doit_changer_mdp) return res.redirect('/changer-mot-de-passe');
        if (user.doit_configurer_2fa) return res.redirect('/profil?setup2fa=1');
        return res.redirect('/');
    } catch (err) {
        res.render('login-auth-email', {
            titre: 'Code de connexion',
            erreur: err.response?.data?.message || 'Code incorrect ou expiré.',
            hint: req.session.pendingAuthEmailHint || null
        });
    }
});


router.get('/login/2fa/recuperation', (req, res) => {
    res.render('login-2fa-recuperation', { titre: 'Récupération 2FA', erreur: null, succes: null, etape: 'demande' });
});

router.post('/login/2fa/recuperation', async (req, res) => {
    try {
        const api = apiClientAnonyme();
        // reuse session cookie from prior login attempt if any
        const response = await api.post('/auth/2fa/recuperation', { matricule: req.body.matricule });
        const setCookie = response.headers['set-cookie'];
        if (setCookie && setCookie.length) {
            req.session.apiCookie = setCookie[0].split(';')[0];
        }
        req.session.pending2faRecovery = true;
        res.render('login-2fa-recuperation', {
            titre: 'Récupération 2FA',
            erreur: null,
            succes: response.data.message,
            etape: 'code',
            email_masque: response.data.email_masque || null
        });
    } catch (err) {
        res.render('login-2fa-recuperation', {
            titre: 'Récupération 2FA',
            erreur: err.response?.data?.message || 'Erreur',
            succes: null,
            etape: 'demande'
        });
    }
});

router.post('/login/2fa/recuperation/valider', async (req, res) => {
    try {
        const api = apiClient(req);
        const response = await api.post('/auth/2fa/recuperation/valider', {
            code: req.body.code,
            code_recuperation: req.body.code_recuperation
        });
        const setCookie = response.headers['set-cookie'];
        if (setCookie && setCookie.length) {
            req.session.apiCookie = setCookie[0].split(';')[0];
        }
        const me = await api.get('/auth/me');
        req.session.user = me.data.user || me.data;
        etendreSessionInterface(req, 8);
        delete req.session.pending2faRecovery;
        res.redirect('/');
    } catch (err) {
        res.render('login-2fa-recuperation', {
            titre: 'Récupération 2FA',
            erreur: err.response?.data?.message || 'Code incorrect',
            succes: null,
            etape: 'code'
        });
    }
});


router.get('/login/2fa', (req, res) => {
    if (!req.session.pending_2fa || !req.session.apiCookie) {
        return res.redirect('/login');
    }
    res.render('login-2fa', { titre: 'Vérification 2FA', erreur: null });
});

router.post('/login/2fa', async (req, res) => {
    try {
        const api = apiClient(req);
        const response = await api.post('/auth/2fa/verifier', { code: req.body.code });
        const setCookie = response.headers['set-cookie'];
        if (setCookie && setCookie.length) {
            req.session.apiCookie = setCookie[0].split(';')[0];
        }
        delete req.session.pending_2fa;
        if (response.data.require_email) {
            return res.render('login', {
                titre: 'Connexion',
                erreur: response.data.message || 'Ajoutez une adresse e-mail dans votre profil pour utiliser le code de connexion.'
            });
        }
        if (response.data.requireAuthEmail) {
            req.session.pendingAuthEmail = true;
            if (response.data.hint) req.session.pendingAuthEmailHint = response.data.hint;
            if (response.data.email_masque) req.session.pendingAuthEmailMasque = response.data.email_masque;
            return res.redirect('/login/auth-email');
        }
        req.session.user = response.data.user;
        etendreSessionInterface(req, 8);
        res.redirect(req.session.user.doit_changer_mdp ? '/changer-mot-de-passe' : '/');
    } catch (err) {
        res.render('login-2fa', {
            titre: 'Vérification 2FA',
            erreur: err.response?.data?.message || 'Code invalide.'
        });
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

router.get('/preferences', async (req, res, next) => {
    try {
        const { peutFaire } = require('../middlewares/requireLogin');
        if (!req.session.user) return res.redirect('/login');
        // Préférences accessibles si profil.read ou toujours pour soi
        if (!peutFaire(req.session.user, 'profil', 'read') && !peutFaire(req.session.user, 'profil', 'update')) {
            // permettre quand même les préférences de base pour tout utilisateur connecté
        }
        const api = apiClient(req);
        const { data } = await api.get('/auth/me');
        const user = data.user || data;
        res.locals.breadcrumbs = [
            { label: 'Tableau de bord', href: '/' },
            { label: 'Préférences' }
        ];
        res.render('preferences', {
            titre: 'Préférences de compte',
            user,
            erreur: null,
            succes: req.query.succes === '1'
        });
    } catch (err) { next(err); }
});

router.post('/preferences', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const prefs = Object.assign({}, (req.session.user && req.session.user.preferences) || {});
        prefs.theme = req.body.theme || 'clair';
        prefs.langue = req.body.langue || 'fr';
        prefs.densite = req.body.densite || 'confortable';
        prefs.vue_outils_defaut = req.body.vue_outils_defaut || 'liste';
        prefs.par_page_defaut = parseInt(req.body.par_page_defaut, 10) || 25;
        prefs.notif_son = req.body.notif_son === '1' || req.body.notif_son === 'on';
        prefs.notif_badge = req.body.notif_badge === '1' || req.body.notif_badge === 'on';
        prefs.notif_resume = req.body.notif_resume || 'tous';
        prefs.filtres_tickets_persist = req.body.filtres_tickets_persist === '1' || req.body.filtres_tickets_persist === 'on';
        prefs.ouvrir_outil_nouvel_onglet = req.body.ouvrir_outil_nouvel_onglet === '1' || req.body.ouvrir_outil_nouvel_onglet === 'on';
        prefs.masquer_creds_defaut = req.body.masquer_creds_defaut === '1' || req.body.masquer_creds_defaut === 'on';
        prefs.confirmer_avant_quitter = req.body.confirmer_avant_quitter === '1' || req.body.confirmer_avant_quitter === 'on';
        prefs.menu_compact = req.body.menu_compact === '1' || req.body.menu_compact === 'on';
        prefs.rappel_session = req.body.rappel_session === '1' || req.body.rappel_session === 'on';
        prefs.export_format_pref = req.body.export_format_pref || 'csv';
        prefs.export_filtres_seuls = req.body.export_filtres_seuls === '1' || req.body.export_filtres_seuls === 'on';
        prefs.densite = req.body.densite || 'confortable';
        prefs.ouvrir_outil_nouvel_onglet = req.body.ouvrir_outil_nouvel_onglet === '1' || req.body.ouvrir_outil_nouvel_onglet === 'on';
        prefs.notif_badge = req.body.notif_badge === '1' || req.body.notif_badge === 'on';
        prefs.notif_resume = req.body.notif_resume || 'tous';
        prefs.masquer_creds_defaut = req.body.masquer_creds_defaut === '1' || req.body.masquer_creds_defaut === 'on';
        prefs.confirmer_avant_quitter = req.body.confirmer_avant_quitter === '1' || req.body.confirmer_avant_quitter === 'on';
        prefs.raccourci_ctrl_k = req.body.raccourci_ctrl_k === '1' || req.body.raccourci_ctrl_k === 'on';
        prefs.raccourci_aide = req.body.raccourci_aide === '1' || req.body.raccourci_aide === 'on';

        prefs.raccourci_ctrl_k = req.body.raccourci_ctrl_k === '1' || req.body.raccourci_ctrl_k === 'on';
        prefs.raccourci_aide = req.body.raccourci_aide === '1' || req.body.raccourci_aide === 'on';
        const { data: user } = await api.put(`/utilisateurs/${req.session.user.id}/profil`, { preferences: prefs });
        if (req.session.user) {
            const saved = (user && (user.preferences || user)) || prefs;
            req.session.user.preferences = (saved && saved.theme) ? saved : (user.preferences || prefs);
            // Fusionner au cas où l'API renverrait un sous-ensemble
            req.session.user.preferences = Object.assign({}, prefs, req.session.user.preferences || {});
        }
        // S'assurer que la session Interface est bien écrite avant le redirect
        await new Promise(function (resolve) {
            req.session.save(function () { resolve(); });
        });
        res.redirect('/preferences?succes=1');
    } catch (err) {
        res.render('preferences', {
            titre: 'Préférences de compte',
            user: req.session.user,
            erreur: err.response?.data?.message || 'Erreur',
            succes: false
        });
    }
});

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
        } else if (section === 'auth_facteurs') {
            const prefs = Object.assign({}, (req.session.user && req.session.user.preferences) || {});
            const wantCode = req.body.auth_code_actif === '1' || req.body.auth_code_actif === 'on';
            if (wantCode) {
                const email = (req.session.user.email || '').trim();
                if (!email || !email.includes('@')) {
                    return res.render('profil', {
                        titre: 'Mon profil',
                        user: req.session.user,
                        erreur: 'Pour activer le code de connexion par e-mail, renseignez d\'abord une adresse e-mail valide dans vos informations personnelles.',
                        succes: null
                    });
                }
            }
            prefs.auth_code_actif = wantCode;
            body.preferences = prefs;
        } else {
            // Infos personnelles (+ identité si le rôle l'autorise côté Server)
            if (req.body.nom !== undefined) body.nom = req.body.nom;
            if (req.body.prenom !== undefined) body.prenom = req.body.prenom;
            if (req.body.matricule !== undefined) body.matricule = req.body.matricule;
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
            nom: user.nom,
            prenom: user.prenom,
            matricule: user.matricule,
            email: user.email,
            telephone: user.telephone,
            autres_contacts: user.autres_contacts,
            fonction: user.fonction,
            adresse: user.adresse,
            preferences: user.preferences || body.preferences,
            Role: user.Role || req.session.user.Role
        });
        // Redirection pour recharger header (lang/theme) proprement
        if (section === 'preferences') {
            return res.redirect('/profil?succes=prefs');
        }
        if (section === 'auth_facteurs') {
            return res.redirect('/profil?succes=auth');
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


router.post('/profil/2fa/setup', async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: 'Non connecté' });
        const api = apiClient(req);
        const { data } = await api.post('/auth/2fa/setup');
        res.json(data);
    } catch (err) {
        res.status(err.response?.status || 500).json(err.response?.data || { message: 'Erreur' });
    }
});
router.post('/profil/2fa/activer', async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: 'Non connecté' });
        const api = apiClient(req);
        const { data } = await api.post('/auth/2fa/activer', req.body);
        if (req.session.user) req.session.user.totp_actif = true;
        res.json(data);
    } catch (err) {
        res.status(err.response?.status || 500).json(err.response?.data || { message: 'Erreur' });
    }
});
router.post('/profil/2fa/desactiver', async (req, res) => {
    try {
        if (!req.session.user) return res.status(401).json({ message: 'Non connecté' });
        const api = apiClient(req);
        const { data } = await api.post('/auth/2fa/desactiver', req.body);
        if (req.session.user) req.session.user.totp_actif = false;
        res.json(data);
    } catch (err) {
        res.status(err.response?.status || 500).json(err.response?.data || { message: 'Erreur' });
    }
});

module.exports = router;

