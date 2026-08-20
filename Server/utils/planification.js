/**
 * Tâches planifiées : sauvegarde auto + nettoyage du journal.
 */
const fs = require('fs');
const path = require('path');
const { Parametre, Journal } = require('../models');
const { exporterSauvegarde } = require('./sauvegarde');

const DIR_SAUV_DEFAUT = path.join(__dirname, '..', 'uploads', 'sauvegardes-auto');
let _timer = null;
let _derniereSauv = 0;

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
    };
    setTimeout(cycle, 2 * 60 * 1000);
    _timer = setInterval(cycle, 60 * 60 * 1000);
    console.log('[planif] Planification démarrée (sauvegarde + nettoyage journal)');
}

module.exports = { demarrerPlanification, executerSauvegardePlanifiee, executerNettoyageJournal, resoudreDossierSauvegarde };
