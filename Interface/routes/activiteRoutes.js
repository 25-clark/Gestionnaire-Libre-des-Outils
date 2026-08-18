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
        res.render('activite/reglages', { titre: 'Réglages — ' + activite.nom, activite, erreur: null, succes: null });
    } catch (err) { next(err); }
});

router.post('/:id/reglages', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const body = { ...req.body };
        // normaliser selects inherit
        const keys = ['credentials_actifs','surveillance_active','tickets_actifs','partage_outils','export_autorise','diagnostic_actif','mdp_complexite'];
        for (const k of keys) {
            if (body[k] === 'inherit' || body[k] === '') body[k] = null;
            else if (body[k] === 'true') body[k] = true;
            else if (body[k] === 'false') body[k] = false;
        }
        if (body.mdp_longueur_min === '') body.mdp_longueur_min = null;
        if (body.max_tentatives_connexion === '') body.max_tentatives_connexion = null;
        const { data: activite } = await api.put(`/activites/${req.params.id}/reglages`, body);
        res.render('activite/reglages', { titre: 'Réglages — ' + activite.nom, activite, erreur: null, succes: 'Réglages enregistrés.' });
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


router.post('/:id/favori', async (req, res) => {
    try {
        const api = apiClient(req);
        const uid = req.session.user.id;
        const { data } = await api.post(`/utilisateurs/${uid}/favoris`, {
            type: 'activite',
            id_cible: parseInt(req.params.id, 10)
        });
        const wantsJson = (req.headers.accept || '').includes('application/json')
            || req.headers['x-requested-with'] === 'XMLHttpRequest'
            || req.query.ajax === '1';
        if (wantsJson) return res.json(data);
        const retour = req.get('Referer') || '/';
        const sep = retour.includes('?') ? '&' : '?';
        res.redirect(retour + sep + 'epingle=' + (data.epingle ? '1' : '0'));
    } catch (err) {
        const msg = err.response?.data?.message || err.message || 'Erreur épinglage';
        console.error('[favori activite]', msg);
        if ((req.headers.accept || '').includes('application/json')) {
            return res.status(err.response?.status || 500).json({ message: msg });
        }
        res.redirect((req.get('Referer') || '/') + '?erreur_favori=1');
    }
});

module.exports = router;
