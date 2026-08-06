const { Utilisateur, Role, Activite, Outil } = require('../models');
const { isAdmin, getIdsActivitesAccessibles } = require('../middlewares/auth');

async function getAll(req, res, next) {
    try {
        const where = {};

        // Filtre optionnel par activité, ex: GET /api/utilisateurs?id_activite=3
        if (req.query.id_activite) {
            if (!isAdmin(req.currentUser)) {
                const idsAccessibles = await getIdsActivitesAccessibles(req.currentUser);
                if (!idsAccessibles.includes(parseInt(req.query.id_activite, 10))) {
                    return res.status(403).json({ message: "Vous n'avez pas accès à cette activité." });
                }
            }
            where.id_activite = req.query.id_activite;
        } else if (!isAdmin(req.currentUser)) {
            // Pas de filtre demandé explicitement : un utilisateur non admin ne
            // doit voir que les utilisateurs des activités auxquelles il a accès.
            const idsAccessibles = await getIdsActivitesAccessibles(req.currentUser);
            where.id_activite = idsAccessibles;
        }

        let utilisateurs = await Utilisateur.findAll({
            where,
            include: [{ model: Role }, { model: Activite }],
            order: [['nom', 'ASC']]
        });

        // Recherche libre par nom, prénom ou matricule, ex: ?q=dupont
        if (req.query.q) {
            const terme = req.query.q.trim().toLowerCase();
            utilisateurs = utilisateurs.filter(u =>
                u.nom.toLowerCase().includes(terme) ||
                u.prenom.toLowerCase().includes(terme) ||
                u.matricule.toLowerCase().includes(terme)
            );
        }

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
