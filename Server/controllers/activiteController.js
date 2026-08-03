const { Activite, SousActivite, Utilisateur, Outil } = require('../models');

// Construit récursivement l'arbre des sous-activités d'une activité.
function construireArbre(sousActivites, idParent = null) {
    return sousActivites
        .filter(sa => sa.id_parent === idParent)
        .map(sa => ({
            id: sa.id,
            nom: sa.nom,
            id_activite: sa.id_activite,
            id_parent: sa.id_parent,
            enfants: construireArbre(sousActivites, sa.id)
        }));
}

async function getAll(req, res, next) {
    try {
        const activites = await Activite.findAll({ order: [['nom', 'ASC']] });
        res.json(activites);
    } catch (err) { next(err); }
}

// Renvoie toutes les activités avec leur arborescence de sous-activités
// (utilisé pour l'affichage "dossiers" côté admin).
async function getArborescence(req, res, next) {
    try {
        const activites = await Activite.findAll({ order: [['nom', 'ASC']] });
        const sousActivites = await SousActivite.findAll({ order: [['nom', 'ASC']] });

        const resultat = activites.map(activite => ({
            id: activite.id,
            nom: activite.nom,
            abbreviation: activite.abbreviation,
            logo: activite.logo,
            id_user: activite.id_user,
            sousActivites: construireArbre(
                sousActivites.filter(sa => sa.id_activite === activite.id)
            )
        }));

        res.json(resultat);
    } catch (err) { next(err); }
}

async function getById(req, res, next) {
    try {
        const activite = await Activite.findByPk(req.params.id, {
            include: [{ model: SousActivite }, { model: Utilisateur }]
        });
        if (!activite) return res.status(404).json({ message: 'Activité introuvable.' });
        res.json(activite);
    } catch (err) { next(err); }
}

async function create(req, res, next) {
    try {
        const { nom, abbreviation } = req.body;
        if (!nom || !abbreviation) {
            return res.status(400).json({ message: 'Le nom et l\'abréviation sont requis.' });
        }

        // logo peut venir d'un vrai upload multipart (req.file) ou d'un chemin
        // déjà généré par l'Interface (req.body.logo), qui héberge elle-même l'image.
        const logo = req.file ? `/uploads/logos/${req.file.filename}` : (req.body.logo || null);

        const activite = await Activite.create({
            nom,
            abbreviation,
            logo,
            id_user: req.currentUser.id
        });

        res.status(201).json(activite);
    } catch (err) { next(err); }
}

// Seule l'activité (et ses sous-activités) peuvent être modifiées.
async function update(req, res, next) {
    try {
        const activite = await Activite.findByPk(req.params.id);
        if (!activite) return res.status(404).json({ message: 'Activité introuvable.' });

        const { nom, abbreviation } = req.body;
        const logo = req.file ? `/uploads/logos/${req.file.filename}` : (req.body.logo ?? activite.logo);

        await activite.update({
            nom: nom ?? activite.nom,
            abbreviation: abbreviation ?? activite.abbreviation,
            logo
        });

        res.json(activite);
    } catch (err) { next(err); }
}

async function remove(req, res, next) {
    try {
        const activite = await Activite.findByPk(req.params.id);
        if (!activite) return res.status(404).json({ message: 'Activité introuvable.' });

        const nbOutils = await Outil.count({
            include: [{ model: Activite, as: 'activites', where: { id: activite.id } }]
        });
        const nbUtilisateurs = await Utilisateur.count({ where: { id_activite: activite.id } });
        const nbSousActivites = await SousActivite.count({ where: { id_activite: activite.id } });

        if (nbOutils > 0 || nbUtilisateurs > 0 || nbSousActivites > 0) {
            return res.status(400).json({
                message: 'Impossible de supprimer une activité qui contient encore des utilisateurs, outils ou sous-activités.'
            });
        }

        await activite.destroy();
        res.json({ message: 'Activité supprimée.' });
    } catch (err) { next(err); }
}

module.exports = { getAll, getArborescence, getById, create, update, remove };
