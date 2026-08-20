const express = require('express');
const router = express.Router();
const { requireLogin, peutFaire } = require('../middlewares/requireLogin');

// Garde-fou serveur en plus du bouton masqué côté vue : empêche d'atteindre
// une URL d'export directement sans la permission "export".
function exigerExport(req, res, next) {
    if (!peutFaire(req.session.user, 'export', 'read')) {
        return res.status(403).render('erreur', { titre: 'Accès refusé', message: "Vous n'avez pas le droit d'exporter." });
    }
    next();
}
const { uploadLogo } = require('../middlewares/upload');
const { apiClient } = require('../config/api');
const { envoyerCsv } = require('../utils/csv');


function activiteDebloquee(req, id) {
    if (!req.session.activitesDebloquees) req.session.activitesDebloquees = {};
    return !!req.session.activitesDebloquees[String(id)];
}
function marquerDebloquee(req, id) {
    if (!req.session.activitesDebloquees) req.session.activitesDebloquees = {};
    req.session.activitesDebloquees[String(id)] = Date.now();
}
function estAdminSession(req) {
    const u = req.session.user;
    if (!u) return false;
    if (u.Role && u.Role.abbreviation === 'ADMIN') return true;
    if (u.Roles && Array.isArray(u.Roles) && u.Roles.some(r => r && r.abbreviation === 'ADMIN')) return true;
    return false;
}
function estActiviteProtegee(activite) {
    if (!activite) return false;
    if (activite.acces_protege === true || activite.acces_protege === 'true' || activite.acces_protege === 1) return true;
    let reg = activite.reglages;
    if (typeof reg === 'string') {
        try { reg = JSON.parse(reg); } catch { reg = null; }
    }
    if (!reg || typeof reg !== 'object') return false;
    return reg.acces_protege === true
        || reg.acces_protege === 'true'
        || reg.acces_protege === 1
        || reg.acces_protege === '1';
}
function filArianeActivite(activite, suite) {
    const crumbs = [
        { label: 'Tableau de bord', href: '/' },
        {
            label: (activite && activite.nom) ? activite.nom : 'Activité',
            href: activite && activite.id ? '/activites/' + activite.id : undefined
        }
    ];
    if (suite) {
        if (Array.isArray(suite)) crumbs.push(...suite);
        else crumbs.push(suite);
    }
    if (crumbs.length) {
        const last = crumbs[crumbs.length - 1];
        if (last.href && !suite) delete last.href;
        else if (suite) delete crumbs[crumbs.length - 1].href;
    }
    return crumbs;
}


router.use(requireLogin);

// Formulaire de création
router.get('/nouveau', (req, res) => {
    res.render('activite/form', { titre: 'Nouvelle activité', activite: null, erreur: null });
});

router.post('/', uploadLogo.single('logo'), async (req, res) => {
    try {
        const api = apiClient(req);
        const logo = req.file ? `/uploads/logos/${req.file.filename}` : null;
        const { data: activite } = await api.post('/activites', { ...req.body, logo });
        res.redirect(`/activites/${activite.id}`);
    } catch (err) {
        res.render('activite/form', {
            titre: 'Nouvelle activité',
            activite: null,
            erreur: err.response?.data?.message || 'Erreur lors de la création.'
        });
    }
});

// Détail d'une activité : onglets Outils / Archives / Sous-activités / Utilisateurs.
// Par défaut et par sécurité, seul l'onglet "Outils" est actif : les
// sous-activités et les utilisateurs ne sont montrés que si le rôle de
// l'utilisateur a la permission de lecture correspondante. "Archives"
// regroupe les outils désactivés (retirés de l'onglet Outils courant).

// Épingler / désépingler une activité (AVANT /:id pour éviter le 404)
router.post('/:id/favori', async (req, res) => {
    try {
        const api = apiClient(req);
        const uid = req.session.user.id;
        const { data } = await api.post(`/utilisateurs/${uid}/favoris`, {
            type: 'activite',
            id_cible: parseInt(req.params.id, 10)
        });
        delete req.session._favorisCache;
        return res.json(data);
    } catch (err) {
        const msg = err.response?.data?.message || err.message || 'Erreur favori';
        console.error('[favori activite]', msg);
        return res.status(err.response?.status || 500).json({ message: msg });
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const user = req.session.user;

        // Un onglet n'apparaît que si le rôle a À LA FOIS la permission CRUD
        // de la ressource concernée ET l'onglet coché dans "Onglets visibles"
        // (rôles/permissions) — les deux se combinent, l'un ne remplace pas l'autre.
        const ongletsAutorises = [];
        if (peutFaire(user, 'onglets', 'outils')) ongletsAutorises.push('outils');
        if (peutFaire(user, 'onglets', 'archives')) ongletsAutorises.push('archives');
        if (peutFaire(user, 'onglets', 'sous_activites') && peutFaire(user, 'sous_activites', 'read')) ongletsAutorises.push('sous-activites');
        if (peutFaire(user, 'onglets', 'utilisateurs') && peutFaire(user, 'utilisateurs', 'read')) ongletsAutorises.push('utilisateurs');
        if (!ongletsAutorises.length) ongletsAutorises.push('outils'); // filet de sécurité : jamais une page totalement vide

        let onglet = req.query.onglet || ongletsAutorises[0];
        if (!ongletsAutorises.includes(onglet)) onglet = ongletsAutorises[0];

        const { data: activite } = await api.get(`/activites/${req.params.id}`);

        // Protection par clé d'accès (réglages locaux)
        if (estActiviteProtegee(activite) && !estAdminSession(req) && !activiteDebloquee(req, activite.id)) {
            res.locals.breadcrumbs = filArianeActivite(activite, { label: 'Accès' });
            return res.render('activite/deverrouiller', {
                titre: 'Activité protégée',
                activite: {
                    id: activite.id,
                    nom: activite.nom,
                    acces_protege: true,
                    acces_indice: activite.acces_indice || (activite.reglages && activite.reglages.acces_indice) || null
                },
                erreur: null,
                retour: req.originalUrl
            });
        }

        let sousActivites = [];
        let utilisateurs = [];
        let outils = [];

        if (onglet === 'sous-activites') {
            const resp = await api.get(`/sous-activites?id_activite=${req.params.id}`);
            sousActivites = resp.data;
        } else if (onglet === 'utilisateurs') {
            const resp = await api.get(`/utilisateurs?id_activite=${req.params.id}`);
            utilisateurs = resp.data;
        } else {
            // "outils" et "archives" partagent la même source ; on sépare
            // simplement actifs / désactivés une fois récupérés.
            const resp = await api.get(`/outils?id_activite=${req.params.id}`);
            outils = onglet === 'archives'
                ? resp.data.filter(o => !o.active)
                : resp.data.filter(o => o.active);
        }

        res.locals.page = 'activite';
        res.locals.breadcrumbs = filArianeActivite(activite);
        res.render('activite/detail', {
            titre: activite.nom,
            activite,
            sousActivites,
            utilisateurs,
            outils,
            onglet,
            mdpReinitialise: req.query.mdpReinitialise === '1'
        });
    } catch (err) {
        next(err);
    }
});

// Formulaire de modification (nom, abréviation, logo)
router.get('/:id/modifier', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: activite } = await api.get(`/activites/${req.params.id}`);
        res.render('activite/form', { titre: 'Modifier l\'activité', activite, erreur: null });
    } catch (err) {
        next(err);
    }
});

router.post('/:id/modifier', uploadLogo.single('logo'), async (req, res) => {
    try {
        const api = apiClient(req);
        const logo = req.file ? `/uploads/logos/${req.file.filename}` : undefined;
        await api.put(`/activites/${req.params.id}`, { ...req.body, logo });
        res.redirect(`/activites/${req.params.id}`);
    } catch (err) {
        res.render('activite/form', {
            titre: "Modifier l'activité",
            activite: { id: req.params.id, ...req.body },
            erreur: err.response?.data?.message || 'Erreur lors de la modification.'
        });
    }
});

router.post('/:id/supprimer', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.delete(`/activites/${req.params.id}`);
        res.redirect('/');
    } catch (err) {
        next(err);
    }
});

// ---------- Exports (Outils / Archives / Utilisateurs) ----------

const COLONNES_OUTILS = [
    { cle: 'nom', libelle: 'Nom' },
    { cle: 'adresse', libelle: 'Adresse' },
    { cle: 'statut', libelle: 'Statut réseau' },
    { cle: 'proprietaire', libelle: 'Propriétaire' },
    { cle: 'sousActivites', libelle: 'Sous-activités' },
    { cle: 'actif', libelle: 'Actif' }
];

function outilVersLigne(o) {
    const statuts = { en_ligne: 'En ligne', hors_ligne: 'Hors ligne', inconnu: 'Inconnu' };
    return {
        nom: o.nom,
        adresse: o.adresse || '',
        statut: o.adresse ? (statuts[o.dernier_statut] || 'Inconnu') : '—',
        proprietaire: o.Utilisateur ? `${o.Utilisateur.prenom} ${o.Utilisateur.nom}` : '',
        sousActivites: (o.sousActivites || []).map(sa => sa.nom).join(', '),
        actif: o.active ? 'Oui' : 'Non (archivé)'
    };
}

const COLONNES_UTILISATEURS = [
    { cle: 'matricule', libelle: 'Matricule' },
    { cle: 'nom', libelle: 'Nom' },
    { cle: 'prenom', libelle: 'Prénom' },
    { cle: 'role', libelle: 'Rôle' },
    { cle: 'derniereConnexion', libelle: 'Dernière connexion' }
];

function utilisateurVersLigne(u) {
    return {
        matricule: u.matricule,
        nom: u.nom,
        prenom: u.prenom,
        role: u.Role ? u.Role.nom : '',
        derniereConnexion: u.derniere_connexion ? new Date(u.derniere_connexion).toLocaleString('fr-FR') : 'Jamais'
    };
}

router.get('/:id/outils/export.csv', exigerExport, async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: activite } = await api.get(`/activites/${req.params.id}`);
        const resp = await api.get(`/outils?id_activite=${req.params.id}`);
        const archives = req.query.onglet === 'archives';
        const outils = resp.data.filter(o => o.active !== archives);

        envoyerCsv(res, `${archives ? 'archives' : 'outils'}-${activite.abbreviation || activite.nom}.csv`, COLONNES_OUTILS, outils.map(outilVersLigne));
    } catch (err) { next(err); }
});

router.get('/:id/outils/export-pdf', exigerExport, async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: activite } = await api.get(`/activites/${req.params.id}`);
        const resp = await api.get(`/outils?id_activite=${req.params.id}`);
        const archives = req.query.onglet === 'archives';
        const outils = resp.data.filter(o => o.active !== archives);
        const lignes = outils.map(outilVersLigne);

        res.render('impression', {
            titre: `${archives ? 'Archives' : 'Outils'} — ${activite.nom}`,
            sousTitre: null,
            dateGeneration: new Date().toLocaleString('fr-FR'),
            colonnes: COLONNES_OUTILS.map(c => c.libelle),
            lignes: lignes.map(l => COLONNES_OUTILS.map(c => l[c.cle])),
            autoImprimer: false
        });
    } catch (err) { next(err); }
});

router.get('/:id/utilisateurs/export.csv', exigerExport, async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: activite } = await api.get(`/activites/${req.params.id}`);
        const resp = await api.get(`/utilisateurs?id_activite=${req.params.id}`);

        envoyerCsv(res, `utilisateurs-${activite.abbreviation || activite.nom}.csv`, COLONNES_UTILISATEURS, resp.data.map(utilisateurVersLigne));
    } catch (err) { next(err); }
});

router.get('/:id/utilisateurs/export-pdf', exigerExport, async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: activite } = await api.get(`/activites/${req.params.id}`);
        const resp = await api.get(`/utilisateurs?id_activite=${req.params.id}`);
        const lignes = resp.data.map(utilisateurVersLigne);

        res.render('impression', {
            titre: `Utilisateurs — ${activite.nom}`,
            sousTitre: null,
            dateGeneration: new Date().toLocaleString('fr-FR'),
            colonnes: COLONNES_UTILISATEURS.map(c => c.libelle),
            lignes: lignes.map(l => COLONNES_UTILISATEURS.map(c => l[c.cle])),
            autoImprimer: false
        });
    } catch (err) { next(err); }
});


router.get('/:id/reglages', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: activite } = await api.get(`/activites/${req.params.id}`);
        if (estActiviteProtegee(activite) && !estAdminSession(req) && !activiteDebloquee(req, activite.id)) {
            return res.redirect(`/activites/${activite.id}/deverrouiller?retour=${encodeURIComponent(req.originalUrl)}`);
        }
        res.locals.breadcrumbs = filArianeActivite(activite, { label: 'Réglages' });
        res.render('activite/reglages', {
            titre: 'Réglages — ' + activite.nom,
            activite,
            erreur: null,
            succes: null
        });
    } catch (err) { next(err); }
});

router.post('/:id/reglages', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const body = { ...req.body };
        body.acces_protege = req.body.acces_protege === 'true' || req.body.acces_protege === 'on';
        const keys = [
            'credentials_actifs', 'surveillance_active', 'tickets_actifs',
            'partage_outils', 'export_autorise', 'diagnostic_actif', 'mdp_complexite'
        ];
        for (const k of keys) {
            if (body[k] === 'inherit' || body[k] === '') body[k] = null;
            else if (body[k] === 'true') body[k] = true;
            else if (body[k] === 'false') body[k] = false;
        }
        if (body.mdp_longueur_min === '') body.mdp_longueur_min = null;
        if (body.max_tentatives_connexion === '') body.max_tentatives_connexion = null;
        const { data: activite } = await api.put(`/activites/${req.params.id}/reglages`, body);
        res.locals.breadcrumbs = filArianeActivite(activite, { label: 'Réglages' });
        res.render('activite/reglages', {
            titre: 'Réglages — ' + activite.nom,
            activite,
            erreur: null,
            succes: 'Réglages enregistrés.'
        });
    } catch (err) {
        try {
            const api = apiClient(req);
            const { data: activite } = await api.get(`/activites/${req.params.id}`);
            res.render('activite/reglages', {
                titre: 'Réglages',
                activite,
                erreur: err.response?.data?.message || 'Erreur',
                succes: null
            });
        } catch (e) { next(err); }
    }
});

router.get('/:id/deverrouiller', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: activite } = await api.get(`/activites/${req.params.id}`);
        if (!estActiviteProtegee(activite)) return res.redirect(`/activites/${req.params.id}`);
        if (estAdminSession(req) || activiteDebloquee(req, activite.id)) {
            return res.redirect(req.query.retour || `/activites/${req.params.id}`);
        }
        res.locals.breadcrumbs = filArianeActivite(activite, { label: 'Accès' });
        res.render('activite/deverrouiller', {
            titre: 'Activité protégée',
            activite: {
                id: activite.id,
                nom: activite.nom,
                acces_protege: true,
                acces_indice: activite.acces_indice || (activite.reglages && activite.reglages.acces_indice) || null
            },
            erreur: null,
            retour: req.query.retour || `/activites/${req.params.id}`
        });
    } catch (err) { next(err); }
});

router.post('/:id/deverrouiller', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.post(`/activites/${req.params.id}/verifier-acces`, { cle: req.body.cle });
        marquerDebloquee(req, req.params.id);
        return res.redirect(req.body.retour || `/activites/${req.params.id}`);
    } catch (err) {
        try {
            const api = apiClient(req);
            const { data: activite } = await api.get(`/activites/${req.params.id}`);
            res.locals.breadcrumbs = filArianeActivite(activite, { label: 'Accès' });
            res.render('activite/deverrouiller', {
                titre: 'Activité protégée',
                activite: {
                    id: activite.id,
                    nom: activite.nom,
                    acces_protege: true,
                    acces_indice: activite.acces_indice || (activite.reglages && activite.reglages.acces_indice) || null
                },
                erreur: (err.response && err.response.data && err.response.data.message) || "Clé d'accès incorrecte.",
                retour: req.body.retour || `/activites/${req.params.id}`
            });
        } catch (e) { next(err); }
    }
});

module.exports = router;

