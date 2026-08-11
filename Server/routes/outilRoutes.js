const express = require('express');
const router = express.Router();
const outilController = require('../controllers/outilController');
const { requireAuth, checkPermission, isAdmin, niveauAccesActivite, niveauAccesSousActivite } = require('../middlewares/auth');
const { uploadOutilImage } = require('../middlewares/upload');
const { Outil, Activite, SousActivite } = require('../models');

router.use(requireAuth);

// Un outil peut être rattaché à plusieurs activités/sous-activités à la fois
// (many-to-many). Le niveau requis n'a donc pas un seul "id" à vérifier :
// on considère que l'utilisateur a le droit s'il l'a sur AU MOINS un des
// emplacements concernés (comme pour "voir" un outil partagé sur deux
// activités : avoir accès à une seule suffit pour agir dessus).
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

async function aAccesSurEmplacements(user, idsActivites, idsSousActivites, niveau) {
    if (isAdmin(user)) return true;

    for (const idActivite of idsActivites) {
        if (await niveauAccesActivite(user, parseInt(idActivite, 10), niveau)) return true;
    }
    for (const idSousActivite of idsSousActivites) {
        const sousActivite = await SousActivite.findByPk(idSousActivite);
        if (sousActivite && await niveauAccesSousActivite(user, sousActivite, niveau)) return true;
    }
    return false;
}

// À la création : vérifie l'accès "write" sur les emplacements demandés
// dans le corps de la requête (activites / sousActivites envoyés par le
// formulaire). Si aucun emplacement n'est précisé, on laisse passer (le rôle
// via checkPermission a déjà tranché) — le cas se règle au niveau de l'UI qui
// n'envoie que les emplacements accessibles.
async function checkAccesCreationOutil(req, res, next) {
    try {
        const idsActivites = normaliserListe(req.body.activites);
        const idsSousActivites = normaliserListe(req.body.sousActivites);
        if (!idsActivites.length && !idsSousActivites.length) return next();

        if (await aAccesSurEmplacements(req.currentUser, idsActivites, idsSousActivites, 'write')) {
            return next();
        }
        return res.status(403).json({ message: "Vous n'avez pas accès en écriture à l'activité/sous-activité choisie." });
    } catch (err) { next(err); }
}

// Pour activer/désactiver ou supprimer un outil existant : vérifie l'accès
// sur au moins un de ses emplacements actuels, ou que l'utilisateur en est
// le propriétaire (créateur).
function checkAccesOutilExistant(niveau) {
    return async (req, res, next) => {
        try {
            const outil = await Outil.findByPk(req.params.id, {
                include: [{ model: Activite, as: 'activites' }, { model: SousActivite, as: 'sousActivites' }]
            });
            if (!outil) return res.status(404).json({ message: 'Outil introuvable.' });
            if (isAdmin(req.currentUser) || outil.id_user === req.currentUser.id) return next();

            const idsActivites = outil.activites.map(a => a.id);
            const idsSousActivites = outil.sousActivites.map(sa => sa.id);

            if (await aAccesSurEmplacements(req.currentUser, idsActivites, idsSousActivites, niveau)) {
                return next();
            }
            return res.status(403).json({ message: "Vous n'avez pas les droits sur cet outil." });
        } catch (err) { next(err); }
    };
}

router.get('/', checkPermission('outils', 'read'), outilController.getAll);
router.get('/:id', checkPermission('outils', 'read'), outilController.getById);
router.get('/:id/historique-statut', checkPermission('outils', 'read'), checkAccesOutilExistant('read'), outilController.historiqueStatut);
router.post('/', checkPermission('outils', 'create'), uploadOutilImage.single('image'), checkAccesCreationOutil, outilController.create);
router.patch('/:id/toggle-active', checkPermission('outils', 'update'), checkAccesOutilExistant('write'), outilController.toggleActive);
router.post('/:id/verifier-statut', checkPermission('outils', 'update'), checkAccesOutilExistant('write'), outilController.verifierStatut);
router.delete('/:id', checkPermission('outils', 'delete'), checkAccesOutilExistant('delete'), outilController.remove);

module.exports = router;
