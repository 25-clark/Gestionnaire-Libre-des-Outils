const express = require('express');
const router = express.Router();
const { apiClientAnonyme } = require('../config/api');

async function getStatut() {
    const { data } = await apiClientAnonyme().get('/setup/statut');
    return data;
}

function etapes(statut) {
    return {
        cgu: !!statut.cgu_acceptees,
        auth: !!statut.cgu_acceptees, // après CGU
        dependances: !!statut.cgu_acceptees,
        admin: !!statut.a_admin,
        donnees: !!statut.a_admin,
        terminer: !!statut.installation_terminee
    };
}

router.get('/', async (req, res, next) => {
    try {
        const statut = await getStatut();
        if (statut.installation_terminee) return res.redirect('/login');
        if (!statut.cgu_acceptees) return res.redirect('/installation/cgu');
        if (!statut.a_admin) return res.redirect('/installation/auth');
        return res.redirect('/installation/donnees');
    } catch (err) { next(err); }
});

router.get('/cgu', async (req, res, next) => {
    try {
        const statut = await getStatut();
        if (statut.installation_terminee) return res.redirect('/login');
        res.render('installation/cgu', { titre: 'Installation — CGU', erreur: null, statut });
    } catch (err) { next(err); }
});

router.post('/cgu', async (req, res, next) => {
    try {
        const api = apiClientAnonyme();
        await api.post('/setup/cgu', { accepte: req.body.accepte === 'on' || req.body.accepte === true });
        res.redirect('/installation/auth');
    } catch (err) {
        res.render('installation/cgu', {
            titre: 'Installation — CGU',
            erreur: err.response?.data?.message || 'Erreur',
            statut: {}
        });
    }
});

router.get('/auth', async (req, res, next) => {
    try {
        const statut = await getStatut();
        if (statut.installation_terminee) return res.redirect('/login');
        if (!statut.cgu_acceptees) return res.redirect('/installation/cgu');
        res.render('installation/auth', { titre: 'Installation — Authentification', erreur: null, statut });
    } catch (err) { next(err); }
});

router.post('/auth', async (req, res, next) => {
    try {
        const api = apiClientAnonyme();
        await api.post('/setup/auth', { mode: req.body.mode || 'local' });
        res.redirect('/installation/dependances');
    } catch (err) {
        res.render('installation/auth', {
            titre: 'Installation — Authentification',
            erreur: err.response?.data?.message || 'Erreur',
            statut: {}
        });
    }
});

router.get('/dependances', async (req, res, next) => {
    try {
        const statut = await getStatut();
        if (statut.installation_terminee) return res.redirect('/login');
        if (!statut.cgu_acceptees) return res.redirect('/installation/cgu');
        res.render('installation/dependances', { titre: 'Installation — Dépendances', statut });
    } catch (err) { next(err); }
});

router.get('/admin', async (req, res, next) => {
    try {
        const statut = await getStatut();
        if (statut.installation_terminee) return res.redirect('/login');
        if (!statut.cgu_acceptees) return res.redirect('/installation/cgu');
        if (statut.a_admin) return res.redirect('/installation/donnees');
        res.render('installation/admin', { titre: 'Installation — Compte admin', erreur: null, statut });
    } catch (err) { next(err); }
});

router.post('/admin', async (req, res, next) => {
    try {
        const api = apiClientAnonyme();
        await api.post('/setup/admin', {
            matricule: req.body.matricule,
            nom: req.body.nom,
            prenom: req.body.prenom,
            mot_de_passe: req.body.mot_de_passe
        });
        res.redirect('/installation/donnees');
    } catch (err) {
        res.render('installation/admin', {
            titre: 'Installation — Compte admin',
            erreur: err.response?.data?.message || 'Erreur',
            statut: {}
        });
    }
});

router.get('/donnees', async (req, res, next) => {
    try {
        const statut = await getStatut();
        if (statut.installation_terminee) return res.redirect('/login');
        if (!statut.a_admin) return res.redirect('/installation/admin');
        res.render('installation/donnees', { titre: 'Installation — Données initiales', erreur: null, statut });
    } catch (err) { next(err); }
});

router.post('/donnees', async (req, res, next) => {
    try {
        const api = apiClientAnonyme();
        await api.post('/setup/donnees', {
            nom_activite: req.body.nom_activite,
            abbreviation: req.body.abbreviation,
            nom_sous_activite: req.body.nom_sous_activite || null,
            creer_demo: req.body.creer_demo === 'on'
        });
        res.redirect('/installation/terminer');
    } catch (err) {
        res.render('installation/donnees', {
            titre: 'Installation — Données initiales',
            erreur: err.response?.data?.message || 'Erreur',
            statut: {}
        });
    }
});

router.get('/terminer', async (req, res, next) => {
    try {
        const statut = await getStatut();
        if (!statut.a_admin) return res.redirect('/installation/admin');
        res.render('installation/terminer', { titre: 'Installation — Terminer', erreur: null, statut });
    } catch (err) { next(err); }
});

router.post('/terminer', async (req, res, next) => {
    try {
        const api = apiClientAnonyme();
        await api.post('/setup/terminer');
        res.redirect('/login?installe=1');
    } catch (err) {
        res.render('installation/terminer', {
            titre: 'Installation — Terminer',
            erreur: err.response?.data?.message || 'Erreur',
            statut: {}
        });
    }
});

module.exports = router;
