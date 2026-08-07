const { Outil, Utilisateur, Activite, SousActivite } = require('../models');
const { isAdmin, getIdsActivitesAccessibles } = require('../middlewares/auth');
const { consigner } = require('../utils/journal');

async function getAll(req, res, next) {
    try {
        // Un utilisateur non admin ne doit pas pouvoir lister les outils
        // d'une activité à laquelle il n'a pas accès, même en connaissant son id.
        if (!isAdmin(req.currentUser) && req.query.id_activite) {
            const idsAccessibles = await getIdsActivitesAccessibles(req.currentUser);
            if (!idsAccessibles.includes(parseInt(req.query.id_activite, 10))) {
                return res.status(403).json({ message: "Vous n'avez pas accès à cette activité." });
            }
        }

        const include = [
            { model: Utilisateur },
            { model: Activite, as: 'activites' },
            { model: SousActivite, as: 'sousActivites' }
        ];

        let outils = await Outil.findAll({ include, order: [['nom', 'ASC']] });

        // Filtres optionnels : ?id_activite=1 ou ?id_sous_activite=2 ou ?id_user=3
        if (req.query.id_activite) {
            outils = outils.filter(o => o.activites.some(a => a.id === parseInt(req.query.id_activite, 10)));
        }
        if (req.query.id_sous_activite) {
            outils = outils.filter(o => o.sousActivites.some(sa => sa.id === parseInt(req.query.id_sous_activite, 10)));
        }
        if (req.query.id_user) {
            outils = outils.filter(o => o.id_user === parseInt(req.query.id_user, 10));
        }
        if (req.query.q) {
            const terme = req.query.q.trim().toLowerCase();
            outils = outils.filter(o => o.nom.toLowerCase().includes(terme));
        }

        res.json(outils);
    } catch (err) { next(err); }
}

async function getById(req, res, next) {
    try {
        const outil = await Outil.findByPk(req.params.id, {
            include: [
                { model: Utilisateur },
                { model: Activite, as: 'activites' },
                { model: SousActivite, as: 'sousActivites' }
            ]
        });
        if (!outil) return res.status(404).json({ message: 'Outil introuvable.' });
        res.json(outil);
    } catch (err) { next(err); }
}

async function create(req, res, next) {
    try {
        const { nom, lien, adresse, activites, sousActivites } = req.body;

        if (!nom) {
            return res.status(400).json({ message: 'Le nom est requis.' });
        }

        // Le propriétaire d'un outil est toujours celui qui le crée — pas de
        // choix possible, y compris pour un admin, pour éviter toute confusion
        // sur "qui a créé quoi".
        const id_user = req.currentUser.id;

        const image = req.file ? `/uploads/outils/${req.file.filename}` : (req.body.image || null);

        const outil = await Outil.create({ nom, lien: lien || null, adresse: adresse || null, image, id_user });

        // activites / sousActivites : tableau d'ids (JSON stringifié si envoyé en multipart)
        const idsActivites = normaliserListe(activites);
        const idsSousActivites = normaliserListe(sousActivites);

        if (idsActivites.length) await outil.setActivites(idsActivites);
        if (idsSousActivites.length) await outil.setSousActivites(idsSousActivites);

        const outilComplet = await Outil.findByPk(outil.id, {
            include: [
                { model: Utilisateur },
                { model: Activite, as: 'activites' },
                { model: SousActivite, as: 'sousActivites' }
            ]
        });

        await consigner({
            user: req.currentUser,
            action: 'creation',
            ressource: 'outil',
            id_ressource: outil.id,
            libelle: `Outil "${nom}" créé`
        });

        res.status(201).json(outilComplet);
    } catch (err) { next(err); }
}

function normaliserListe(valeur) {
    if (!valeur) return [];
    if (Array.isArray(valeur)) return valeur;
    try {
        const parsed = JSON.parse(valeur);
        return Array.isArray(parsed) ? parsed : [valeur];
    } catch {
        return [valeur];
    }
}

// Seule action de mise à jour autorisée sur un outil : activer/désactiver.
async function toggleActive(req, res, next) {
    try {
        const outil = await Outil.findByPk(req.params.id);
        if (!outil) return res.status(404).json({ message: 'Outil introuvable.' });

        await outil.update({ active: !outil.active });

        await consigner({
            user: req.currentUser,
            action: 'modification',
            ressource: 'outil',
            id_ressource: outil.id,
            libelle: `Outil "${outil.nom}" ${outil.active ? 'réactivé' : 'archivé'}`
        });

        res.json(outil);
    } catch (err) { next(err); }
}

async function remove(req, res, next) {
    try {
        const outil = await Outil.findByPk(req.params.id);
        if (!outil) return res.status(404).json({ message: 'Outil introuvable.' });

        const nomOutil = outil.nom;
        await outil.destroy();

        await consigner({
            user: req.currentUser,
            action: 'suppression',
            ressource: 'outil',
            id_ressource: req.params.id,
            libelle: `Outil "${nomOutil}" supprimé`
        });

        res.json({ message: 'Outil supprimé.' });
    } catch (err) { next(err); }
}

module.exports = { getAll, getById, create, toggleActive, remove };
