const { Ticket, TicketMessage, TicketImage, Outil, Activite, SousActivite, Utilisateur } = require('../models');
const { isAdmin, userHasPermission, normaliserPermissions } = require('../middlewares/auth');
const { getPerimetreAcces } = require('../utils/perimetre');
const { consigner } = require('../utils/journal');
const { notifier } = require('../utils/notification');

function normaliserIds(arr) {
    if (!arr) return [];
    if (!Array.isArray(arr)) arr = [arr];
    return arr.map(x => parseInt(x, 10)).filter(n => n > 0);
}

function ticketAssigneesUsers(ticket) {
    const fromJson = normaliserIds(ticket.assignees_users);
    if (fromJson.length) return fromJson;
    if (ticket.id_assigne) return [ticket.id_assigne];
    return [];
}

function ticketAssigneesRoles(ticket) {
    return normaliserIds(ticket.assignees_roles);
}

function userRolesIds(user) {
    const ids = [];
    if (user.Role) ids.push(user.Role.id);
    if (user.rolesEffectifs) user.rolesEffectifs.forEach(r => ids.push(r.id));
    if (user.Roles) user.Roles.forEach(r => ids.push(r.id));
    return [...new Set(ids)];
}

const { calculerSlaEcheance, statutSla, trouverAdmins } = require('../utils/slaTickets');

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
        if (req.query.statut) {
            const st = Array.isArray(req.query.statut) ? req.query.statut : String(req.query.statut).split(',').filter(Boolean);
            if (st.length) tickets = tickets.filter(t => st.includes(t.statut));
        }
        if (req.query.priorite) {
            const pr = Array.isArray(req.query.priorite) ? req.query.priorite : String(req.query.priorite).split(',').filter(Boolean);
            if (pr.length) tickets = tickets.filter(t => pr.includes(t.priorite));
        }
        if (req.query.mine === '1') tickets = tickets.filter(t => t.id_createur === req.currentUser.id);
        if (req.query.assignes === '1') tickets = tickets.filter(t => t.id_assigne === req.currentUser.id);
        if (req.query.id_createur) {
            const ids = String(req.query.id_createur).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            if (ids.length) tickets = tickets.filter(t => ids.includes(t.id_createur));
        }
        if (req.query.id_assigne) {
            const ids = String(req.query.id_assigne).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            if (ids.length) {
                tickets = tickets.filter(t => {
                    if (ids.includes(t.id_assigne)) return true;
                    let au = t.assignees_users;
                    if (typeof au === 'string') { try { au = JSON.parse(au); } catch { au = []; } }
                    if (Array.isArray(au) && au.some(id => ids.includes(Number(id)))) return true;
                    return false;
                });
            }
        }
        if (req.query.q) {
            // Plusieurs termes (séparés par | ou espace) : un ticket matche s'il contient au moins un terme
            const termes = String(req.query.q)
                .split(/[|]+/)
                .map(s => s.trim().toLowerCase())
                .filter(Boolean);
            if (termes.length) {
                tickets = tickets.filter(t => {
                    const hay = ((t.titre || '') + ' ' + (t.description || '')).toLowerCase();
                    return termes.some(terme => hay.includes(terme));
                });
            }
        }
        if (req.query.id_outil) tickets = tickets.filter(t => t.id_outil === parseInt(req.query.id_outil, 10));

        // Pagination
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const allowed = [10, 25, 50, 100];
        let parPage = parseInt(req.query.par_page, 10) || 25;
        if (!allowed.includes(parPage)) parPage = 25;
        const total = tickets.length;
        const totalPages = Math.max(Math.ceil(total / parPage), 1);
        const pageSafe = Math.min(page, totalPages);
        const slice = tickets.slice((pageSafe - 1) * parPage, pageSafe * parPage);

        const ticketsEnrichis = slice.map(t => {
            const json = typeof t.toJSON === 'function' ? t.toJSON() : { ...t };
            json.sla_statut = statutSla(json);
            return json;
        });
        res.json({
            tickets: ticketsEnrichis,
            page: pageSafe,
            par_page: parPage,
            totalPages,
            total
        });
    } catch (err) { next(err); }
}

async function getById(req, res, next) { /* sla enrich below */
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

        const json = ticket.toJSON();
        json.sla_statut = statutSla(json);
        res.json(json);
    } catch (err) { next(err); }
}

async function create(req, res, next) {
    try {
        const { titre, description, priorite, id_outil, id_activite, id_sous_activite } = req.body;
        if (!titre || !description) {
            return res.status(400).json({ message: 'Le titre et la description sont requis.' });
        }

        const assignees_users = normaliserIds(req.body.assignees_users || req.body.id_assigne);
        const assignees_roles = normaliserIds(req.body.assignees_roles);
        const ticket = await Ticket.create({
            titre,
            description,
            priorite: PRIORITES_VALIDES.includes(priorite) ? priorite : 'normale',
            id_outil: id_outil || null,
            id_activite: id_activite || null,
            id_sous_activite: id_sous_activite || null,
            id_createur: req.currentUser.id,
            id_assigne: assignees_users[0] || null,
            assignees_users,
            assignees_roles,
            sla_echeance: calculerSlaEcheance(PRIORITES_VALIDES.includes(priorite) ? priorite : 'normale')
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
        const assigne = ticketAssigneesUsers(ticket).includes(req.currentUser.id)
            || ticketAssigneesRoles(ticket).some(r => userRolesIds(req.currentUser).includes(r));
        const autorise = isAdmin(req.currentUser)
            || userHasPermission(req.currentUser, 'tickets', 'update')
            || ticket.id_createur === req.currentUser.id
            || ticket.id_assigne === req.currentUser.id
            || assigne;
        if (!autorise) return res.status(403).json({ message: "Vous n'avez pas le droit de modifier ce ticket." });

        const { statut, priorite, id_assigne, assignees_users, assignees_roles } = req.body;
        const changements = {};
        if (statut !== undefined && STATUTS_VALIDES.includes(statut)) changements.statut = statut;
        if (priorite !== undefined && PRIORITES_VALIDES.includes(priorite)) {
            changements.priorite = priorite;
            changements.sla_echeance = calculerSlaEcheance(priorite);
        }

        const anciens = ticketAssigneesUsers(ticket);
        if (assignees_users !== undefined || assignees_roles !== undefined || id_assigne !== undefined) {
            const users = assignees_users !== undefined ? normaliserIds(assignees_users)
                : (id_assigne !== undefined ? normaliserIds([id_assigne]) : ticketAssigneesUsers(ticket));
            const roles = assignees_roles !== undefined ? normaliserIds(assignees_roles) : ticketAssigneesRoles(ticket);
            changements.assignees_users = users;
            changements.assignees_roles = roles;
            changements.id_assigne = users[0] || null;
        }

        await ticket.update(changements);

        await consigner({
            user: req.currentUser,
            action: 'modification',
            ressource: 'ticket',
            id_ressource: ticket.id,
            libelle: `Ticket #${ticket.id} "${ticket.titre}" modifié par ${req.currentUser.prenom} ${req.currentUser.nom}`
        });

        const nouveauxAss = changements.assignees_users || [];
        for (const uid of nouveauxAss) {
            if (anciens.includes(uid) || uid === req.currentUser.id) continue;
            await notifier({
                id_user: uid,
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
        ticketAssigneesUsers(ticket).forEach(uid => {
            if (uid !== req.currentUser.id) destinataires.add(uid);
        });

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

async function escalader(req, res, next) {
    try {
        const ticket = await Ticket.findByPk(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket introuvable.' });
        if (['resolu', 'ferme'].includes(ticket.statut)) {
            return res.status(400).json({ message: 'Impossible d\'escalader un ticket clos.' });
        }

        const admins = await trouverAdmins();
        if (!admins.length) {
            return res.status(400).json({ message: 'Aucun administrateur disponible pour l\'escalade.' });
        }

        // Choisir un admin (premier différent du demandeur)
        let admin = admins.find(a => a.id !== req.currentUser.id) || admins[0];
        // Si body.id_admin fourni et valide
        if (req.body.id_admin) {
            const choisi = admins.find(a => a.id === parseInt(req.body.id_admin, 10));
            if (choisi) admin = choisi;
        }

        await ticket.update({
            escalade_le: new Date(),
            id_escalade_admin: admin.id,
            id_assigne: admin.id,
            statut: ticket.statut === 'ouvert' ? 'en_cours' : ticket.statut,
            // Priorité relevée d\'un cran si pas déjà urgente
            priorite: ticket.priorite === 'urgente' ? 'urgente'
                : ticket.priorite === 'haute' ? 'urgente'
                : ticket.priorite === 'normale' ? 'haute' : 'normale',
            sla_echeance: calculerSlaEcheance(
                ticket.priorite === 'urgente' ? 'urgente'
                : ticket.priorite === 'haute' ? 'urgente'
                : ticket.priorite === 'normale' ? 'haute' : 'normale'
            )
        });

        await notifier({
            id_user: admin.id,
            message: `Ticket #${ticket.id} « ${ticket.titre} » escaladé vers vous par ${req.currentUser.prenom} ${req.currentUser.nom}.`,
            lien: `/tickets/${ticket.id}`,
            type: 'alerte'
        });
        if (ticket.id_createur && ticket.id_createur !== admin.id) {
            await notifier({
                id_user: ticket.id_createur,
                message: `Votre ticket #${ticket.id} a été escaladé vers un administrateur.`,
                lien: `/tickets/${ticket.id}`,
                type: 'info'
            });
        }

        const fresh = await Ticket.findByPk(ticket.id, {
            include: [
                { model: require('../models').Utilisateur, as: 'Createur' },
                { model: require('../models').Utilisateur, as: 'Assigne' },
                { model: require('../models').Outil },
                { model: require('../models').Activite },
                { model: require('../models').SousActivite }
            ]
        });
        const json = fresh.toJSON();
        json.sla_statut = statutSla(json);
        res.json(json);
    } catch (err) { next(err); }
}


async function modifierMessage(req, res, next) {
    try {
        const message = await TicketMessage.findByPk(req.params.messageId);
        if (!message) return res.status(404).json({ message: 'Message introuvable.' });
        if (message.id_user !== req.currentUser.id && !isAdmin(req.currentUser)) {
            return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres messages.' });
        }
        const ageMs = Date.now() - new Date(message.createdAt).getTime();
        if (ageMs > 5 * 60 * 1000 && !isAdmin(req.currentUser)) {
            return res.status(403).json({ message: 'Délai de modification dépassé (5 minutes).' });
        }
        const contenu = (req.body.contenu || '').trim();
        if (!contenu) return res.status(400).json({ message: 'Le message ne peut pas être vide.' });
        await message.update({ contenu });
        const complet = await TicketMessage.findByPk(message.id, { include: [{ model: Utilisateur, as: 'Auteur' }] });
        res.json(complet);
    } catch (err) { next(err); }
}

module.exports = { getAll, getById, create, escalader, update, remove, ajouterMessage, modifierMessage, utilisateurPeutVoirTicket };

