const express = require('express');
const router = express.Router();
const { apiClient } = require('../config/api');
const { requireLogin } = require('../middlewares/requireLogin');
const { envoyerCsv } = require('../utils/csv');

router.use(requireLogin);

router.get('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: outils } = await api.get('/outils');
        const parc = outils.filter(o => o.adresse);

        res.render('diagnostic', {
            titre: 'Diagnostic réseau',
            cible: req.query.cible || '',
            port: req.query.port || '',
            test: null,
            resultat: null,
            erreur: null,
            parc
        });
    } catch (err) { next(err); }
});

const CHEMINS_API = { ping: '/diagnostic/ping', traceroute: '/diagnostic/traceroute', nslookup: '/diagnostic/nslookup', port: '/diagnostic/port' };
const LIBELLES_TESTS = { ping: 'Ping', traceroute: 'Traceroute', nslookup: 'Nslookup (DNS)', port: 'Test de port' };

async function recupererParc(req) {
    try {
        const { data: outils } = await apiClient(req).get('/outils');
        return outils.filter(o => o.adresse);
    } catch {
        return [];
    }
}

router.get('/executer', async (req, res) => {
    const { cible, test, port } = req.query;
    const parc = await recupererParc(req);

    if (!cible || !CHEMINS_API[test]) {
        return res.render('diagnostic', {
            titre: 'Diagnostic réseau',
            cible: cible || '',
            port: port || '',
            test: test || null,
            resultat: null,
            erreur: 'Cible ou test invalide.',
            parc
        });
    }

    try {
        const api = apiClient(req);
        const params = { cible };
        if (test === 'port') params.port = port;

        const { data } = await api.get(CHEMINS_API[test], { params });

        res.render('diagnostic', {
            titre: 'Diagnostic réseau',
            cible,
            port: port || '',
            test,
            testLibelle: LIBELLES_TESTS[test],
            resultat: data,
            erreur: null,
            parc
        });
    } catch (err) {
        res.render('diagnostic', {
            titre: 'Diagnostic réseau',
            cible,
            port: port || '',
            test,
            testLibelle: LIBELLES_TESTS[test],
            resultat: null,
            erreur: err.response?.data?.sortie || err.response?.data?.message || 'Erreur lors du test.',
            parc
        });
    }
});

const COLONNES_PARC = [
    { cle: 'nom', libelle: 'Nom' },
    { cle: 'adresse', libelle: 'Adresse' },
    { cle: 'statut', libelle: 'Statut' },
    { cle: 'derniereVerification', libelle: 'Dernière vérification' },
    { cle: 'proprietaire', libelle: 'Propriétaire' }
];

function parcVersLigne(o) {
    const statuts = { en_ligne: 'En ligne 🟢', hors_ligne: 'Hors ligne 🔴', inconnu: 'Inconnu ⚪' };
    return {
        nom: o.nom,
        adresse: o.adresse,
        statut: statuts[o.dernier_statut] || 'Inconnu',
        derniereVerification: o.derniere_verification ? new Date(o.derniere_verification).toLocaleString('fr-FR') : 'Jamais',
        proprietaire: o.Utilisateur ? `${o.Utilisateur.prenom} ${o.Utilisateur.nom}` : ''
    };
}

router.get('/export.csv', async (req, res, next) => {
    try {
        const parc = await recupererParc(req);
        envoyerCsv(res, 'parc-reseau.csv', COLONNES_PARC, parc.map(parcVersLigne));
    } catch (err) { next(err); }
});

router.get('/export-pdf', async (req, res, next) => {
    try {
        const parc = await recupererParc(req);
        const lignes = parc.map(parcVersLigne);

        res.render('impression', {
            titre: 'État du parc réseau',
            sousTitre: null,
            dateGeneration: new Date().toLocaleString('fr-FR'),
            colonnes: COLONNES_PARC.map(c => c.libelle),
            lignes: lignes.map(l => COLONNES_PARC.map(c => l[c.cle])),
            autoImprimer: false
        });
    } catch (err) { next(err); }
});

module.exports = router;
