const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');
const { apiClient } = require('../config/api');

router.use(requireLogin);

// Formulaire de création (id_activite et id_parent optionnel passés en query)
router.get('/nouveau', async (req, res, next) => {
    try {
        const { id_activite, id_parent } = req.query;
        res.render('sousActivite/form', {
            titre: 'Nouvelle sous-activité',
            sousActivite: null,
            id_activite,
            id_parent: id_parent || '',
            erreur: null
        });
    } catch (err) { next(err); }
});

router.post('/', async (req, res) => {
    try {
        const api = apiClient(req);
        const { data: sousActivite } = await api.post('/sous-activites', req.body);
        res.redirect(`/sous-activites/${sousActivite.id}`);
    } catch (err) {
        res.render('sousActivite/form', {
            titre: 'Nouvelle sous-activité',
            sousActivite: null,
            id_activite: req.body.id_activite,
            id_parent: req.body.id_parent || '',
            erreur: err.response?.data?.message || 'Erreur lors de la création.'
        });
    }
});

// Remonte toute la chaîne de parents d'une sous-activité (arborescence façon
// dossiers) pour construire un fil d'ariane complet, pas seulement le parent direct.
async function construireFilAriane(api, sousActivite) {
    const chaine = [];
    let idParentCourant = sousActivite.id_parent;
    let garde = 0; // sécurité anti-boucle infinie en cas de données corrompues

    while (idParentCourant && garde < 30) {
        const { data: parent } = await api.get(`/sous-activites/${idParentCourant}`);
        chaine.unshift(parent);
        idParentCourant = parent.id_parent;
        garde++;
    }

    return chaine;
}

// Détail d'une sous-activité : onglets Sous-activités (enfants) / Utilisateurs / Outils
router.get('/:id', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const onglet = req.query.onglet || 'sous-activites';

        const { data: sousActivite } = await api.get(`/sous-activites/${req.params.id}`);
        const { data: enfants } = await api.get(`/sous-activites?id_parent=${req.params.id}`);
        const [{ data: activite }, ancetres] = await Promise.all([
            api.get(`/activites/${sousActivite.id_activite}`),
            construireFilAriane(api, sousActivite)
        ]);

        let utilisateurs = [];
        let outils = [];

        if (onglet === 'utilisateurs') {
            const resp = await api.get(`/acces/sous-activites?id_sous_activite=${req.params.id}`);
            utilisateurs = resp.data;
            const { data: tousUtilisateurs } = await api.get('/utilisateurs');
            res.locals.tousUtilisateurs = tousUtilisateurs;
        } else if (onglet === 'outils') {
            const resp = await api.get(`/outils?id_sous_activite=${req.params.id}`);
            outils = resp.data;
        }

        res.locals.page = 'sousActivite';
        res.render('sousActivite/detail', {
            titre: sousActivite.nom,
            sousActivite,
            activite,
            ancetres,
            enfants,
            utilisateurs,
            outils,
            onglet,
            tousUtilisateurs: res.locals.tousUtilisateurs || []
        });
    } catch (err) {
        next(err);
    }
});

router.get('/:id/modifier', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: sousActivite } = await api.get(`/sous-activites/${req.params.id}`);
        res.render('sousActivite/form', {
            titre: 'Modifier la sous-activité',
            sousActivite,
            id_activite: sousActivite.id_activite,
            id_parent: sousActivite.id_parent || '',
            erreur: null
        });
    } catch (err) { next(err); }
});

router.post('/:id/modifier', async (req, res) => {
    try {
        const api = apiClient(req);
        await api.put(`/sous-activites/${req.params.id}`, req.body);
        res.redirect(`/sous-activites/${req.params.id}`);
    } catch (err) {
        res.render('sousActivite/form', {
            titre: 'Modifier la sous-activité',
            sousActivite: { id: req.params.id, ...req.body },
            id_activite: req.body.id_activite,
            id_parent: req.body.id_parent || '',
            erreur: err.response?.data?.message || 'Erreur lors de la modification.'
        });
    }
});

router.post('/:id/supprimer', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: sousActivite } = await api.get(`/sous-activites/${req.params.id}`);
        await api.delete(`/sous-activites/${req.params.id}`);

        // Retour vers le parent (une autre sous-activité) ou l'activité racine
        if (sousActivite.id_parent) {
            return res.redirect(`/sous-activites/${sousActivite.id_parent}`);
        }
        res.redirect(`/activites/${sousActivite.id_activite}`);
    } catch (err) { next(err); }
});

module.exports = router;
