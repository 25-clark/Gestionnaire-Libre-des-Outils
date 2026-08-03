const { UtilisateurActivite, UtilisateurSousActivite, Utilisateur, Activite, SousActivite } = require('../models');

// ---------- Accès sur une Activité ----------

async function getAccesActivites(req, res, next) {
    try {
        const where = {};
        if (req.query.id_user) where.id_user = req.query.id_user;
        if (req.query.id_activite) where.id_activite = req.query.id_activite;

        const acces = await UtilisateurActivite.findAll({
            where,
            include: [{ model: Utilisateur }, { model: Activite }]
        });
        res.json(acces);
    } catch (err) { next(err); }
}

async function accorderAccesActivite(req, res, next) {
    try {
        const { id_user, id_activite, permissions } = req.body;
        if (!id_user || !id_activite) {
            return res.status(400).json({ message: 'id_user et id_activite sont requis.' });
        }

        const [acces, cree] = await UtilisateurActivite.findOrCreate({
            where: { id_user, id_activite },
            defaults: { permissions: permissions || { read: true, write: false, delete: false } }
        });

        if (!cree && permissions) {
            await acces.update({ permissions });
        }

        res.status(cree ? 201 : 200).json(acces);
    } catch (err) { next(err); }
}

async function revoquerAccesActivite(req, res, next) {
    try {
        const acces = await UtilisateurActivite.findByPk(req.params.id);
        if (!acces) return res.status(404).json({ message: 'Accès introuvable.' });
        await acces.destroy();
        res.json({ message: 'Accès révoqué.' });
    } catch (err) { next(err); }
}

// ---------- Accès sur une Sous-activité ----------

async function getAccesSousActivites(req, res, next) {
    try {
        const where = {};
        if (req.query.id_user) where.id_user = req.query.id_user;
        if (req.query.id_sous_activite) where.id_sous_activite = req.query.id_sous_activite;

        const acces = await UtilisateurSousActivite.findAll({
            where,
            include: [{ model: Utilisateur }, { model: SousActivite }]
        });
        res.json(acces);
    } catch (err) { next(err); }
}

async function accorderAccesSousActivite(req, res, next) {
    try {
        const { id_user, id_sous_activite, permissions } = req.body;
        if (!id_user || !id_sous_activite) {
            return res.status(400).json({ message: 'id_user et id_sous_activite sont requis.' });
        }

        const [acces, cree] = await UtilisateurSousActivite.findOrCreate({
            where: { id_user, id_sous_activite },
            defaults: { permissions: permissions || { read: true, write: false, delete: false } }
        });

        if (!cree && permissions) {
            await acces.update({ permissions });
        }

        res.status(cree ? 201 : 200).json(acces);
    } catch (err) { next(err); }
}

async function revoquerAccesSousActivite(req, res, next) {
    try {
        const acces = await UtilisateurSousActivite.findByPk(req.params.id);
        if (!acces) return res.status(404).json({ message: 'Accès introuvable.' });
        await acces.destroy();
        res.json({ message: 'Accès révoqué.' });
    } catch (err) { next(err); }
}

module.exports = {
    getAccesActivites,
    accorderAccesActivite,
    revoquerAccesActivite,
    getAccesSousActivites,
    accorderAccesSousActivite,
    revoquerAccesSousActivite
};
