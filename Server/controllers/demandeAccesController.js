const { DemandeAcces, Utilisateur, Activite, SousActivite, Outil, UtilisateurSousActivite, UtilisateurActivite } = require('../models');
const { isAdmin } = require('../middlewares/auth');
const { notifier } = require('../utils/notification');
const { consigner } = require('../utils/journal');

async function lister(req, res, next) {
    try {
        const where = {};
        const { userHasPermission } = require('../middlewares/auth');
        const peutValider = isAdmin(req.currentUser) || userHasPermission(req.currentUser, 'demandes_acces', 'update');
        if (req.query.miennes === '1' || !peutValider) {
            where.id_demandeur = req.currentUser.id;
        }
        if (req.query.statut) where.statut = req.query.statut;

        const demandes = await DemandeAcces.findAll({
            where,
            include: [
                { model: Utilisateur, as: 'Demandeur', attributes: ['id', 'nom', 'prenom', 'matricule'] },
                { model: Utilisateur, as: 'Valideur', attributes: ['id', 'nom', 'prenom', 'matricule'] }
            ],
            order: [['created_at', 'DESC']],
            limit: 100
        });
        res.json({ demandes });
    } catch (err) { next(err); }
}

async function creer(req, res, next) {
    try {
        const type_cible = req.body.type_cible;
        const id_cible = parseInt(req.body.id_cible, 10);
        if (!['activite', 'sous_activite', 'outil'].includes(type_cible) || !id_cible) {
            return res.status(400).json({ message: 'Cible invalide.' });
        }
        // Vérifier existence
        let ok = false;
        if (type_cible === 'activite') ok = !!(await Activite.findByPk(id_cible));
        if (type_cible === 'sous_activite') ok = !!(await SousActivite.findByPk(id_cible));
        if (type_cible === 'outil') ok = !!(await Outil.findByPk(id_cible));
        if (!ok) return res.status(404).json({ message: 'Ressource introuvable.' });

        const existante = await DemandeAcces.findOne({
            where: {
                id_demandeur: req.currentUser.id,
                type_cible,
                id_cible,
                statut: 'en_attente'
            }
        });
        if (existante) {
            return res.status(400).json({ message: 'Une demande est déjà en attente pour cette ressource.' });
        }

        const dem = await DemandeAcces.create({
            id_demandeur: req.currentUser.id,
            type_cible,
            id_cible,
            message: (req.body.message || '').slice(0, 2000) || null,
            statut: 'en_attente'
        });

        // Notifier admins
        const admins = await Utilisateur.findAll({
            include: [{ model: require('../models').Role, where: { abbreviation: 'ADMIN' }, required: true }]
        }).catch(() => []);
        for (const a of (admins || [])) {
            if (a.id === req.currentUser.id) continue;
            await notifier({
                id_user: a.id,
                message: `Demande d'accès de ${req.currentUser.prenom} ${req.currentUser.nom} (${type_cible} #${id_cible}).`,
                type: 'acces'
            }).catch(() => {});
        }

        res.status(201).json({ message: 'Demande enregistrée.', demande: dem });
    } catch (err) { next(err); }
}

async function traiter(req, res, next) {
    try {
        const { userHasPermission } = require('../middlewares/auth');
        if (!isAdmin(req.currentUser) && !userHasPermission(req.currentUser, 'demandes_acces', 'update')) {
            return res.status(403).json({ message: 'Permission insuffisante pour valider les demandes.' });
        }
        const dem = await DemandeAcces.findByPk(req.params.id);
        if (!dem || dem.statut !== 'en_attente') {
            return res.status(404).json({ message: 'Demande introuvable ou déjà traitée.' });
        }
        const decision = req.body.decision; // approuvee | refusee
        if (!['approuvee', 'refusee'].includes(decision)) {
            return res.status(400).json({ message: 'Décision invalide.' });
        }

        if (decision === 'approuvee') {
            if (dem.type_cible === 'sous_activite') {
                const [lien] = await UtilisateurSousActivite.findOrCreate({
                    where: { id_user: dem.id_demandeur, id_sous_activite: dem.id_cible },
                    defaults: { permissions: { read: true, write: false, delete: false } }
                });
                if (lien && !lien.permissions) {
                    await lien.update({ permissions: { read: true, write: false, delete: false } });
                }
            } else if (dem.type_cible === 'activite') {
                await UtilisateurActivite.findOrCreate({
                    where: { id_user: dem.id_demandeur, id_activite: dem.id_cible },
                    defaults: {}
                }).catch(() => {});
                // Affecter activité principale si vide
                const u = await Utilisateur.findByPk(dem.id_demandeur);
                if (u && !u.id_activite) await u.update({ id_activite: dem.id_cible });
            }
            // outil : signaler seulement (accès via activité)
        }

        await dem.update({
            statut: decision,
            id_valideur: req.currentUser.id,
            reponse: (req.body.reponse || '').slice(0, 2000) || null,
            traite_le: new Date()
        });

        await notifier({
            id_user: dem.id_demandeur,
            message: decision === 'approuvee'
                ? 'Votre demande d\'accès a été approuvée.'
                : 'Votre demande d\'accès a été refusée.',
            type: 'acces'
        }).catch(() => {});

        await consigner({
            user: req.currentUser,
            action: decision === 'approuvee' ? 'approbation' : 'refus',
            ressource: 'demande_acces',
            id_ressource: dem.id,
            libelle: `Demande #${dem.id} ${decision}`
        }).catch(() => {});

        res.json({ message: decision === 'approuvee' ? 'Demande approuvée.' : 'Demande refusée.', demande: dem });
    } catch (err) { next(err); }
}

async function annuler(req, res, next) {
    try {
        const dem = await DemandeAcces.findByPk(req.params.id);
        if (!dem || dem.id_demandeur !== req.currentUser.id) {
            return res.status(404).json({ message: 'Demande introuvable.' });
        }
        if (dem.statut !== 'en_attente') {
            return res.status(400).json({ message: 'Seule une demande en attente peut être annulée.' });
        }
        await dem.update({ statut: 'annulee', traite_le: new Date() });
        res.json({ message: 'Demande annulée.' });
    } catch (err) { next(err); }
}

module.exports = { lister, creer, traiter, annuler };
