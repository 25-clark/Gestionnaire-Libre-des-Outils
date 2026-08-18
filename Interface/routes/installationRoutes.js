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
        if (!statut.cgu_acceptees) return res.redirect('/installation/cgu');
        if (!statut.a_admin) return res.redirect('/installation/mode');
        return res.redirect('/installation/terminer');
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
        res.redirect('/installation/mode');
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


router.get('/mode', async (req, res, next) => {
    try {
        const statut = await getStatut();
        if (statut.installation_terminee) return res.redirect('/login');
        if (!statut.cgu_acceptees) return res.redirect('/installation/cgu');
        res.render('installation/mode', { titre: 'Installation — Type', erreur: null, succes: null, statut });
    } catch (err) { next(err); }
});

router.post('/restaurer', (req, res, next) => {
    const multer = require('multer');
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });
    upload.single('fichier')(req, res, async (err) => {
        if (err) {
            return res.render('installation/mode', {
                titre: 'Installation — Type',
                erreur: err.message || 'Fichier trop volumineux ou invalide.',
                succes: null,
                statut: {}
            });
        }
        try {
            if (!req.file) {
                return res.render('installation/mode', {
                    titre: 'Installation — Type',
                    erreur: 'Sélectionnez un fichier de sauvegarde .json',
                    succes: null,
                    statut: {}
                });
            }
            let payload;
            try {
                payload = JSON.parse(req.file.buffer.toString('utf8'));
            } catch (e) {
                return res.render('installation/mode', {
                    titre: 'Installation — Type',
                    erreur: 'Le fichier n\'est pas un JSON valide.',
                    succes: null,
                    statut: {}
                });
            }
            const api = apiClientAnonyme();
            const { data } = await api.post('/setup/restaurer', payload);
            if (data.a_admin) {
                return res.redirect('/installation/terminer');
            }
            return res.redirect('/installation/auth');
        } catch (e) {
            res.render('installation/mode', {
                titre: 'Installation — Type',
                erreur: e.response?.data?.message || e.message || 'Échec de la restauration',
                succes: null,
                statut: {}
            });
        }
    });
});


module.exports = router;
