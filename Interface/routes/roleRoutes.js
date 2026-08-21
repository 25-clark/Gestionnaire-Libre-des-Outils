const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');
const { apiClient } = require('../config/api');

router.use(requireLogin);

const RESSOURCES = [
    'utilisateurs', 'roles', 'activites', 'sous_activites', 'outils', 'acces',
    'tickets', 'diagnostic', 'notifications', 'export', 'profil', 'partage', 'journal',
    'credentials',
    'sessions',
    'delegations',
    'demandes_acces'
];
const ACTIONS = ['read', 'create', 'update', 'delete'];
// Onglets visibles dans une page activité/sous-activité — indépendant du
// CRUD ci-dessus : contrôle uniquement si l'onglet apparaît dans la navbar,
// pas ce qu'on a le droit d'y faire (ça reste régi par outils/*, acces/*...).
const ONGLETS = ['outils', 'archives', 'sous_activites', 'utilisateurs'];
const AIDE_ITEMS = ['support', 'documentation', 'mise-a-jour', 'extensions', 'soutien', 'confidentialite'];

router.get('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: roles } = await api.get('/roles');
        res.locals.page = 'roles';
        res.render('role/liste', { titre: 'Rôles', roles });
    } catch (err) { next(err); }
});

router.get('/nouveau', (req, res) => {
    res.render('role/form', {
        titre: 'Nouveau rôle',
        role: null,
        ressources: RESSOURCES,
        actions: ACTIONS,
        onglets: ONGLETS,
            aideItems: AIDE_ITEMS,
        erreur: null
    });
});

router.post('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const permissions = construirePermissions(req.body);
        await api.post('/roles', {
            nom: req.body.nom,
            abbreviation: req.body.abbreviation,
            permissions
        });
        res.redirect('/roles');
    } catch (err) {
        res.render('role/form', {
            titre: 'Nouveau rôle',
            role: req.body,
            ressources: RESSOURCES,
            actions: ACTIONS,
            onglets: ONGLETS,
            aideItems: AIDE_ITEMS,
            erreur: err.response?.data?.message || 'Erreur lors de la création.'
        });
    }
});

router.get('/:id/modifier', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: role } = await api.get(`/roles/${req.params.id}`);
        if (typeof role.permissions === 'string') {
            try { role.permissions = JSON.parse(role.permissions); } catch { role.permissions = {}; }
        }
        res.render('role/form', {
            titre: 'Modifier le rôle',
            role,
            ressources: RESSOURCES,
            actions: ACTIONS,
            onglets: ONGLETS,
            aideItems: AIDE_ITEMS,
            erreur: null
        });
    } catch (err) { next(err); }
});

router.post('/:id/modifier', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const permissions = construirePermissions(req.body);
        await api.put(`/roles/${req.params.id}`, {
            nom: req.body.nom,
            abbreviation: req.body.abbreviation,
            permissions
        });
        res.redirect('/roles');
    } catch (err) { next(err); }
});

router.post('/:id/supprimer', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.delete(`/roles/${req.params.id}`);
        res.redirect('/roles');
    } catch (err) { next(err); }
});

// Reconstruit l'objet permissions à partir des cases à cocher du formulaire
// (nommées perm_<ressource>_<action>).
function construirePermissions(body) {
    const permissions = {};
    for (const ressource of RESSOURCES) {
        permissions[ressource] = {};
        for (const action of ACTIONS) {
            permissions[ressource][action] = body[`perm_${ressource}_${action}`] === 'on';
        }
    }

    // « read » sur les activités est toujours actif : c'est la clé d'accès
    // à tout le reste (sous-activités, outils, etc.).
    if (permissions.activites) {
        permissions.activites.read = true;
    }
    // « read » sur les utilisateurs est toujours actif (consultation minimale).
    if (permissions.utilisateurs) {
        permissions.utilisateurs.read = true;
    }

    permissions.onglets = {};
    for (const onglet of ONGLETS) {
        permissions.onglets[onglet] = body[`onglet_${onglet}`] === 'on';
    }

    // Option fine : modifier nom/prénom/matricule sur son propre profil
    if (!permissions.profil) permissions.profil = {};
    permissions.profil.update_identite = body.perm_profil_update_identite === 'on';

    // Items du menu Aide visibles pour ce rôle
    permissions.aide = {};
    for (const item of AIDE_ITEMS) {
        permissions.aide[item] = body[`aide_${item}`] === 'on';
    }

    return permissions;
}

module.exports = router;
