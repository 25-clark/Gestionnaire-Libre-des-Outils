const express = require('express');
const router = express.Router();
const { requireLogin, peutFaire } = require('../middlewares/requireLogin');
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

// Détail d'une sous-activité : onglets Outils / Archives / Sous-activités (enfants) / Utilisateurs.
// Par défaut et par sécurité, seul l'onglet "Outils" est actif : les
// sous-activités enfants et les accès particuliers ne sont montrés que si
// le rôle de l'utilisateur a la permission de lecture correspondante.
router.get('/:id', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const user = req.session.user;

        const ongletsAutorises = ['outils', 'archives'];
        if (peutFaire(user, 'sous_activites', 'read')) ongletsAutorises.push('sous-activites');
        if (peutFaire(user, 'acces', 'read')) ongletsAutorises.push('utilisateurs');

        let onglet = req.query.onglet || 'outils';
        if (!ongletsAutorises.includes(onglet)) onglet = 'outils';

        const { data: sousActivite } = await api.get(`/sous-activites/${req.params.id}`);
        const [{ data: activite }, ancetres, { data: monAccesSousActivite }, { data: monAccesActivite }] = await Promise.all([
            api.get(`/activites/${sousActivite.id_activite}`),
            construireFilAriane(api, sousActivite),
            api.get(`/acces/mon-acces/sous-activite?id_sous_activite=${req.params.id}`),
            api.get(`/acces/mon-acces/activite?id_activite=${sousActivite.id_activite}`)
        ]);

        let enfants = [];
        let utilisateurs = [];
        let outils = [];
        let tousUtilisateurs = [];

        if (onglet === 'sous-activites') {
            const resp = await api.get(`/sous-activites?id_parent=${req.params.id}`);
            enfants = resp.data;
        } else if (onglet === 'utilisateurs') {
            const resp = await api.get(`/acces/sous-activites?id_sous_activite=${req.params.id}`);
            utilisateurs = resp.data;
            const resp2 = await api.get('/utilisateurs');
            tousUtilisateurs = resp2.data;
        } else {
            // "outils" et "archives" partagent la même source ; on sépare
            // simplement actifs / désactivés une fois récupérés.
            const resp = await api.get(`/outils?id_sous_activite=${req.params.id}`);
            outils = onglet === 'archives'
                ? resp.data.filter(o => !o.active)
                : resp.data.filter(o => o.active);
        }

        res.locals.page = 'sousActivite';
        res.render('sousActivite/detail', {
            titre: sousActivite.nom,
            sousActivite,
            activite,
            ancetres,
            monAccesSousActivite,
            monAccesActivite,
            enfants,
            utilisateurs,
            outils,
            onglet,
            tousUtilisateurs
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
