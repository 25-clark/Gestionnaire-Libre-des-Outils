/**
 * Normalise et complète le lien d'une notification vers la bonne page GLO.
 */
function normaliserLienNotif(lien, message, type) {
    let l = (lien && String(lien).trim()) || '';
    const msg = (message && String(message)) || '';
    const t = (type && String(type)) || '';

    // Inférences si pas de lien stocké (anciennes notifications)
    if (!l) {
        if (t === 'securite' || /nouvelle connexion|connexion concurrente/i.test(msg)) {
            l = '/securite/sessions';
        } else if (t === 'delegation' || /délégu/i.test(msg)) {
            l = '/securite/delegations';
        } else if (t === 'acces' || /demande d['']accès/i.test(msg)) {
            l = '/securite/demandes-acces';
        } else if (/mot de passe.*réinitialis/i.test(msg)) {
            l = '/changer-mot-de-passe';
        } else {
            const mTicket = msg.match(/ticket\s*#?\s*(\d+)/i);
            if (mTicket) l = '/assistance/tickets/' + mTicket[1];
        }
    }

    if (!l) return null;

    // Préfixes Interface
    if (l.startsWith('/tickets')) l = '/assistance' + l;
    if (l.startsWith('/notifications')) l = '/assistance' + l;
    if (l.startsWith('/diagnostic')) l = '/assistance' + l;
    if (l.startsWith('/roles')) l = '/administration' + l;
    if (l.startsWith('/parametres')) l = '/administration' + l;
    if (l.startsWith('/journal')) l = '/administration' + l;
    if (l.startsWith('/statistiques')) l = '/administration' + l;
    if (l.startsWith('/ldap')) l = '/administration' + l;
    if (l.startsWith('/acces') && !l.startsWith('/securite')) l = '/administration' + l;

    if (l.startsWith('http://') || l.startsWith('https://')) return l;
    if (!l.startsWith('/')) l = '/' + l;
    return l;
}

/** Extrait le nom d'outil entre guillemets : Votre outil "Fnac Darty" ... */
function extraireNomOutil(message) {
    if (!message) return null;
    const m = String(message).match(/outil\s+[«"]([^»"]+)[»"]/i)
        || String(message).match(/outil\s+"([^"]+)"/i);
    return m ? m[1].trim() : null;
}

const express = require('express');
const router = express.Router();
const { apiClient } = require('../config/api');
const { requireLogin, peutFaire } = require('../middlewares/requireLogin');

router.use(requireLogin);

router.use((req, res, next) => {
    if (!peutFaire(req.session.user, 'notifications', 'read')) {
        return res.status(403).render('erreur', {
            titre: 'Accès refusé',
            message: "Vous n'avez pas accès aux notifications."
        });
    }
    next();
});

router.get('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const page = parseInt(req.query.page, 10) || 1;
        const { data } = await api.get('/notifications', { params: { page } });
        res.render('notifications', {
            titre: 'Notifications',
            notifications: data.notifications || [],
            page: data.page || 1,
            totalPages: data.totalPages || 1,
            total: data.total || 0
        });
    } catch (err) { next(err); }
});

router.post('/:id/lue', async (req, res) => {
    let dest = '/assistance/notifications';
    try {
        const { data } = await apiClient(req).post(`/notifications/${req.params.id}/lue`);
        dest = normaliserLienNotif(data && data.lien, data && data.message, data && data.type)
            || dest;
    } catch { /* ignore */ }
    delete req.session._notifBadge;
    res.redirect(dest);
});

router.post('/toutes-lues', async (req, res) => {
    try {
        await apiClient(req).post('/notifications/toutes-lues');
        delete req.session._notifBadge;
    } catch { /* ignore */ }
    res.redirect('/assistance/notifications');
});

router.post('/vider', async (req, res) => {
    try {
        await apiClient(req).post('/notifications/vider');
        delete req.session._notifBadge;
    } catch { /* ignore */ }
    res.redirect('/assistance/notifications');
});

/**
 * Clic notification : marque lue, résout la cible (outil → activité, etc.), redirige.
 */
router.get('/:id/ouvrir', async (req, res) => {
    let dest = '/assistance/notifications';
    try {
        const api = apiClient(req);
        let n = null;
        try {
            const r = await api.get(`/notifications/${req.params.id}`);
            n = r.data;
        } catch (_) {}
        try {
            const r = await api.post(`/notifications/${req.params.id}/lue`);
            if (r.data) n = r.data;
        } catch (_) {}

        if (n) {
            dest = normaliserLienNotif(n.lien, n.message, n.type) || dest;

            // Outil sans lien activité : chercher l'outil par nom puis basculer vers son activité
            const nomOutil = extraireNomOutil(n.message);
            if (nomOutil && (dest === '/assistance/notifications' || dest.startsWith('/outils/'))) {
                try {
                    const { data: outils } = await api.get('/outils');
                    const liste = Array.isArray(outils) ? outils : (outils.outils || []);
                    const found = liste.find(o => o.nom && o.nom.toLowerCase() === nomOutil.toLowerCase());
                    if (found) {
                        const acts = found.activites || found.Activites || [];
                        const sas = found.sousActivites || found.SousActivites || [];
                        if (sas.length) dest = `/sous-activites/${sas[0].id}?onglet=outils`;
                        else if (acts.length) dest = `/activites/${acts[0].id}?onglet=outils`;
                        else dest = `/outils/${found.id}`;
                    }
                } catch (_) {}
            }
        }
    } catch (_) {}
    delete req.session._notifBadge;
    res.redirect(dest);
});

module.exports = router;
