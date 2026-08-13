const { Outil, Utilisateur, Activite, SousActivite, OutilHistoriqueStatut } = require('../models');
const { isAdmin, getIdsActivitesAccessibles } = require('../middlewares/auth');
const { getPerimetreAcces } = require('../utils/perimetre');
const { consigner } = require('../utils/journal');
const { verifierUnOutil } = require('../utils/surveillance');

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

        // Périmètre : sans filtre id_activite/id_sous_activite explicite (donc
        // pour un listing global, comme la recherche ou l'export réseau), un
        // non-admin ne doit voir QUE les outils rattachés à une activité/
        // sous-activité qu'il a le droit de voir — sinon la liste "toutes
        // activités confondues" fuitait tout le parc, même hors permission.
        if (!isAdmin(req.currentUser)) {
            const { activiteIds, sousActiviteIds } = await getPerimetreAcces(req.currentUser);
            outils = outils.filter(o =>
                o.activites.some(a => activiteIds.has(a.id)) ||
                o.sousActivites.some(sa => sousActiviteIds.has(sa.id))
            );
        }

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

        // On retire explicitement tous les partages (liens vers des
        // activités/sous-activités) avant de supprimer l'outil : garantit que
        // "si l'outil original est effacé, les partages le sont aussi", et
        // évite une éventuelle erreur de contrainte de clé étrangère si la
        // base ne cascade pas la suppression automatiquement.
        await outil.setActivites([]);
        await outil.setSousActivites([]);
        await outil.destroy();

        await consigner({
            user: req.currentUser,
            action: 'suppression',
            ressource: 'outil',
            id_ressource: req.params.id,
            libelle: `Outil "${nomOutil}" supprimé (et tous ses partages)`
        });

        res.json({ message: 'Outil supprimé.' });
    } catch (err) { next(err); }
}

// ---------- Partage : rattacher un outil déjà existant à une activité ou
// sous-activité SUPPLÉMENTAIRE, sans dupliquer l'outil (c'est le même outil,
// juste visible à plusieurs endroits — via les tables pivot déjà en place). ----------

async function partager(req, res, next) {
    try {
        const outil = await Outil.findByPk(req.params.id);
        if (!outil) return res.status(404).json({ message: 'Outil introuvable.' });

        const { id_activite, id_sous_activite } = req.body;
        if (!id_activite && !id_sous_activite) {
            return res.status(400).json({ message: 'Choisissez une activité ou une sous-activité de destination.' });
        }

        if (id_activite) await outil.addActivite(id_activite);
        if (id_sous_activite) await outil.addSousActivite(id_sous_activite);

        const outilComplet = await Outil.findByPk(outil.id, {
            include: [
                { model: Utilisateur },
                { model: Activite, as: 'activites' },
                { model: SousActivite, as: 'sousActivites' }
            ]
        });

        const cible = id_sous_activite
            ? outilComplet.sousActivites.find(sa => sa.id === parseInt(id_sous_activite, 10))
            : outilComplet.activites.find(a => a.id === parseInt(id_activite, 10));

        await consigner({
            user: req.currentUser,
            action: 'partage',
            ressource: 'outil',
            id_ressource: outil.id,
            libelle: `Outil "${outil.nom}" partagé sur ${id_sous_activite ? 'la sous-activité' : "l'activité"} "${cible ? cible.nom : '?'}"`
        });

        res.status(201).json(outilComplet);
    } catch (err) { next(err); }
}

// Retire un seul emplacement de partage (l'outil lui-même n'est pas
// supprimé, ni ses autres emplacements).
async function retirerPartageActivite(req, res, next) {
    try {
        const outil = await Outil.findByPk(req.params.id);
        if (!outil) return res.status(404).json({ message: 'Outil introuvable.' });

        await outil.removeActivite(req.params.idActivite);

        await consigner({
            user: req.currentUser,
            action: 'partage',
            ressource: 'outil',
            id_ressource: outil.id,
            libelle: `Partage de l'outil "${outil.nom}" retiré d'une activité`
        });

        res.json({ message: 'Partage retiré.' });
    } catch (err) { next(err); }
}

async function retirerPartageSousActivite(req, res, next) {
    try {
        const outil = await Outil.findByPk(req.params.id);
        if (!outil) return res.status(404).json({ message: 'Outil introuvable.' });

        await outil.removeSousActivite(req.params.idSousActivite);

        await consigner({
            user: req.currentUser,
            action: 'partage',
            ressource: 'outil',
            id_ressource: outil.id,
            libelle: `Partage de l'outil "${outil.nom}" retiré d'une sous-activité`
        });

        res.json({ message: 'Partage retiré.' });
    } catch (err) { next(err); }
}

// Déclenche une vérification immédiate du statut réseau (au lieu d'attendre
// le prochain cycle automatique, jusqu'à surveillance_intervalle_minutes).
// Sans objet si l'outil n'a pas d'adresse renseignée.
async function verifierStatut(req, res, next) {
    try {
        const outil = await Outil.findByPk(req.params.id);
        if (!outil) return res.status(404).json({ message: 'Outil introuvable.' });

        if (!outil.adresse) {
            return res.status(400).json({ message: "Cet outil n'a pas d'adresse renseignée : rien à vérifier." });
        }

        await verifierUnOutil(outil);
        await outil.reload();

        res.json(outil);
    } catch (err) { next(err); }
}

// Historique des changements de statut (en ligne/hors ligne), du plus récent
// au plus ancien — alimenté par la surveillance automatique.
async function historiqueStatut(req, res, next) {
    try {
        const outil = await Outil.findByPk(req.params.id);
        if (!outil) return res.status(404).json({ message: 'Outil introuvable.' });

        const historique = await OutilHistoriqueStatut.findAll({
            where: { id_outil: req.params.id },
            order: [['createdAt', 'DESC']],
            limit: 100
        });

        res.json(historique);
    } catch (err) { next(err); }
}

module.exports = { getAll, getById, create, toggleActive, remove, verifierStatut, historiqueStatut, partager, retirerPartageActivite, retirerPartageSousActivite };
