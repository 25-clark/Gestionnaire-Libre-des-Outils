const { Outil, Utilisateur, Activite, SousActivite, OutilHistoriqueStatut, Parametre, UtilisateurOutilCredential } = require('../models');
const { isAdmin, getIdsActivitesAccessibles } = require('../middlewares/auth');
const { getPerimetreAcces } = require('../utils/perimetre');
const { consigner } = require('../utils/journal');
const { verifierUnOutil } = require('../utils/surveillance');
const { chiffrerCredentials, dechiffrerOutil, dechiffrerOutils } = require('../utils/credentialsCrypto');

async function moduleCredentialsActif() {
    const [p] = await Parametre.findOrCreate({ where: { id: 1 }, defaults: {} });
    return !!p.credentials_actifs;
}

function permissionCredentials(user, action) {
    if (isAdmin(user)) return true;
    const perms = user.Role && user.Role.permissions
        ? (typeof user.Role.permissions === 'string' ? JSON.parse(user.Role.permissions || '{}') : user.Role.permissions)
        : {};
    return !!(perms.credentials && perms.credentials[action]);
}

async function credentialsAutorises(user) {
    if (!(await moduleCredentialsActif())) return false;
    return permissionCredentials(user, 'read');
}

/** Charge les credentials personnels de l'utilisateur courant pour un outil. */
async function chargerCredentialsPerso(idUser, idOutil) {
    const row = await UtilisateurOutilCredential.findOne({
        where: { id_user: idUser, id_outil: idOutil }
    });
    if (!row) return [];
    const liste = row.credentials || [];
    // Déchiffre via le même helper que les outils
    return dechiffrerOutil({ credentials: liste }).credentials || [];
}

/** Attache mes_credentials (personnels) et retire credentials partagés de l'outil. */
function calculerDerangement(json) {
    const now = Date.now();
    const deb = json.derangement_debut ? new Date(json.derangement_debut).getTime() : null;
    const fin = json.derangement_fin ? new Date(json.derangement_fin).getTime() : null;
    let en_cours = false;
    if (deb && fin) en_cours = now >= deb && now <= fin;
    else if (deb && !fin) en_cours = now >= deb;
    else if (!deb && fin) en_cours = now <= fin;
    return {
        en_derangement: en_cours,
        note_maintenance: json.note_maintenance || null,
        derangement_debut: json.derangement_debut || null,
        derangement_fin: json.derangement_fin || null,
        derangement_message: json.derangement_message || null
    };
}

async function enrichirOutilCredentials(outil, user) {
    const json = typeof outil.toJSON === 'function' ? outil.toJSON() : { ...outil };
    // Ne jamais exposer d'anciens credentials partagés sur l'outil
    delete json.credentials;
    json.mes_credentials = [];
    if (await credentialsAutorises(user)) {
        json.mes_credentials = await chargerCredentialsPerso(user.id, json.id);
    }
    // Alias pour l'UI existante qui lit outil.credentials (= toujours perso)
    json.credentials = json.mes_credentials;
    Object.assign(json, calculerDerangement(json));
    return json;
}

async function enrichirOutilsCredentials(outils, user) {
    return Promise.all(outils.map(o => enrichirOutilCredentials(o, user)));
}

async function sauvegarderCredentialsPerso(idUser, idOutil, liste) {
    const chiffrés = chiffrerCredentials(Array.isArray(liste) ? liste : []);
    const [row] = await UtilisateurOutilCredential.findOrCreate({
        where: { id_user: idUser, id_outil: idOutil },
        defaults: { credentials: chiffrés }
    });
    if (!row.isNewRecord) {
        await row.update({ credentials: chiffrés });
    }
    return chiffrés;
}


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

        res.json(await enrichirOutilsCredentials(outils, req.currentUser));
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
        res.json(await enrichirOutilCredentials(outil, req.currentUser));
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

        // Credentials à la création = personnels (créateur uniquement), pas sur l'outil
        let credentialsPerso = null;
        if (req.body.credentials && (await moduleCredentialsActif()) && permissionCredentials(req.currentUser, 'create')) {
            try {
                credentialsPerso = typeof req.body.credentials === 'string'
                    ? JSON.parse(req.body.credentials)
                    : req.body.credentials;
            } catch (_) { credentialsPerso = []; }
            if (!Array.isArray(credentialsPerso)) credentialsPerso = [];
        }

        const outil = await Outil.create({
            nom,
            lien: lien || null,
            adresse: adresse || null,
            image,
            id_user
        });

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

        if (credentialsPerso && credentialsPerso.length) {
            await sauvegarderCredentialsPerso(req.currentUser.id, outil.id, credentialsPerso);
        }

        res.status(201).json(await enrichirOutilCredentials(outilComplet, req.currentUser));
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


// Mise à jour des credentials uniquement (exception à la règle « pas de
// modification » : les identifiants évoluent souvent sans recréer l'outil).
async function updateCredentials(req, res, next) {
    try {
        const outil = await Outil.findByPk(req.params.id);
        if (!outil) return res.status(404).json({ message: 'Outil introuvable.' });

        if (!(await moduleCredentialsActif())) {
            return res.status(403).json({ message: 'Les credentials sont désactivés dans les Réglages généraux.' });
        }
        if (!permissionCredentials(req.currentUser, 'update') && !permissionCredentials(req.currentUser, 'create')) {
            return res.status(403).json({ message: 'Permission credentials insuffisante.' });
        }

        let credentials = req.body.credentials;
        if (typeof credentials === 'string') {
            try { credentials = JSON.parse(credentials); } catch (_) { credentials = []; }
        }
        if (!Array.isArray(credentials)) credentials = [];

        // Uniquement les credentials de l'utilisateur connecté
        await sauvegarderCredentialsPerso(req.currentUser.id, outil.id, credentials);

        await consigner({
            user: req.currentUser,
            action: 'modification',
            ressource: 'credentials',
            id_ressource: outil.id,
            libelle: `Credentials personnels mis à jour pour l'outil "${outil.nom}" (${credentials.length} champ(s)) — utilisateur ${req.currentUser.matricule}`
        });

        const fresh = await Outil.findByPk(outil.id, {
            include: [
                { model: Utilisateur },
                { model: Activite, as: 'activites' },
                { model: SousActivite, as: 'sousActivites' }
            ]
        });
        res.json(await enrichirOutilCredentials(fresh, req.currentUser));
    } catch (err) { next(err); }
}


async function updateMaintenance(req, res, next) {
    try {
        const outil = await Outil.findByPk(req.params.id);
        if (!outil) return res.status(404).json({ message: 'Outil introuvable.' });

        const { note_maintenance, derangement_debut, derangement_fin, derangement_message } = req.body;
        const data = {};
        if (note_maintenance !== undefined) data.note_maintenance = note_maintenance || null;
        if (derangement_message !== undefined) data.derangement_message = derangement_message || null;
        if (derangement_debut !== undefined) {
            data.derangement_debut = derangement_debut ? new Date(derangement_debut) : null;
        }
        if (derangement_fin !== undefined) {
            data.derangement_fin = derangement_fin ? new Date(derangement_fin) : null;
        }

        await outil.update(data);

        await consigner({
            user: req.currentUser,
            action: 'modification',
            ressource: 'outil',
            id_ressource: outil.id,
            libelle: `Maintenance / dérangement mis à jour pour l'outil "${outil.nom}"`
        });

        const fresh = await Outil.findByPk(outil.id, {
            include: [
                { model: Utilisateur },
                { model: Activite, as: 'activites' },
                { model: SousActivite, as: 'sousActivites' }
            ]
        });
        res.json(await enrichirOutilCredentials(fresh, req.currentUser));
    } catch (err) { next(err); }
}


async function update(req, res, next) {
    try {
        const outil = await Outil.findByPk(req.params.id);
        if (!outil) return res.status(404).json({ message: 'Outil introuvable.' });

        let { nom, lien, adresse, activites, sousActivites, id_activite, id_sous_activite } = req.body;
        // Formulaire Interface envoie id_activite / id_sous_activite (singulier)
        if (activites === undefined && id_activite) {
            activites = Array.isArray(id_activite) ? id_activite : [id_activite];
        }
        if (sousActivites === undefined && id_sous_activite) {
            sousActivites = Array.isArray(id_sous_activite) ? id_sous_activite : [id_sous_activite];
        }
        const data = {};
        if (nom !== undefined) {
            if (!String(nom).trim()) return res.status(400).json({ message: 'Le nom est requis.' });
            data.nom = String(nom).trim();
        }
        if (lien !== undefined) data.lien = lien || null;
        if (adresse !== undefined) data.adresse = adresse || null;
        if (req.file) data.image = `/uploads/outils/${req.file.filename}`;
        else if (req.body.image !== undefined) data.image = req.body.image || null;

        await outil.update(data);

        if (activites !== undefined) {
            let ids = activites;
            if (typeof ids === 'string') {
                try { ids = JSON.parse(ids); } catch { ids = ids ? [ids] : []; }
            }
            if (!Array.isArray(ids)) ids = [];
            await outil.setActivites(ids.map(Number).filter(Boolean));
        }
        if (sousActivites !== undefined) {
            let ids = sousActivites;
            if (typeof ids === 'string') {
                try { ids = JSON.parse(ids); } catch { ids = ids ? [ids] : []; }
            }
            if (!Array.isArray(ids)) ids = [];
            await outil.setSousActivites(ids.map(Number).filter(Boolean));
        }

        const complet = await Outil.findByPk(outil.id, {
            include: [
                { model: Utilisateur },
                { model: Activite, as: 'activites' },
                { model: SousActivite, as: 'sousActivites' }
            ]
        });
        res.json(await enrichirOutilCredentials(complet, req.currentUser));
    } catch (err) { next(err); }
}

module.exports = { getAll, getById, create, update, toggleActive, remove, verifierStatut, historiqueStatut, partager, retirerPartageActivite, retirerPartageSousActivite, updateCredentials, updateMaintenance };

