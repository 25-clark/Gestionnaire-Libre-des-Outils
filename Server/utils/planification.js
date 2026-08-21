/**
 * Tâches planifiées : sauvegarde auto + nettoyage du journal.
 */
const fs = require('fs');
const path = require('path');
const { Parametre, Journal, Ticket } = require('../models');
const { exporterSauvegarde } = require('./sauvegarde');
const { envoyerEmail } = require('./email');

const DIR_SAUV_DEFAUT = path.join(__dirname, '..', 'uploads', 'sauvegardes-auto');
let _timer = null;
let _derniereSauv = 0;
let _dernierRapport = 0;

async function lireParams() {
    const [p] = await Parametre.findOrCreate({ where: { id: 1 }, defaults: {} });
    return p;
}

function resoudreDossierSauvegarde(p) {
    const custom = (p.sauvegarde_dossier || '').trim();
    if (!custom) return DIR_SAUV_DEFAUT;
    // Accepter chemin absolu Windows ou Unix
    if (path.isAbsolute(custom)) return custom;
    // Relatif → relatif au dossier Server/
    return path.resolve(path.join(__dirname, '..', custom));
}

async function executerSauvegardePlanifiee() {
    try {
        const p = await lireParams();
        if (!p.sauvegarde_planifiee) return;
        const intervalMs = Math.max(1, Number(p.sauvegarde_intervalle_heures) || 24) * 3600 * 1000;
        if (Date.now() - _derniereSauv < intervalMs * 0.9) return;

        const dir = resoudreDossierSauvegarde(p);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const data = await exporterSauvegarde();
        const nom = `auto-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const fichier = path.join(dir, nom);
        fs.writeFileSync(fichier, JSON.stringify(data, null, 2), 'utf8');
        _derniereSauv = Date.now();

        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
        while (files.length > 10) {
            const f = files.shift();
            try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
        }
        console.log('[planif] Sauvegarde auto enregistrée:', fichier);
    } catch (err) {
        console.error('[planif] sauvegarde:', err.message);
    }
}

async function executerRapportPlanifie() {
    try {
        const p = await lireParams();
        if (!p.rapport_planifie) return;
        const intervalMs = Math.max(1, Number(p.rapport_intervalle_heures) || 168) * 3600 * 1000;
        if (Date.now() - _dernierRapport < intervalMs * 0.9) return;

        let emails = p.rapport_emails || '';
        if (typeof emails !== 'string') emails = String(emails || '');
        const destinataires = emails.split(/[,;\s]+/).map(s => s.trim()).filter(s => s.includes('@'));
        if (!destinataires.length) {
            console.warn('[planif] Rapport planifié actif mais aucun e-mail (rapport_emails)');
            return;
        }

        const { Op } = require('sequelize');
        const depuis = new Date(Date.now() - intervalMs);
        const tickets = await Ticket.findAll({
            where: { createdAt: { [Op.gte]: depuis } },
            attributes: ['id', 'titre', 'statut', 'priorite', 'created_at'],
            limit: 500
        }).catch(() => []);

        const parStatut = {};
        for (const t of tickets) {
            parStatut[t.statut] = (parStatut[t.statut] || 0) + 1;
        }
        const lignes = Object.entries(parStatut).map(([k, v]) => `  - ${k}: ${v}`).join('\n') || '  (aucun)';
        const subject = `[GLO] Rapport tickets — ${new Date().toLocaleDateString('fr-FR')}`;
        const text = [
            'Rapport planifié GLO',
            `Période : depuis ${depuis.toLocaleString('fr-FR')}`,
            `Tickets créés : ${tickets.length}`,
            'Répartition par statut :',
            lignes,
            '',
            '— GLO (envoi automatique)'
        ].join('\n');

        for (const to of destinataires) {
            await envoyerEmail({ to, subject, text });
        }
        _dernierRapport = Date.now();
        console.log('[planif] Rapport envoyé à', destinataires.join(', '));
    } catch (err) {
        console.error('[planif] rapport:', err.message);
    }
}

async function executerNettoyageJournal() {
    try {
        const p = await lireParams();
        if (!p.journal_nettoyage_actif) return;
        const jours = Math.max(7, Number(p.journal_retention_jours) || 90);
        const limite = new Date(Date.now() - jours * 24 * 3600 * 1000);
        const { Op } = require('sequelize');
        const n = await Journal.destroy({
            where: { createdAt: { [Op.lt]: limite } }
        });
        if (n) console.log(`[planif] Journal : ${n} entrée(s) de plus de ${jours} j supprimée(s)`);
    } catch (err) {
        console.error('[planif] journal:', err.message);
    }
}

function demarrerPlanification() {
    if (_timer) return;
    const cycle = async () => {
        await executerSauvegardePlanifiee();
        await executerNettoyageJournal();
        await executerRapportPlanifie();
    };
    setTimeout(cycle, 2 * 60 * 1000);
    _timer = setInterval(cycle, 60 * 60 * 1000);
    console.log('[planif] Planification démarrée (sauvegarde + journal + rapports)');
}

module.exports = {
    demarrerPlanification,
    executerSauvegardePlanifiee,
    executerNettoyageJournal,
    executerRapportPlanifie,
    resoudreDossierSauvegarde
};
