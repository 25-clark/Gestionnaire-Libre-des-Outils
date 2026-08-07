const express = require('express');
const router = express.Router();
const { apiClient } = require('../config/api');
const { requireLogin } = require('../middlewares/requireLogin');

router.use(requireLogin);

router.get('/', (req, res) => {
    res.render('diagnostic', {
        titre: 'Diagnostic réseau',
        cible: req.query.cible || '',
        port: req.query.port || '',
        test: null,
        resultat: null,
        erreur: null
    });
});

const CHEMINS_API = { ping: '/diagnostic/ping', traceroute: '/diagnostic/traceroute', nslookup: '/diagnostic/nslookup', port: '/diagnostic/port' };
const LIBELLES_TESTS = { ping: 'Ping', traceroute: 'Traceroute', nslookup: 'Nslookup (DNS)', port: 'Test de port' };

router.get('/executer', async (req, res) => {
    const { cible, test, port } = req.query;

    if (!cible || !CHEMINS_API[test]) {
        return res.render('diagnostic', {
            titre: 'Diagnostic réseau',
            cible: cible || '',
            port: port || '',
            test: test || null,
            resultat: null,
            erreur: 'Cible ou test invalide.'
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
            erreur: null
        });
    } catch (err) {
        res.render('diagnostic', {
            titre: 'Diagnostic réseau',
            cible,
            port: port || '',
            test,
            testLibelle: LIBELLES_TESTS[test],
            resultat: null,
            erreur: err.response?.data?.sortie || err.response?.data?.message || 'Erreur lors du test.'
        });
    }
});

module.exports = router;
