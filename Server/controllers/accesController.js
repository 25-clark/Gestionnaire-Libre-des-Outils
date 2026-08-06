const { UtilisateurActivite, UtilisateurSousActivite, Utilisateur, Activite, SousActivite } = require('../models');
const { normaliserPermissions } = require('../middlewares/auth');

function serialiser(acces) {
    const json = acces.toJSON();
    json.permissions = normaliserPermissions(json.permissions);
    return json;
}

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
        res.json(acces.map(serialiser));
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

        res.status(cree ? 201 : 200).json(serialiser(acces));
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
        res.json(acces.map(serialiser));
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

        res.status(cree ? 201 : 200).json(serialiser(acces));
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

// ---------- Mon propre accès (pas de permission "acces" requise : ----------
// ---------- consulter SON PROPRE accès est toujours autorisé) -------------

async function getMonAccesActivite(req, res, next) {
    try {
        const idActivite = parseInt(req.query.id_activite, 10);
        if (!idActivite) return res.json(null);

        const acces = await UtilisateurActivite.findOne({
            where: { id_user: req.currentUser.id, id_activite: idActivite }
        });

        res.json(acces ? serialiser(acces) : null);
    } catch (err) { next(err); }
}

async function getMonAccesSousActivite(req, res, next) {
    try {
        const idSousActivite = parseInt(req.query.id_sous_activite, 10);
        if (!idSousActivite) return res.json(null);

        const acces = await UtilisateurSousActivite.findOne({
            where: { id_user: req.currentUser.id, id_sous_activite: idSousActivite }
        });

        res.json(acces ? serialiser(acces) : null);
    } catch (err) { next(err); }
}

module.exports = {
    getAccesActivites,
    accorderAccesActivite,
    revoquerAccesActivite,
    getAccesSousActivites,
    accorderAccesSousActivite,
    revoquerAccesSousActivite,
    getMonAccesActivite,
    getMonAccesSousActivite
};
