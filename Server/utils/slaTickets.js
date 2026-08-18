/**
 * SLA tickets + relances + détection de dépassement.
 * Délais par priorité (heures) — simples et configurables ici.
 */
const { Op } = require('sequelize');
const { Ticket, Utilisateur, Role } = require('../models');
const { notifier } = require('./notification');

// Délai SLA en heures selon la priorité
const SLA_HEURES = {
    urgente: 4,
    haute: 24,
    normale: 72,
    basse: 168 // 7 jours
};

// Relance au plus tôt toutes les X heures après dépassement
const RELANCE_INTERVALLE_HEURES = 12;

function calculerSlaEcheance(priorite, depuis = new Date()) {
    const h = SLA_HEURES[priorite] || SLA_HEURES.normale;
    return new Date(depuis.getTime() + h * 60 * 60 * 1000);
}

function statutSla(ticket) {
    if (!ticket.sla_echeance) return 'sans_sla';
    if (['resolu', 'ferme'].includes(ticket.statut)) return 'clos';
    const now = Date.now();
    const echeance = new Date(ticket.sla_echeance).getTime();
    if (now > echeance) return 'depasse';
    // Moins de 20 % du délai restant → bientôt
    const cree = ticket.createdAt ? new Date(ticket.createdAt).getTime() : now;
    const total = echeance - cree;
    const reste = echeance - now;
    if (total > 0 && reste / total < 0.2) return 'bientot';
    return 'ok';
}

async function trouverAdmins() {
    const admins = await Utilisateur.findAll({
        include: [{ model: Role, where: { abbreviation: 'ADMIN' }, required: true }]
    });
    return admins;
}

/**
 * Parcourt les tickets ouverts dont le SLA est dépassé :
 * - notifie l'assigné (ou le créateur) en relance
 * - notifie les admins si pas encore escaladé automatiquement (info)
 */
async function verifierSlaTickets() {
    const maintenant = new Date();
    const tickets = await Ticket.findAll({
        where: {
            statut: { [Op.in]: ['ouvert', 'en_cours'] },
            sla_echeance: { [Op.ne]: null, [Op.lt]: maintenant }
        }
    });

    let traites = 0;
    for (const t of tickets) {
        const derniere = t.derniere_relance_le ? new Date(t.derniere_relance_le).getTime() : 0;
        const minIntervalle = RELANCE_INTERVALLE_HEURES * 60 * 60 * 1000;
        if (Date.now() - derniere < minIntervalle) continue;

        const destinataires = new Set();
        if (t.id_assigne) destinataires.add(t.id_assigne);
        if (t.id_createur) destinataires.add(t.id_createur);
        if (t.id_escalade_admin) destinataires.add(t.id_escalade_admin);

        const msg = `SLA dépassé — ticket #${t.id} « ${t.titre} » (priorité ${t.priorite}). Merci de le traiter ou de l'escalader.`;
        const lien = `/tickets/${t.id}`;

        for (const id_user of destinataires) {
            await notifier({ id_user, message: msg, lien, type: 'alerte' });
        }

        // Première relance après dépassement : prévenir aussi les admins
        if (!t.derniere_relance_le) {
            const admins = await trouverAdmins();
            for (const a of admins) {
                if (destinataires.has(a.id)) continue;
                await notifier({
                    id_user: a.id,
                    message: `Alerte SLA : ticket #${t.id} « ${t.titre} » a dépassé son délai.`,
                    lien,
                    type: 'alerte'
                });
            }
        }

        await t.update({ derniere_relance_le: maintenant });
        traites++;
    }
    if (traites > 0) {
        console.log(`[sla] ${traites} ticket(s) en relance SLA`);
    }
    return traites;
}

let _timer = null;

function demarrerSlaTickets() {
    if (_timer) return;
    // Premier passage après 45 s, puis toutes les 15 minutes
    setTimeout(() => {
        verifierSlaTickets().catch(err => console.error('[sla]', err.message));
        _timer = setInterval(() => {
            verifierSlaTickets().catch(err => console.error('[sla]', err.message));
        }, 15 * 60 * 1000);
    }, 45 * 1000);
    console.log('[sla] Surveillance SLA tickets démarrée (cycle 15 min)');
}

module.exports = {
    SLA_HEURES,
    calculerSlaEcheance,
    statutSla,
    verifierSlaTickets,
    demarrerSlaTickets,
    trouverAdmins
};
