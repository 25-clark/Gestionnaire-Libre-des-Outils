const { Notification } = require('../models');

async function getAll(req, res, next) {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const parPage = 20;

        const { rows, count } = await Notification.findAndCountAll({
            where: { id_user: req.currentUser.id },
            order: [['createdAt', 'DESC']],
            limit: parPage,
            offset: (page - 1) * parPage
        });

        res.json({ notifications: rows, page, totalPages: Math.max(Math.ceil(count / parPage), 1), total: count });
    } catch (err) { next(err); }
}

async function nombreNonLues(req, res, next) {
    try {
        const nombre = await Notification.count({ where: { id_user: req.currentUser.id, lu: false }, col: 'id' });
        res.json({ nombre });
    } catch (err) { next(err); }
}

async function marquerLue(req, res, next) {
    try {
        const notification = await Notification.findOne({ where: { id: req.params.id, id_user: req.currentUser.id } });
        if (!notification) return res.status(404).json({ message: 'Notification introuvable.' });

        await notification.update({ lu: true });
        res.json(notification);
    } catch (err) { next(err); }
}

async function marquerToutesLues(req, res, next) {
    try {
        await Notification.update({ lu: true }, { where: { id_user: req.currentUser.id, lu: false } });
        res.json({ message: 'Toutes les notifications ont été marquées comme lues.' });
    } catch (err) { next(err); }
}


async function vider(req, res, next) {
    try {
        await Notification.destroy({ where: { id_user: req.currentUser.id } });
        res.json({ message: 'Toutes les notifications ont été supprimées.' });
    } catch (err) { next(err); }
}

module.exports = { getAll, nombreNonLues, marquerLue, marquerToutesLues, vider };

