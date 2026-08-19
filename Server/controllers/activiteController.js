const { Activite, SousActivite, Utilisateur, Outil } = require('../models');
const { getIdsActivitesAccessibles } = require('../middlewares/auth');
const { consigner } = require('../utils/journal');
const { reglagesEffectifs, normaliserPourSauvegarde } = require('../utils/reglagesEffectifs');
const { hacher, verifier } = require('../utils/motDePasse');

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

// Ne renvoie que les activités auxquelles l'utilisateur courant a accès
// (son activité principale + celles accordées en accès particulier).
// Un admin voit tout. Un utilisateur non rattaché ne voit rien par défaut.
async function getAll(req, res, next) {
    try {
        const idsAccessibles = await getIdsActivitesAccessibles(req.currentUser);
        const where = idsAccessibles ? { id: idsAccessibles } : {};

        let activites = await Activite.findAll({ where, order: [['nom', 'ASC']] });

        // Recherche libre par nom, ex: ?q=maintenance
        if (req.query.q) {
            const terme = req.query.q.trim().toLowerCase();
            activites = activites.filter(a => a.nom.toLowerCase().includes(terme));
        }

        res.json(activites);
    } catch (err) { next(err); }
}

// Renvoie les activités accessibles avec leur arborescence de sous-activités
// (utilisé pour l'affichage "dossiers" du tableau de bord).
async function getArborescence(req, res, next) {
    try {
        const idsAccessibles = await getIdsActivitesAccessibles(req.currentUser);
        const where = idsAccessibles ? { id: idsAccessibles } : {};

        const activites = await Activite.findAll({ where, order: [['nom', 'ASC']] });
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
        const json = activite.toJSON();
        let reglagesLocaux = json.reglages || {};
        if (typeof reglagesLocaux === 'string') {
            try { reglagesLocaux = JSON.parse(reglagesLocaux); } catch { reglagesLocaux = {}; }
        }
        if (!reglagesLocaux || typeof reglagesLocaux !== 'object') reglagesLocaux = {};
        json.reglages = reglagesLocaux;

        const reg = await reglagesEffectifs(reglagesLocaux, null);
        json.reglages_effectifs = reg.effectifs;
        json.reglages_globaux = reg.global;
        json.acces_protege = reglagesLocaux.acces_protege === true
            || reglagesLocaux.acces_protege === 'true'
            || reglagesLocaux.acces_protege === 1
            || reglagesLocaux.acces_protege === '1';
        json.acces_indice = reglagesLocaux.acces_indice || null;
        // Ne jamais exposer le hash
        if (json.reglages && json.reglages.acces_hash) delete json.reglages.acces_hash;
        res.json(json);
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

        await consigner({
            user: req.currentUser,
            action: 'creation',
            ressource: 'activite',
            id_ressource: activite.id,
            libelle: `Activité "${nom}" créée`
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

        const data = {
            nom: nom ?? activite.nom,
            abbreviation: abbreviation ?? activite.abbreviation,
            logo
        };
        if (req.body.reglages !== undefined) {
            data.reglages = await normaliserPourSauvegarde(
                typeof req.body.reglages === 'string' ? JSON.parse(req.body.reglages) : req.body.reglages
            );
        }
        await activite.update(data);

        await consigner({
            user: req.currentUser,
            action: 'modification',
            ressource: 'activite',
            id_ressource: activite.id,
            libelle: `Activité "${activite.nom}" modifiée`
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

        const nomActivite = activite.nom;
        await activite.destroy();

        await consigner({
            user: req.currentUser,
            action: 'suppression',
            ressource: 'activite',
            id_ressource: req.params.id,
            libelle: `Activité "${nomActivite}" supprimée`
        });

        res.json({ message: 'Activité supprimée.' });
    } catch (err) { next(err); }
}


async function updateReglages(req, res, next) {
    try {
        const activite = await Activite.findByPk(req.params.id);
        if (!activite) return res.status(404).json({ message: 'Activité introuvable.' });
        const body = req.body.reglages || req.body || {};
        const reglages = await normaliserPourSauvegarde(body);

        // Sécurité d'accès à l'activité (clé / mot de passe)
        let existants = activite.reglages || {};
        if (typeof existants === 'string') {
            try { existants = JSON.parse(existants); } catch { existants = {}; }
        }
        const protege = body.acces_protege === true || body.acces_protege === 'true' || body.acces_protege === 'on' || body.acces_protege === '1';
        reglages.acces_protege = protege;
        if (body.acces_indice !== undefined) {
            reglages.acces_indice = String(body.acces_indice || '').trim() || null;
        } else if (existants.acces_indice) {
            reglages.acces_indice = existants.acces_indice;
        }
        const nouvelleCle = (body.acces_cle || body.acces_mot_de_passe || '').trim();
        if (protege) {
            if (nouvelleCle) {
                reglages.acces_hash = hacher(nouvelleCle);
            } else if (existants.acces_hash) {
                reglages.acces_hash = existants.acces_hash; // conserver
            } else {
                return res.status(400).json({ message: 'Veuillez définir une clé d\'accès pour protéger cette activité.' });
            }
        } else {
            delete reglages.acces_hash;
            delete reglages.acces_indice;
            reglages.acces_protege = false;
        }

        // Forcer la détection du changement JSON (Sequelize ne voit pas toujours les mutations d'objet)
        activite.set('reglages', reglages);
        activite.changed('reglages', true);
        await activite.save();
        await consigner({
            user: req.currentUser,
            action: 'modification',
            ressource: 'activite',
            id_ressource: activite.id,
            libelle: `Réglages locaux de l'activité "${activite.nom}" modifiés`
        });
        const json = activite.toJSON();
        json.reglages = { ...reglages };
        delete json.reglages.acces_hash;
        const reg = await reglagesEffectifs(reglages, null);
        json.reglages_effectifs = reg.effectifs;
        json.reglages_globaux = reg.global;
        json.acces_protege = !!reglages.acces_protege;
        json.acces_indice = reglages.acces_indice || null;
        res.json(json);
    } catch (err) { next(err); }
}

/** Vérifie la clé d'accès d'une activité protégée. */
async function verifierAcces(req, res, next) {
    try {
        const activite = await Activite.findByPk(req.params.id);
        if (!activite) return res.status(404).json({ message: 'Activité introuvable.' });
        let reg = activite.reglages || {};
        if (typeof reg === 'string') {
            try { reg = JSON.parse(reg); } catch { reg = {}; }
        }
        if (!reg.acces_protege || !reg.acces_hash) {
            return res.json({ ok: true, protege: false });
        }
        const cle = (req.body.cle || req.body.mot_de_passe || '').trim();
        if (!cle || !verifier(cle, reg.acces_hash)) {
            return res.status(403).json({ message: 'Clé d\'accès incorrecte.' });
        }
        res.json({ ok: true, protege: true, id: activite.id, nom: activite.nom });
    } catch (err) { next(err); }
}

module.exports = { getAll, getArborescence, getById, create, update, remove, updateReglages, verifierAcces };

