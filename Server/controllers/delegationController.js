const { Op } = require('sequelize');
const { Delegation, Utilisateur, Role } = require('../models');
const { notifier } = require('../utils/notification');

function perimetreNormalise(p) {
    if (!p || typeof p !== 'object') return { tickets: true, acces: false };
    return {
        tickets: p.tickets !== false && p.tickets !== '0',
        acces: !!p.acces && p.acces !== '0'
    };
}

async function delegationsActivesPour(userId) {
    const now = new Date();
    return Delegation.findAll({
        where: {
            id_receveur: userId,
            active: true,
            date_debut: { [Op.lte]: now },
            date_fin: { [Op.gte]: now }
        },
        include: [{ model: Utilisateur, as: 'Donneur', attributes: ['id', 'nom', 'prenom', 'matricule'] }]
    });
}

async function lister(req, res, next) {
    try {
        const uid = req.currentUser.id;
        const [donnees, recues] = await Promise.all([
            Delegation.findAll({
                where: { id_donneur: uid },
                include: [{ model: Utilisateur, as: 'Receveur', attributes: ['id', 'nom', 'prenom', 'matricule'] }],
                order: [['date_fin', 'DESC']],
                limit: 50
            }),
            Delegation.findAll({
                where: { id_receveur: uid },
                include: [{ model: Utilisateur, as: 'Donneur', attributes: ['id', 'nom', 'prenom', 'matricule'] }],
                order: [['date_fin', 'DESC']],
                limit: 50
            })
        ]);
        res.json({ donnees, recues });
    } catch (err) { next(err); }
}

async function creer(req, res, next) {
    try {
        const id_receveur = parseInt(req.body.id_receveur, 10);
        if (!id_receveur || id_receveur === req.currentUser.id) {
            return res.status(400).json({ message: 'Destinataire invalide.' });
        }
        const receveur = await Utilisateur.findByPk(id_receveur);
        if (!receveur) return res.status(404).json({ message: 'Utilisateur introuvable.' });

        const date_debut = req.body.date_debut ? new Date(req.body.date_debut) : new Date();
        const date_fin = req.body.date_fin ? new Date(req.body.date_fin) : null;
        if (!date_fin || isNaN(date_fin.getTime()) || date_fin <= date_debut) {
            return res.status(400).json({ message: 'La date de fin doit être postérieure au début.' });
        }
        const maxJours = 90;
        if ((date_fin - date_debut) / 86400000 > maxJours) {
            return res.status(400).json({ message: `Délégation limitée à ${maxJours} jours.` });
        }

        const del = await Delegation.create({
            id_donneur: req.currentUser.id,
            id_receveur,
            date_debut,
            date_fin,
            perimetre: perimetreNormalise(req.body.perimetre),
            motif: (req.body.motif || '').slice(0, 500) || null,
            active: true
        });

        await notifier({
            id_user: id_receveur,
            message: `${req.currentUser.prenom} ${req.currentUser.nom} vous a délégué des droits jusqu'au ${date_fin.toLocaleDateString('fr-FR')}.`,
            type: 'delegation'
        }).catch(() => {});

        res.status(201).json({ message: 'Délégation créée.', delegation: del });
    } catch (err) { next(err); }
}

async function revoquer(req, res, next) {
    try {
        const del = await Delegation.findByPk(req.params.id);
        if (!del) return res.status(404).json({ message: 'Délégation introuvable.' });
        if (del.id_donneur !== req.currentUser.id && del.id_receveur !== req.currentUser.id) {
            return res.status(403).json({ message: 'Accès refusé.' });
        }
        await del.update({ active: false });
        res.json({ message: 'Délégation désactivée.' });
    } catch (err) { next(err); }
}

module.exports = { lister, creer, revoquer, delegationsActivesPour, perimetreNormalise };
