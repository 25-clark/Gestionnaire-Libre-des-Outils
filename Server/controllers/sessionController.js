const path = require('path');
const fs = require('fs');
const os = require('os');
const { SessionUtilisateur, Utilisateur } = require('../models');
const { isAdmin } = require('../middlewares/auth');

function sessionDir() {
    return path.join(os.tmpdir(), 'glo-sessions');
}

function detruireFichierSession(sid) {
    try {
        const safe = String(sid).replace(/[^a-zA-Z0-9_\-%.]/g, '_');
        const f = path.join(sessionDir(), safe + '.json');
        if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (_) {}
}

async function enregistrerSession(req, userId) {
    if (!req.sessionID || !userId) return;
    const ip = req.ip || req.headers['x-forwarded-for'] || null;
    const ua = (req.headers['user-agent'] || '').slice(0, 500);
    const existante = await SessionUtilisateur.findOne({
        where: { sid: req.sessionID, id_user: userId, revoquee: false }
    });
    if (existante) {
        await existante.update({ derniere_activite: new Date(), ip, user_agent: ua });
        return existante;
    }
    return SessionUtilisateur.create({
        id_user: userId,
        sid: req.sessionID,
        ip,
        user_agent: ua,
        derniere_activite: new Date(),
        revoquee: false
    });
}

async function lister(req, res, next) {
    try {
        const admin = isAdmin(req.currentUser);
        const where = { revoquee: false };
        // Admin : toutes les sessions (filtre optionnel id_user)
        // Utilisateur : uniquement les siennes
        if (admin && req.query.id_user) {
            where.id_user = parseInt(req.query.id_user, 10);
        } else if (!admin) {
            where.id_user = req.currentUser.id;
        }
        const sessions = await SessionUtilisateur.findAll({
            where,
            include: admin
                ? [{ model: Utilisateur, attributes: ['id', 'nom', 'prenom', 'matricule'] }]
                : [],
            order: [['derniere_activite', 'DESC']],
            limit: admin ? 200 : 50
        });
        res.json({
            admin,
            sessions: sessions.map(s => ({
                id: s.id,
                id_user: s.id_user,
                utilisateur: s.Utilisateur
                    ? {
                        id: s.Utilisateur.id,
                        nom: s.Utilisateur.nom,
                        prenom: s.Utilisateur.prenom,
                        matricule: s.Utilisateur.matricule
                    }
                    : null,
                ip: s.ip,
                user_agent: s.user_agent,
                derniere_activite: s.derniere_activite,
                created_at: s.created_at,
                courante: s.sid === req.sessionID
            }))
        });
    } catch (err) { next(err); }
}

async function revoquer(req, res, next) {
    try {
        const session = await SessionUtilisateur.findByPk(req.params.id);
        if (!session || session.revoquee) {
            return res.status(404).json({ message: 'Session introuvable.' });
        }
        if (session.id_user !== req.currentUser.id && !isAdmin(req.currentUser)) {
            return res.status(403).json({ message: 'Accès refusé.' });
        }
        if (session.sid === req.sessionID) {
            return res.status(400).json({ message: 'Impossible de révoquer la session courante. Déconnectez-vous.' });
        }
        detruireFichierSession(session.sid);
        await session.update({ revoquee: true });
        res.json({ message: 'Session révoquée.' });
    } catch (err) { next(err); }
}

async function revoquerToutes(req, res, next) {
    try {
        const idUser = parseInt(req.body.id_user || req.currentUser.id, 10);
        if (idUser !== req.currentUser.id && !isAdmin(req.currentUser)) {
            return res.status(403).json({ message: 'Accès refusé.' });
        }
        const sessions = await SessionUtilisateur.findAll({
            where: { id_user: idUser, revoquee: false }
        });
        for (const s of sessions) {
            if (s.sid === req.sessionID) continue;
            detruireFichierSession(s.sid);
            await s.update({ revoquee: true });
        }
        res.json({ message: 'Autres sessions révoquées.' });
    } catch (err) { next(err); }
}

/** Middleware : refuse si session révoquée en base */
async function rejeterSiRevoquee(req, res, next) {
    try {
        if (!req.session || !req.session.userId || !req.sessionID) return next();
        const s = await SessionUtilisateur.findOne({
            where: { sid: req.sessionID, id_user: req.session.userId }
        });
        if (s && s.revoquee) {
            req.session.destroy(() => {});
            return res.status(401).json({ message: 'Cette session a été révoquée. Reconnectez-vous.' });
        }
        if (s) {
            // Toucher activité au plus toutes les 2 min
            const diff = Date.now() - new Date(s.derniere_activite).getTime();
            if (diff > 2 * 60 * 1000) {
                s.update({ derniere_activite: new Date() }).catch(() => {});
            }
        }
        next();
    } catch (_) { next(); }
}

module.exports = {
    enregistrerSession,
    lister,
    revoquer,
    revoquerToutes,
    rejeterSiRevoquee
};
