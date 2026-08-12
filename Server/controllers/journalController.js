const { Journal } = require('../models');
const { Op } = require('sequelize');

function construireWhere(query) {
    const where = {};
    if (query.ressource) where.ressource = query.ressource;
    if (query.action) where.action = query.action;
    if (query.q) {
        const terme = `%${query.q.trim()}%`;
        where[Op.or] = [
            { libelle: { [Op.like]: terme } },
            { matricule_user: { [Op.like]: terme } },
            { nom_user: { [Op.like]: terme } }
        ];
    }
    return where;
}

// Liste paginée, la plus récente en premier. Filtres optionnels : ressource,
// action, q (recherche dans le libellé/matricule).
async function getAll(req, res, next) {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const parPage = 50;
        const where = construireWhere(req.query);

        const { rows, count } = await Journal.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: parPage,
            offset: (page - 1) * parPage
        });

        res.json({
            evenements: rows,
            page,
            totalPages: Math.max(Math.ceil(count / parPage), 1),
            total: count
        });
    } catch (err) { next(err); }
}

// Pour l'export CSV/PDF : mêmes filtres, mais TOUTES les lignes (plafonnées
// à 5000 par sécurité, largement suffisant pour un export ponctuel).
async function getTout(req, res, next) {
    try {
        const where = construireWhere(req.query);
        const evenements = await Journal.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: 5000
        });
        res.json({ evenements });
    } catch (err) { next(err); }
}

module.exports = { getAll, getTout };
