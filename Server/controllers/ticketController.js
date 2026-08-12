const { Ticket, TicketMessage, TicketImage, Outil, Activite, SousActivite, Utilisateur } = require('../models');
const { isAdmin, normaliserPermissions } = require('../middlewares/auth');
const { getPerimetreAcces } = require('../utils/perimetre');
const { consigner } = require('../utils/journal');
const { notifier } = require('../utils/notification');

const STATUTS_VALIDES = ['ouvert', 'en_cours', 'resolu', 'ferme'];
const PRIORITES_VALIDES = ['basse', 'normale', 'haute', 'urgente'];

// req.body.images peut arriver comme tableau JSON stringifié (multipart) ou
// déjà comme tableau JS (JSON direct) — on normalise dans les deux cas.
function normaliserListeImages(valeur) {
    if (!valeur) return [];
    if (Array.isArray(valeur)) return valeur;
    try {
        const parsed = JSON.parse(valeur);
        return Array.isArray(parsed) ? parsed : [valeur];
    } catch {
        return [valeur];
    }
}

const INCLUDE_COMPLET = [
    { model: Outil },
    { model: Activite },
    { model: SousActivite },
    { model: Utilisateur, as: 'Createur' },
    { model: Utilisateur, as: 'Assigne' },
    { model: TicketImage, as: 'images' }
];

/**
 * Un ticket est visible par : un admin, son créateur, son assigné, ou
 * quiconque a accès (périmètre) à l'activité/sous-activité/outil concerné.
 * Un ticket sans aucun lien (id_outil/id_activite/id_sous_activite tous
 * nuls) est un ticket "général", visible par tous ceux qui ont tickets.read.
 */
async function utilisateurPeutVoirTicket(user, ticket) {
    if (isAdmin(user)) return true;
    if (ticket.id_createur === user.id) return true;
    if (ticket.id_assigne === user.id) return true;
    if (!ticket.id_activite && !ticket.id_sous_activite && !ticket.id_outil) return true;

    const { activiteIds, sousActiviteIds } = await getPerimetreAcces(user);
    if (ticket.id_activite && activiteIds.has(ticket.id_activite)) return true;
    if (ticket.id_sous_activite && sousActiviteIds.has(ticket.id_sous_activite)) return true;

    if (ticket.id_outil) {
        const outil = await Outil.findByPk(ticket.id_outil, {
            include: [{ model: Activite, as: 'activites' }, { model: SousActivite, as: 'sousActivites' }]
        });
        if (outil) {
            if (outil.activites.some(a => activiteIds.has(a.id))) return true;
            if (outil.sousActivites.some(sa => sousActiviteIds.has(sa.id))) return true;
        }
    }

    return false;
}

async function getAll(req, res, next) {
    try {
        let tickets = await Ticket.findAll({ include: INCLUDE_COMPLET, order: [['createdAt', 'DESC']] });

        if (!isAdmin(req.currentUser)) {
            const resultats = await Promise.all(tickets.map(t => utilisateurPeutVoirTicket(req.currentUser, t)));
            tickets = tickets.filter((t, i) => resultats[i]);
        }

        // Filtres optionnels
        if (req.query.statut) tickets = tickets.filter(t => t.statut === req.query.statut);
        if (req.query.priorite) tickets = tickets.filter(t => t.priorite === req.query.priorite);
        if (req.query.mine === '1') tickets = tickets.filter(t => t.id_createur === req.currentUser.id);
        if (req.query.assignes === '1') tickets = tickets.filter(t => t.id_assigne === req.currentUser.id);
        if (req.query.id_createur) tickets = tickets.filter(t => t.id_createur === parseInt(req.query.id_createur, 10));
        if (req.query.id_assigne) tickets = tickets.filter(t => t.id_assigne === parseInt(req.query.id_assigne, 10));
        if (req.query.id_outil) tickets = tickets.filter(t => t.id_outil === parseInt(req.query.id_outil, 10));

        res.json(tickets);
    } catch (err) { next(err); }
}

async function getById(req, res, next) {
    try {
        const ticket = await Ticket.findByPk(req.params.id, {
            include: [...INCLUDE_COMPLET, {
                model: TicketMessage,
                as: 'messages',
                include: [{ model: Utilisateur, as: 'Auteur' }],
                separate: true,
                order: [['createdAt', 'ASC']]
            }]
        });
        if (!ticket) return res.status(404).json({ message: 'Ticket introuvable.' });

        if (!(await utilisateurPeutVoirTicket(req.currentUser, ticket))) {
            return res.status(403).json({ message: "Vous n'avez pas accès à ce ticket." });
        }

        res.json(ticket);
    } catch (err) { next(err); }
}

async function create(req, res, next) {
    try {
        const { titre, description, priorite, id_outil, id_activite, id_sous_activite } = req.body;
        if (!titre || !description) {
            return res.status(400).json({ message: 'Le titre et la description sont requis.' });
        }

        const ticket = await Ticket.create({
            titre,
            description,
            priorite: PRIORITES_VALIDES.includes(priorite) ? priorite : 'normale',
            id_outil: id_outil || null,
            id_activite: id_activite || null,
            id_sous_activite: id_sous_activite || null,
            id_createur: req.currentUser.id
        });

        // Images jointes (optionnelles, jusqu'à 6) : soit déjà uploadées par
        // l'Interface (chemins reçus en JSON, cf. Interface/routes/ticketRoutes.js),
        // soit un vrai multipart direct sur l'API (req.files, via
        // uploadTicketImages dans routes/ticketRoutes.js) — même principe
        // que pour les images d'outils (voir outilController.js).
        const cheminsImages = req.files && req.files.length
            ? req.files.map(f => `/uploads/tickets/${f.filename}`)
            : normaliserListeImages(req.body.images);

        if (cheminsImages.length) {
            await TicketImage.bulkCreate(cheminsImages.map(chemin => ({ id_ticket: ticket.id, chemin })));
        }

        const ticketComplet = await Ticket.findByPk(ticket.id, { include: INCLUDE_COMPLET });

        await consigner({
            user: req.currentUser,
            action: 'creation',
            ressource: 'ticket',
            id_ressource: ticket.id,
            libelle: `Ticket #${ticket.id} "${titre}" ouvert par ${req.currentUser.prenom} ${req.currentUser.nom}`
        });

        // On prévient le propriétaire de l'outil concerné (s'il y en a un et
        // que ce n'est pas lui-même qui a ouvert le ticket) : c'est la
        // personne la mieux placée pour réagir en premier.
        if (ticketComplet.Outil && ticketComplet.Outil.id_user && ticketComplet.Outil.id_user !== req.currentUser.id) {
            await notifier({
                id_user: ticketComplet.Outil.id_user,
                type: 'alerte',
                message: `Nouveau ticket sur votre outil "${ticketComplet.Outil.nom}" : ${titre}`,
                lien: `/tickets/${ticket.id}`
            });
        }

        res.status(201).json(ticketComplet);
    } catch (err) { next(err); }
}

async function update(req, res, next) {
    try {
        const ticket = await Ticket.findByPk(req.params.id, { include: INCLUDE_COMPLET });
        if (!ticket) return res.status(404).json({ message: 'Ticket introuvable.' });

        // Autorisé pour : admin, ceux qui ont tickets.update, le créateur, ou
        // l'assigné actuel (peut au moins avancer son propre dossier).
        const permissionsRole = normaliserPermissions(req.currentUser.Role?.permissions);
        const permissionRole = !!(permissionsRole.tickets && permissionsRole.tickets.update);
        const autorise = isAdmin(req.currentUser) || permissionRole
            || ticket.id_createur === req.currentUser.id || ticket.id_assigne === req.currentUser.id;
        if (!autorise) return res.status(403).json({ message: "Vous n'avez pas le droit de modifier ce ticket." });

        const { statut, priorite, id_assigne } = req.body;
        const changements = {};
        if (statut !== undefined && STATUTS_VALIDES.includes(statut)) changements.statut = statut;
        if (priorite !== undefined && PRIORITES_VALIDES.includes(priorite)) changements.priorite = priorite;

        const ancienAssigne = ticket.id_assigne;
        if (id_assigne !== undefined) changements.id_assigne = id_assigne || null;

        await ticket.update(changements);

        await consigner({
            user: req.currentUser,
            action: 'modification',
            ressource: 'ticket',
            id_ressource: ticket.id,
            libelle: `Ticket #${ticket.id} "${ticket.titre}" modifié par ${req.currentUser.prenom} ${req.currentUser.nom}`
        });

        if (changements.id_assigne && changements.id_assigne !== ancienAssigne && changements.id_assigne !== req.currentUser.id) {
            await notifier({
                id_user: changements.id_assigne,
                type: 'info',
                message: `On vous a assigné le ticket #${ticket.id} "${ticket.titre}".`,
                lien: `/tickets/${ticket.id}`
            });
        }
        if (changements.statut && ['resolu', 'ferme'].includes(changements.statut) && ticket.id_createur !== req.currentUser.id) {
            await notifier({
                id_user: ticket.id_createur,
                type: 'succes',
                message: `Votre ticket #${ticket.id} "${ticket.titre}" a été marqué ${changements.statut === 'resolu' ? 'résolu' : 'fermé'}.`,
                lien: `/tickets/${ticket.id}`
            });
        }

        const ticketMisAJour = await Ticket.findByPk(ticket.id, { include: INCLUDE_COMPLET });
        res.json(ticketMisAJour);
    } catch (err) { next(err); }
}

async function remove(req, res, next) {
    try {
        const ticket = await Ticket.findByPk(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket introuvable.' });

        const titreTicket = ticket.titre;
        const idTicket = ticket.id;
        await ticket.destroy();

        await consigner({
            user: req.currentUser,
            action: 'suppression',
            ressource: 'ticket',
            id_ressource: idTicket,
            libelle: `Ticket #${idTicket} "${titreTicket}" supprimé`
        });

        res.json({ message: 'Ticket supprimé.' });
    } catch (err) { next(err); }
}

// ---------- Messagerie (fil de discussion d'un ticket) ----------

async function ajouterMessage(req, res, next) {
    try {
        const ticket = await Ticket.findByPk(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket introuvable.' });

        if (!(await utilisateurPeutVoirTicket(req.currentUser, ticket))) {
            return res.status(403).json({ message: "Vous n'avez pas accès à ce ticket." });
        }

        const { contenu } = req.body;
        if (!contenu || !contenu.trim()) {
            return res.status(400).json({ message: 'Le message ne peut pas être vide.' });
        }

        const message = await TicketMessage.create({
            id_ticket: ticket.id,
            id_user: req.currentUser.id,
            contenu: contenu.trim()
        });

        // On notifie "l'autre côté" de la conversation : si c'est le créateur
        // qui écrit, on prévient l'assigné (et inversement), pour que la
        // discussion avance sans que personne n'ait à revenir voir par hasard.
        const destinataires = new Set();
        if (ticket.id_createur !== req.currentUser.id) destinataires.add(ticket.id_createur);
        if (ticket.id_assigne && ticket.id_assigne !== req.currentUser.id) destinataires.add(ticket.id_assigne);

        for (const idDestinataire of destinataires) {
            await notifier({
                id_user: idDestinataire,
                type: 'info',
                message: `Nouveau message de ${req.currentUser.prenom} ${req.currentUser.nom} sur le ticket #${ticket.id} "${ticket.titre}".`,
                lien: `/tickets/${ticket.id}`
            });
        }

        const messageComplet = await TicketMessage.findByPk(message.id, { include: [{ model: Utilisateur, as: 'Auteur' }] });
        res.status(201).json(messageComplet);
    } catch (err) { next(err); }
}

module.exports = { getAll, getById, create, update, remove, ajouterMessage, utilisateurPeutVoirTicket };
