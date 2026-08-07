const { Journal } = require('../models');
const { Op } = require('sequelize');

// Liste paginée, la plus récente en premier. Filtres optionnels : ressource,
// action, q (recherche dans le libellé/matricule).
async function getAll(req, res, next) {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const parPage = 50;
        const where = {};

        if (req.query.ressource) where.ressource = req.query.ressource;
        if (req.query.action) where.action = req.query.action;
        if (req.query.q) {
            const terme = `%${req.query.q.trim()}%`;
            where[Op.or] = [
                { libelle: { [Op.like]: terme } },
                { matricule_user: { [Op.like]: terme } },
                { nom_user: { [Op.like]: terme } }
            ];
        }

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

module.exports = { getAll };
