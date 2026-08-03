const { Utilisateur, Role, Activite, Outil } = require('../models');

async function getAll(req, res, next) {
    try {
        const where = {};
        // Filtre optionnel par activité, ex: GET /api/utilisateurs?id_activite=3
        if (req.query.id_activite) {
            where.id_activite = req.query.id_activite;
        }

        const utilisateurs = await Utilisateur.findAll({
            where,
            include: [{ model: Role }, { model: Activite }],
            order: [['nom', 'ASC']]
        });
        res.json(utilisateurs);
    } catch (err) { next(err); }
}

async function getById(req, res, next) {
    try {
        const utilisateur = await Utilisateur.findByPk(req.params.id, {
            include: [{ model: Role }, { model: Activite }, { model: Outil }]
        });
        if (!utilisateur) return res.status(404).json({ message: 'Utilisateur introuvable.' });
        res.json(utilisateur);
    } catch (err) { next(err); }
}

async function create(req, res, next) {
    try {
        const { matricule, nom, prenom, id_activite, id_role } = req.body;

        if (!matricule || !nom || !prenom || !id_role) {
            return res.status(400).json({ message: 'Matricule, nom, prénom et rôle sont requis.' });
        }

        const utilisateur = await Utilisateur.create({
            matricule,
            nom,
            prenom,
            id_activite: id_activite || null,
            id_role
        });

        const utilisateurComplet = await Utilisateur.findByPk(utilisateur.id, {
            include: [{ model: Role }, { model: Activite }]
        });

        res.status(201).json(utilisateurComplet);
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'Ce matricule existe déjà.' });
        }
        next(err);
    }
}

// Volontairement PAS de update() : selon la règle métier, en cas d'erreur sur
// un utilisateur (nom/prénom), on le supprime et on le recrée.

async function remove(req, res, next) {
    try {
        const utilisateur = await Utilisateur.findByPk(req.params.id);
        if (!utilisateur) return res.status(404).json({ message: 'Utilisateur introuvable.' });

        await utilisateur.destroy();
        res.json({ message: 'Utilisateur supprimé.' });
    } catch (err) { next(err); }
}

module.exports = { getAll, getById, create, remove };
