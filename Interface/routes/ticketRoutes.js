const express = require('express');
const router = express.Router();
const { apiClient } = require('../config/api');
const { requireLogin, peutFaire, estAdmin } = require('../middlewares/requireLogin');
const { envoyerCsv } = require('../utils/csv');
const { uploadTicketImages } = require('../middlewares/upload');

function exigerExport(req, res, next) {
    if (!peutFaire(req.session.user, 'export', 'read')) {
        return res.status(403).render('erreur', { titre: 'Accès refusé', message: "Vous n'avez pas le droit d'exporter." });
    }
    next();
}

router.use(requireLogin);

const LIBELLES_STATUT = { ouvert: 'Ouvert', en_cours: 'En cours', resolu: 'Résolu', ferme: 'Fermé' };
const LIBELLES_PRIORITE = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' };

// ---------- Liste ----------
router.get('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { statut, priorite, id_createur, id_assigne, q } = req.query;
        const page = parseInt(req.query.page, 10) || 1;
        const par_page = parseInt(req.query.par_page, 10) || 25;
        const params = { page, par_page };
        if (statut) params.statut = statut;
        if (priorite) params.priorite = priorite;
        if (q) params.q = q;
        if (id_createur) params.id_createur = id_createur;
        if (id_assigne) params.id_assigne = id_assigne;

        const { data } = await api.get('/tickets', { params });
        const tickets = Array.isArray(data) ? data : (data.tickets || []);
        const pagination = Array.isArray(data) ? null : {
            page: data.page || page,
            par_page: data.par_page || par_page,
            totalPages: data.totalPages || 1,
            total: data.total != null ? data.total : tickets.length
        };

        const { data: utilisateurs } = await api.get('/utilisateurs');

        res.render('ticket/liste', {
            titre: 'Tickets',
            tickets,
            utilisateurs,
            statut: statut || '',
            priorite: priorite || '',
            q: q || '',
            id_createur: id_createur || '',
            id_assigne: id_assigne || '',
            page: pagination ? pagination.page : 1,
            par_page: pagination ? pagination.par_page : tickets.length,
            totalPages: pagination ? pagination.totalPages : 1,
            total: pagination ? pagination.total : tickets.length,
            LIBELLES_STATUT,
            LIBELLES_PRIORITE
        });
    } catch (err) { next(err); }
});

// ---------- Export ----------
const COLONNES_TICKETS = [
    { cle: 'id', libelle: '#' },
    { cle: 'titre', libelle: 'Titre' },
    { cle: 'statut', libelle: 'Statut' },
    { cle: 'priorite', libelle: 'Priorité' },
    { cle: 'lien', libelle: 'Lié à' },
    { cle: 'createur', libelle: 'Créé par' },
    { cle: 'assigne', libelle: 'Assigné à' },
    { cle: 'date', libelle: 'Date' }
];

function ticketVersLigne(t) {
    const lien = t.Outil ? `Outil : ${t.Outil.nom}` : t.SousActivite ? `Sous-activité : ${t.SousActivite.nom}` : t.Activite ? `Activité : ${t.Activite.nom}` : '—';
    return {
        id: t.id,
        titre: t.titre,
        statut: LIBELLES_STATUT[t.statut] || t.statut,
        priorite: LIBELLES_PRIORITE[t.priorite] || t.priorite,
        lien,
        createur: t.Createur ? `${t.Createur.prenom} ${t.Createur.nom}` : '',
        assigne: t.Assigne ? `${t.Assigne.prenom} ${t.Assigne.nom}` : 'Non assigné',
        date: new Date(t.createdAt).toLocaleString('fr-FR')
    };
}

async function recupererTicketsFiltres(req) {
    const api = apiClient(req);
    const { statut, priorite, id_createur, id_assigne, q } = req.query;
    const params = { page: 1, par_page: 100 };
    if (statut) params.statut = statut;
    if (priorite) params.priorite = priorite;
    if (q) params.q = q;
    if (id_createur) params.id_createur = id_createur;
    if (id_assigne) params.id_assigne = id_assigne;
    // Récupérer toutes les pages pour l'export
    let all = [];
    let page = 1;
    let totalPages = 1;
    do {
        params.page = page;
        const { data } = await api.get('/tickets', { params });
        if (Array.isArray(data)) {
            all = data;
            break;
        }
        all = all.concat(data.tickets || []);
        totalPages = data.totalPages || 1;
        page++;
    } while (page <= totalPages && page <= 50);
    return all;
}

router.get('/export.csv', exigerExport, async (req, res, next) => {
    try {
        const tickets = await recupererTicketsFiltres(req);
        envoyerCsv(res, 'tickets.csv', COLONNES_TICKETS, tickets.map(ticketVersLigne));
    } catch (err) { next(err); }
});

router.get('/export-pdf', exigerExport, async (req, res, next) => {
    try {
        const tickets = await recupererTicketsFiltres(req);
        const lignes = tickets.map(ticketVersLigne);
        res.render('impression', {
            titre: 'Tickets',
            sousTitre: null,
            dateGeneration: new Date().toLocaleString('fr-FR'),
            colonnes: COLONNES_TICKETS.map(c => c.libelle),
            lignes: lignes.map(l => COLONNES_TICKETS.map(c => l[c.cle])),
            autoImprimer: false
        });
    } catch (err) { next(err); }
});

// ---------- Création ----------

// Charge, selon l'activité/sous-activité choisie (ou déduite d'un outil
// précis), les listes nécessaires à la cascade Activité → Sous-activité →
// Outil. Le tout est déjà scopé au périmètre de l'utilisateur côté Server
// (GET /activites, /sous-activites, /outils filtrent tous par accès réel).
async function chargerListesFormulaire(api, id_activite, id_sous_activite) {
    const { data: activites } = await api.get('/activites');

    let sousActivites = [];
    let outils = [];
    if (id_activite) {
        const respSA = await api.get(`/sous-activites?id_activite=${id_activite}`);
        sousActivites = respSA.data;

        const respOutils = id_sous_activite
            ? await api.get(`/outils?id_sous_activite=${id_sous_activite}`)
            : await api.get(`/outils?id_activite=${id_activite}`);
        outils = respOutils.data.filter(o => o.active);
    }

    return { activites, sousActivites, outils };
}

router.get('/nouveau', async (req, res, next) => {
    try {
        const api = apiClient(req);
        let { id_outil, id_activite, id_sous_activite } = req.query;

        // Arrivée depuis le bouton "🎫 Signaler" d'un outil précis, sans
        // activité/sous-activité précisée dans l'URL : on les déduit de
        // l'outil pour préremplir toute la cascade automatiquement.
        if (id_outil && !id_activite && !id_sous_activite) {
            const { data: outil } = await api.get(`/outils/${id_outil}`);
            if (outil.sousActivites && outil.sousActivites[0]) {
                id_sous_activite = String(outil.sousActivites[0].id);
                id_activite = String(outil.sousActivites[0].id_activite);
            } else if (outil.activites && outil.activites[0]) {
                id_activite = String(outil.activites[0].id);
            }
        }

        const { activites, sousActivites, outils } = await chargerListesFormulaire(api, id_activite, id_sous_activite);

        res.render('ticket/form', {
            titre: 'Nouveau ticket',
            activites, sousActivites, outils,
            id_outil: id_outil || '',
            id_activite: id_activite || '',
            id_sous_activite: id_sous_activite || '',
            erreur: null
        });
    } catch (err) { next(err); }
});

router.post('/', uploadTicketImages.array('images', 6), async (req, res, next) => {
    try {
        const api = apiClient(req);
        const images = (req.files || []).map(f => `/uploads/tickets/${f.filename}`);

        const { data: ticket } = await api.post('/tickets', {
            titre: req.body.titre,
            description: req.body.description,
            priorite: req.body.priorite,
            id_outil: req.body.id_outil || null,
            id_activite: req.body.id_activite || null,
            id_sous_activite: req.body.id_sous_activite || null,
            images: JSON.stringify(images)
        });
        res.redirect(`/tickets/${ticket.id}`);
    } catch (err) {
        try {
            const api = apiClient(req);
            const { activites, sousActivites, outils } = await chargerListesFormulaire(api, req.body.id_activite, req.body.id_sous_activite);
            res.render('ticket/form', {
                titre: 'Nouveau ticket',
                activites, sousActivites, outils,
                id_outil: req.body.id_outil || '',
                id_activite: req.body.id_activite || '',
                id_sous_activite: req.body.id_sous_activite || '',
                erreur: err.response?.data?.message || 'Erreur lors de la création du ticket.'
            });
        } catch (err2) { next(err2); }
    }
});

// ---------- Détail + messagerie ----------
router.get('/:id', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: ticket } = await api.get(`/tickets/${req.params.id}`);

        // Pour le menu d'assignation : la liste des utilisateurs (tous, pour
        // rester simple — l'assignation "au bon périmètre" reste au jugement
        // de qui assigne).
        let utilisateurs = [];
        let roles = [];
        if (peutFaire(req.session.user, 'tickets', 'update') || estAdmin(req.session.user)) {
            const [uRes, rRes] = await Promise.all([
                api.get('/utilisateurs'),
                api.get('/roles').catch(() => ({ data: [] }))
            ]);
            utilisateurs = uRes.data || [];
            roles = rRes.data || [];
        }

        res.locals.breadcrumbs = [
            { label: 'Tableau de bord', href: '/' },
            { label: 'Assistance' },
            { label: 'Tickets', href: '/tickets' },
            { label: '#' + (ticket && ticket.id ? ticket.id : '') }
        ];
        res.render('ticket/detail', {
            titre: `#${ticket.id} ${ticket.titre}`,
            ticket,
            utilisateurs,
            roles,
            LIBELLES_STATUT,
            LIBELLES_PRIORITE,
            erreur: null
        });
    } catch (err) { next(err); }
});

router.post('/:id/modifier', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const body = { ...req.body };
        // Multi-select HTML → tableaux
        if (body.assignees_users && !Array.isArray(body.assignees_users)) {
            body.assignees_users = [body.assignees_users];
        }
        if (body.assignees_roles && !Array.isArray(body.assignees_roles)) {
            body.assignees_roles = [body.assignees_roles];
        }
        if (Array.isArray(body.assignees_users)) {
            body.id_assigne = body.assignees_users[0] || null;
        }
        await api.put(`/tickets/${req.params.id}`, body);
        res.redirect(`/tickets/${req.params.id}`);
    } catch (err) { next(err); }
});

router.post('/:id/messages/:messageId/modifier', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.put(`/tickets/${req.params.id}/messages/${req.params.messageId}`, {
            contenu: req.body.contenu
        });
        res.redirect(`/tickets/${req.params.id}`);
    } catch (err) { next(err); }
});

router.post('/:id/messages', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.post(`/tickets/${req.params.id}/messages`, { contenu: req.body.contenu });
        res.redirect(`/tickets/${req.params.id}`);
    } catch (err) { next(err); }
});

router.post('/:id/supprimer', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.delete(`/tickets/${req.params.id}`);
        res.redirect('/tickets');
    } catch (err) { next(err); }
});


router.post('/:id/escalader', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.post(`/tickets/${req.params.id}/escalader`, req.body || {});
        res.redirect(`/tickets/${req.params.id}?succes=escalade`);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
