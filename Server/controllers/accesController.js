const { UtilisateurActivite, UtilisateurSousActivite, Utilisateur, Activite, SousActivite } = require('../models');
const { normaliserPermissions } = require('../middlewares/auth');
const { consigner } = require('../utils/journal');

// Renvoie l'accès avec ses permissions garanties sous forme d'objet JS
// (et non une chaîne JSON), quel que soit ce que renvoie le driver MySQL.
// Même correctif que pour les rôles (serialiserRole dans roleController.js).
function serialiserAcces(acces) {
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
        res.json(acces.map(serialiserAcces));
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

        const accesComplet = await UtilisateurActivite.findByPk(acces.id, { include: [{ model: Utilisateur }, { model: Activite }] });
        await consigner({
            user: req.currentUser,
            action: cree ? 'octroi_acces' : 'modification',
            ressource: 'acces',
            id_ressource: acces.id,
            libelle: `Accès de ${accesComplet.Utilisateur.prenom} ${accesComplet.Utilisateur.nom} sur l'activité "${accesComplet.Activite.nom}" ${cree ? 'accordé' : 'modifié'}`
        });

        res.status(cree ? 201 : 200).json(serialiserAcces(acces));
    } catch (err) { next(err); }
}

async function revoquerAccesActivite(req, res, next) {
    try {
        const acces = await UtilisateurActivite.findByPk(req.params.id, { include: [{ model: Utilisateur }, { model: Activite }] });
        if (!acces) return res.status(404).json({ message: 'Accès introuvable.' });

        const libelle = `Accès de ${acces.Utilisateur.prenom} ${acces.Utilisateur.nom} sur l'activité "${acces.Activite.nom}" révoqué`;
        await acces.destroy();

        await consigner({ user: req.currentUser, action: 'revocation_acces', ressource: 'acces', id_ressource: req.params.id, libelle });

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
        res.json(acces.map(serialiserAcces));
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

        const accesComplet = await UtilisateurSousActivite.findByPk(acces.id, { include: [{ model: Utilisateur }, { model: SousActivite }] });
        await consigner({
            user: req.currentUser,
            action: cree ? 'octroi_acces' : 'modification',
            ressource: 'acces',
            id_ressource: acces.id,
            libelle: `Accès de ${accesComplet.Utilisateur.prenom} ${accesComplet.Utilisateur.nom} sur la sous-activité "${accesComplet.SousActivite.nom}" ${cree ? 'accordé' : 'modifié'}`
        });

        res.status(cree ? 201 : 200).json(serialiserAcces(acces));
    } catch (err) { next(err); }
}

async function revoquerAccesSousActivite(req, res, next) {
    try {
        const acces = await UtilisateurSousActivite.findByPk(req.params.id, { include: [{ model: Utilisateur }, { model: SousActivite }] });
        if (!acces) return res.status(404).json({ message: 'Accès introuvable.' });

        const libelle = `Accès de ${acces.Utilisateur.prenom} ${acces.Utilisateur.nom} sur la sous-activité "${acces.SousActivite.nom}" révoqué`;
        await acces.destroy();

        await consigner({ user: req.currentUser, action: 'revocation_acces', ressource: 'acces', id_ressource: req.params.id, libelle });

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
