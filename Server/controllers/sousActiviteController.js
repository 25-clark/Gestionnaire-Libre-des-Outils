const { SousActivite, Activite, Utilisateur, Outil } = require('../models');
const { isAdmin, getIdsActivitesAccessibles } = require('../middlewares/auth');
const { consigner } = require('../utils/journal');

async function getAll(req, res, next) {
    try {
        const where = {};
        if (req.query.id_activite) where.id_activite = req.query.id_activite;
        if (req.query.id_parent) where.id_parent = req.query.id_parent;

        // Un utilisateur non admin ne doit voir que les sous-activités des
        // activités auxquelles il a accès (cf. dashboard scoping).
        if (!isAdmin(req.currentUser)) {
            const idsAccessibles = await getIdsActivitesAccessibles(req.currentUser);

            if (where.id_activite) {
                if (!idsAccessibles.includes(parseInt(where.id_activite, 10))) {
                    return res.status(403).json({ message: "Vous n'avez pas accès à cette activité." });
                }
            } else if (where.id_parent) {
                const parent = await SousActivite.findByPk(where.id_parent);
                if (!parent || !idsAccessibles.includes(parent.id_activite)) {
                    return res.status(403).json({ message: "Vous n'avez pas accès à cette sous-activité." });
                }
            } else {
                // Aucun filtre demandé explicitement : restreindre directement
                // à l'ensemble des activités accessibles.
                where.id_activite = idsAccessibles;
            }
        }

        let sousActivites = await SousActivite.findAll({ where, order: [['nom', 'ASC']] });

        // Recherche libre par nom, ex: ?q=cablage
        if (req.query.q) {
            const terme = req.query.q.trim().toLowerCase();
            sousActivites = sousActivites.filter(sa => sa.nom.toLowerCase().includes(terme));
        }

        res.json(sousActivites);
    } catch (err) { next(err); }
}

async function getById(req, res, next) {
    try {
        const sousActivite = await SousActivite.findByPk(req.params.id, {
            include: [
                { model: Activite },
                { model: SousActivite, as: 'enfants' },
                { model: SousActivite, as: 'parent' }
            ]
        });
        if (!sousActivite) return res.status(404).json({ message: 'Sous-activité introuvable.' });
        res.json(sousActivite);
    } catch (err) { next(err); }
}

async function create(req, res, next) {
    try {
        const { nom, id_activite, id_parent } = req.body;

        if (!nom || !id_activite) {
            return res.status(400).json({ message: 'Le nom et l\'activité parente sont requis.' });
        }

        // Si un id_parent est fourni, il doit appartenir à la même activité.
        if (id_parent) {
            const parent = await SousActivite.findByPk(id_parent);
            if (!parent || parent.id_activite !== parseInt(id_activite, 10)) {
                return res.status(400).json({ message: 'La sous-activité parente ne correspond pas à cette activité.' });
            }
        }

        const sousActivite = await SousActivite.create({
            nom,
            id_activite,
            id_parent: id_parent || null
        });

        await consigner({
            user: req.currentUser,
            action: 'creation',
            ressource: 'sous_activite',
            id_ressource: sousActivite.id,
            libelle: `Sous-activité "${nom}" créée`
        });

        res.status(201).json(sousActivite);
    } catch (err) { next(err); }
}

async function update(req, res, next) {
    try {
        const sousActivite = await SousActivite.findByPk(req.params.id);
        if (!sousActivite) return res.status(404).json({ message: 'Sous-activité introuvable.' });

        const { nom, id_parent } = req.body;

        if (id_parent && parseInt(id_parent, 10) === sousActivite.id) {
            return res.status(400).json({ message: 'Une sous-activité ne peut pas être son propre parent.' });
        }

        await sousActivite.update({
            nom: nom ?? sousActivite.nom,
            id_parent: id_parent !== undefined ? id_parent : sousActivite.id_parent
        });

        await consigner({
            user: req.currentUser,
            action: 'modification',
            ressource: 'sous_activite',
            id_ressource: sousActivite.id,
            libelle: `Sous-activité "${sousActivite.nom}" modifiée`
        });

        res.json(sousActivite);
    } catch (err) { next(err); }
}

async function remove(req, res, next) {
    try {
        const sousActivite = await SousActivite.findByPk(req.params.id);
        if (!sousActivite) return res.status(404).json({ message: 'Sous-activité introuvable.' });

        const nbEnfants = await SousActivite.count({ where: { id_parent: sousActivite.id } });
        if (nbEnfants > 0) {
            return res.status(400).json({ message: 'Impossible de supprimer une sous-activité qui contient encore des sous-activités.' });
        }

        const nomSousActivite = sousActivite.nom;
        await sousActivite.destroy();

        await consigner({
            user: req.currentUser,
            action: 'suppression',
            ressource: 'sous_activite',
            id_ressource: req.params.id,
            libelle: `Sous-activité "${nomSousActivite}" supprimée`
        });

        res.json({ message: 'Sous-activité supprimée.' });
    } catch (err) { next(err); }
}

// Copie une sous-activité ET tous ses descendants vers une autre
// destination (activité, ou sous-activité comme nouveau parent). Contrairement
// au partage d'outil, il s'agit d'une VRAIE copie (nouveaux id, indépendante
// ensuite) : une sous-activité n'a qu'un seul parent possible dans l'arbre,
// donc pas de partage "en direct" possible comme pour les outils.
async function copier(req, res, next) {
    try {
        const source = await SousActivite.findByPk(req.params.id);
        if (!source) return res.status(404).json({ message: 'Sous-activité introuvable.' });

        const { id_activite_destination, id_parent_destination } = req.body;
        if (!id_activite_destination) {
            return res.status(400).json({ message: 'Choisissez une activité de destination.' });
        }

        if (id_parent_destination) {
            const parentDest = await SousActivite.findByPk(id_parent_destination);
            if (!parentDest || parentDest.id_activite !== parseInt(id_activite_destination, 10)) {
                return res.status(400).json({ message: 'La sous-activité parente ne correspond pas à cette activité.' });
            }
        }

        async function copierRecursif(sousActiviteSource, idParentCopie) {
            const copie = await SousActivite.create({
                nom: sousActiviteSource.nom,
                id_activite: id_activite_destination,
                id_parent: idParentCopie
            });

            const enfants = await SousActivite.findAll({ where: { id_parent: sousActiviteSource.id } });
            for (const enfant of enfants) {
                await copierRecursif(enfant, copie.id);
            }

            return copie;
        }

        const racineCopiee = await copierRecursif(source, id_parent_destination || null);

        await consigner({
            user: req.currentUser,
            action: 'partage',
            ressource: 'sous_activite',
            id_ressource: racineCopiee.id,
            libelle: `Sous-activité "${source.nom}" copiée avec ses descendants (nouvelle copie indépendante, id #${racineCopiee.id})`
        });

        res.status(201).json(racineCopiee);
    } catch (err) { next(err); }
}

module.exports = { getAll, getById, create, update, remove, copier };
