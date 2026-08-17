const express = require('express');
const router = express.Router();
const { apiClient } = require('../config/api');
const { requireLogin, estAdmin } = require('../middlewares/requireLogin');

router.use(requireLogin);
router.use((req, res, next) => {
    if (!estAdmin(req.session.user)) {
        return res.status(403).render('erreur', { titre: 'Accès refusé', message: "Réservé à l'administrateur." });
    }
    next();
});

router.get('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: config } = await api.get('/ldap/parametres');
        const { data: roles } = await api.get('/roles');

        res.render('ldap', {
            titre: 'Configuration LDAP',
            config,
            roles,
            resultatTest: null,
            resultatImportUtilisateurs: null,
            resultatImportActivites: null,
            erreur: null,
            succes: req.query.succes === '1'
        });
    } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.put('/ldap/parametres', req.body);
        res.redirect('/ldap?succes=1');
    } catch (err) { next(err); }
});

router.post('/tester', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: config } = await api.get('/ldap/parametres');
        const { data: roles } = await api.get('/roles');

        let resultatTest;
        try {
            const resp = await api.post('/ldap/tester');
            resultatTest = resp.data;
        } catch (errTest) {
            resultatTest = { ok: false, message: errTest.response?.data?.message || 'Erreur lors du test.' };
        }

        res.render('ldap', {
            titre: 'Configuration LDAP',
            config, roles,
            resultatTest,
            resultatImportUtilisateurs: null,
            resultatImportActivites: null,
            erreur: null,
            succes: false
        });
    } catch (err) { next(err); }
});

router.post('/importer-utilisateurs', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: config } = await api.get('/ldap/parametres');
        const { data: roles } = await api.get('/roles');

        let resultatImportUtilisateurs, erreur = null;
        try {
            const resp = await api.post('/ldap/importer-utilisateurs');
            resultatImportUtilisateurs = resp.data;
        } catch (errImport) {
            erreur = errImport.response?.data?.message || "Erreur lors de l'import des utilisateurs.";
        }

        res.render('ldap', {
            titre: 'Configuration LDAP',
            config, roles,
            resultatTest: null,
            resultatImportUtilisateurs,
            resultatImportActivites: null,
            erreur,
            succes: false
        });
    } catch (err) { next(err); }
});

router.post('/importer-activites', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: config } = await api.get('/ldap/parametres');
        const { data: roles } = await api.get('/roles');

        let resultatImportActivites, erreur = null;
        try {
            const resp = await api.post('/ldap/importer-activites');
            resultatImportActivites = resp.data;
        } catch (errImport) {
            erreur = errImport.response?.data?.message || "Erreur lors de l'import des activités.";
        }

        res.render('ldap', {
            titre: 'Configuration LDAP',
            config, roles,
            resultatTest: null,
            resultatImportUtilisateurs: null,
            resultatImportActivites,
            erreur,
            succes: false
        });
    } catch (err) { next(err); }
});

module.exports = router;
