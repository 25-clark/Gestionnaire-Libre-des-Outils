const { Role, Utilisateur } = require('../models');
const { normaliserPermissions } = require('../middlewares/auth');
const { consigner } = require('../utils/journal');

// Renvoie le rôle avec ses permissions garanties sous forme d'objet JS
// (et non une chaîne JSON), quel que soit ce que renvoie le driver MySQL.
function serialiserRole(role) {
    const json = role.toJSON();
    json.permissions = normaliserPermissions(json.permissions);
    return json;
}

async function getAll(req, res, next) {
    try {
        const roles = await Role.findAll({ order: [['id', 'ASC']] });
        res.json(roles.map(serialiserRole));
    } catch (err) { next(err); }
}

async function getById(req, res, next) {
    try {
        const role = await Role.findByPk(req.params.id);
        if (!role) return res.status(404).json({ message: 'Rôle introuvable.' });
        res.json(serialiserRole(role));
    } catch (err) { next(err); }
}

async function create(req, res, next) {
    try {
        const { nom, abbreviation, permissions } = req.body;
        if (!nom || !abbreviation) {
            return res.status(400).json({ message: 'Le nom et l\'abréviation sont requis.' });
        }
        const role = await Role.create({ nom, abbreviation, permissions: permissions || {} });

        await consigner({
            user: req.currentUser,
            action: 'creation',
            ressource: 'role',
            id_ressource: role.id,
            libelle: `Rôle "${nom}" créé`
        });

        res.status(201).json(serialiserRole(role));
    } catch (err) { next(err); }
}

async function update(req, res, next) {
    try {
        const role = await Role.findByPk(req.params.id);
        if (!role) return res.status(404).json({ message: 'Rôle introuvable.' });

        const { nom, abbreviation, permissions } = req.body;
        await role.update({
            nom: nom ?? role.nom,
            abbreviation: abbreviation ?? role.abbreviation,
            permissions: permissions ?? role.permissions
        });

        await consigner({
            user: req.currentUser,
            action: 'modification',
            ressource: 'role',
            id_ressource: role.id,
            libelle: `Rôle "${role.nom}" modifié`
        });

        res.json(serialiserRole(role));
    } catch (err) { next(err); }
}

async function remove(req, res, next) {
    try {
        const role = await Role.findByPk(req.params.id);
        if (!role) return res.status(404).json({ message: 'Rôle introuvable.' });

        if (role.abbreviation === 'ADMIN') {
            return res.status(400).json({ message: 'Impossible de supprimer le rôle Administrateur.' });
        }

        const nbUtilisateurs = await Utilisateur.count({ where: { id_role: role.id } });
        if (nbUtilisateurs > 0) {
            return res.status(400).json({ message: 'Ce rôle est encore utilisé par des utilisateurs.' });
        }

        const nomRole = role.nom;
        await role.destroy();

        await consigner({
            user: req.currentUser,
            action: 'suppression',
            ressource: 'role',
            id_ressource: req.params.id,
            libelle: `Rôle "${nomRole}" supprimé`
        });

        res.json({ message: 'Rôle supprimé.' });
    } catch (err) { next(err); }
}

module.exports = { getAll, getById, create, update, remove };
