const express = require('express');
const router = express.Router();
const { requireLogin, estAdmin } = require('../middlewares/requireLogin');
const { apiClient } = require('../config/api');

router.use(requireLogin);

const pages = {
    support: { titre_fr: 'Support', titre_en: 'Support' },
    documentation: { titre_fr: 'Documentation', titre_en: 'Documentation' },
    'mise-a-jour': { titre_fr: 'Mise à jour', titre_en: 'Updates' },
    extensions: { titre_fr: 'Extensions', titre_en: 'Extensions' },
    soutien: { titre_fr: 'Soutien & donation', titre_en: 'Support & donation' },
    confidentialite: { titre_fr: 'Confidentialité', titre_en: 'Privacy' }
};

function itemsAideAutorises(user) {
    if (estAdmin(user)) return Object.keys(pages);
    if (!user || !user.Role || !user.Role.permissions) return Object.keys(pages);
    let perms = user.Role.permissions;
    if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch { return Object.keys(pages); }
    }
    if (!perms.aide) return Object.keys(pages);
    return Object.keys(pages).filter(k => !!perms.aide[k]);
}

function titrePage(key, lang) {
    const p = pages[key];
    if (!p) return key;
    return lang === 'en' ? p.titre_en : p.titre_fr;
}

router.get('/', (req, res) => {
    const allowed = itemsAideAutorises(req.session.user);
    if (!allowed.length) {
        return res.status(403).render('erreur', {
            titre: res.locals.lang === 'en' ? 'Access denied' : 'Accès refusé',
            message: res.locals.lang === 'en'
                ? 'No help page is authorized for your role.'
                : 'Aucune page d\'aide n\'est autorisée pour votre rôle.'
        });
    }
    const prefer = allowed.includes('documentation') ? 'documentation' : allowed[0];
    res.redirect('/aide/' + prefer);
});

router.post('/support', async (req, res) => {
    const lang = res.locals.lang === 'en' ? 'en' : 'fr';
    const titre = titrePage('support', lang);
    try {
        const api = apiClient(req);
        const { data } = await api.post('/support', {
            sujet: req.body.sujet,
            message: req.body.message,
            categorie: req.body.categorie,
            contact: req.body.contact
        });
        res.render('aide/support', {
            titre,
            pageAide: 'support',
            succes: data.message || (lang === 'en' ? 'Your request has been sent.' : 'Votre demande a été envoyée.'),
            erreur: null,
            form: {}
        });
    } catch (err) {
        const msg = (err.response && err.response.data && err.response.data.message)
            || (lang === 'en' ? 'Unable to send your request. Please try again later.' : 'Impossible d\'envoyer votre demande. Réessayez plus tard.');
        res.render('aide/support', {
            titre,
            pageAide: 'support',
            succes: null,
            erreur: msg,
            form: {
                sujet: req.body.sujet || '',
                message: req.body.message || '',
                categorie: req.body.categorie || 'general',
                contact: req.body.contact || ''
            }
        });
    }
});

router.get('/:page', (req, res) => {
    const p = pages[req.params.page];
    if (!p) {
        return res.status(404).render('erreur', {
            titre: res.locals.lang === 'en' ? 'Not found' : 'Introuvable',
            message: res.locals.lang === 'en' ? 'Unknown help page.' : "Page d'aide inconnue."
        });
    }
    const allowed = itemsAideAutorises(req.session.user);
    if (!allowed.includes(req.params.page)) {
        return res.status(403).render('erreur', {
            titre: res.locals.lang === 'en' ? 'Access denied' : 'Accès refusé',
            message: res.locals.lang === 'en'
                ? 'This help page is not authorized for your role.'
                : "Cette page d'aide n'est pas autorisée pour votre rôle."
        });
    }
    const lang = res.locals.lang === 'en' ? 'en' : 'fr';
    res.render('aide/' + req.params.page, {
        titre: titrePage(req.params.page, lang),
        pageAide: req.params.page,
        succes: null,
        erreur: null,
        form: {},
        updateUrl: process.env.GLO_UPDATE_URL || 'https://github.com/',
        versionGlo: process.env.GLO_VERSION || '1.0.0',
        soutienTel: process.env.GLO_SOUTIEN_TEL || '+261 00 000 00 00',
        soutienBanque: process.env.GLO_SOUTIEN_BANQUE || 'Compte à préciser par l’éditeur',
        soutienTitulaire: process.env.GLO_SOUTIEN_TITULAIRE || 'Créateur GLO'
    });
});

module.exports = router;
