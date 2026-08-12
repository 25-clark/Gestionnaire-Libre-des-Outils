const express = require('express');
const router = express.Router();
const { apiClient } = require('../config/api');
const { requireLogin, estAdmin } = require('../middlewares/requireLogin');
const { envoyerCsv } = require('../utils/csv');

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
        const page = parseInt(req.query.page, 10) || 1;
        const { data } = await api.get('/journal', {
            params: { page, q: req.query.q || undefined, ressource: req.query.ressource || undefined, action: req.query.action || undefined }
        });

        res.render('journal', {
            titre: "Journal d'événements",
            evenements: data.evenements,
            page: data.page,
            totalPages: data.totalPages,
            total: data.total,
            q: req.query.q || '',
            ressource: req.query.ressource || '',
            action: req.query.action || ''
        });
    } catch (err) { next(err); }
});

const COLONNES_JOURNAL = [
    { cle: 'date', libelle: 'Date' },
    { cle: 'utilisateur', libelle: 'Utilisateur' },
    { cle: 'matricule', libelle: 'Matricule' },
    { cle: 'action', libelle: 'Action' },
    { cle: 'ressource', libelle: 'Ressource' },
    { cle: 'libelle', libelle: 'Détail' }
];

async function recupererLignesJournal(req) {
    const api = apiClient(req);
    const { data } = await api.get('/journal/tout', {
        params: { q: req.query.q || undefined, ressource: req.query.ressource || undefined, action: req.query.action || undefined }
    });
    return data.evenements.map(e => ({
        date: new Date(e.createdAt).toLocaleString('fr-FR'),
        utilisateur: e.nom_user || 'Système',
        matricule: e.matricule_user || '',
        action: e.action,
        ressource: e.ressource,
        libelle: e.libelle
    }));
}

router.get('/export.csv', async (req, res, next) => {
    try {
        const lignes = await recupererLignesJournal(req);
        envoyerCsv(res, 'journal-evenements.csv', COLONNES_JOURNAL, lignes);
    } catch (err) { next(err); }
});

router.get('/export-pdf', async (req, res, next) => {
    try {
        const lignes = await recupererLignesJournal(req);
        res.render('impression', {
            titre: "Journal d'événements",
            sousTitre: [req.query.q, req.query.ressource, req.query.action].filter(Boolean).join(' · ') || null,
            dateGeneration: new Date().toLocaleString('fr-FR'),
            colonnes: COLONNES_JOURNAL.map(c => c.libelle),
            lignes: lignes.map(l => COLONNES_JOURNAL.map(c => l[c.cle])),
            autoImprimer: false
        });
    } catch (err) { next(err); }
});

module.exports = router;
