const { Op } = require('sequelize');
const { Activite, SousActivite, Outil, Utilisateur, Role, Journal, sequelize } = require('../models');

// Statistiques globales, réservées à l'administrateur (voir statistiqueRoutes.js) :
// vue d'ensemble sur l'ensemble du parc, pas seulement le périmètre d'un
// utilisateur donné. Pour un utilisateur non-admin, ces chiffres globaux
// n'auraient de toute façon pas grand sens (il ne voit qu'une partie du parc).
async function obtenir(req, res, next) {
    try {
        const [
            nbActivites,
            nbSousActivites,
            nbUtilisateurs,
            nbOutilsActifs,
            nbOutilsArchives,
            nbOutilsEnLigne,
            nbOutilsHorsLigne,
            nbOutilsSurveilles
        ] = await Promise.all([
            Activite.count(),
            SousActivite.count(),
            Utilisateur.count(),
            Outil.count({ where: { active: true } }),
            Outil.count({ where: { active: false } }),
            Outil.count({ where: { dernier_statut: 'en_ligne' } }),
            Outil.count({ where: { dernier_statut: 'hors_ligne' } }),
            Outil.count({ where: { adresse: { [Op.ne]: null } } })
        ]);

        const repartitionRolesBrute = await Utilisateur.findAll({
            attributes: [
                'id_role',
                [sequelize.fn('COUNT', sequelize.col('Utilisateur.id')), 'total']
            ],
            include: [{ model: Role, attributes: ['nom', 'abbreviation'] }],
            group: ['id_role', 'Role.id', 'Role.nom', 'Role.abbreviation'],
            raw: true
        });

        const repartitionRoles = repartitionRolesBrute.map(ligne => ({
            nom: ligne['Role.nom'],
            abbreviation: ligne['Role.abbreviation'],
            total: parseInt(ligne.total, 10)
        }));

        const activiteRecente = await Journal.findAll({
            order: [['createdAt', 'DESC']],
            limit: 12
        });

        res.json({
            nbActivites,
            nbSousActivites,
            nbUtilisateurs,
            nbOutilsActifs,
            nbOutilsArchives,
            nbOutilsEnLigne,
            nbOutilsHorsLigne,
            nbOutilsSurveilles,
            repartitionRoles,
            activiteRecente
        });
    } catch (err) { next(err); }
}

module.exports = { obtenir };
