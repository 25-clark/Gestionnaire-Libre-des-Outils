const { exporterSauvegarde, restaurerSauvegarde } = require('../utils/sauvegarde');
const { isAdmin } = require('../middlewares/auth');
const { consigner } = require('../utils/journal');
const { Parametre, Utilisateur } = require('../models');
const { assurerColonnes } = require('../utils/assurerColonnes');

async function telecharger(req, res, next) {
    try {
        if (!isAdmin(req.currentUser)) {
            return res.status(403).json({ message: 'Réservé à l\'administrateur.' });
        }
        const data = await exporterSauvegarde();
        const nom = `glo-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
        res.send(JSON.stringify(data, null, 2));

        await consigner({
            user: req.currentUser,
            action: 'export',
            ressource: 'sauvegarde',
            id_ressource: null,
            libelle: `Sauvegarde GLO téléchargée (${Object.keys(data.tables || {}).length} tables)`
        });
    } catch (err) { next(err); }
}

async function restaurer(req, res, next) {
    try {
        if (!isAdmin(req.currentUser)) {
            return res.status(403).json({ message: 'Réservé à l\'administrateur.' });
        }
        let payload = req.body;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch {
                return res.status(400).json({ message: 'JSON invalide.' });
            }
        }
        // Support { backup: {...} } ou fichier brut
        if (payload.backup) payload = payload.backup;
        if (!payload.glo_backup && req.body && req.body.glo_backup) payload = req.body;

        await assurerColonnes();
        const result = await restaurerSauvegarde(payload, { vider: true });

        await consigner({
            user: req.currentUser,
            action: 'import',
            ressource: 'sauvegarde',
            id_ressource: null,
            libelle: `Restauration GLO effectuée (${result.nb_utilisateurs} utilisateurs)`
        });

        res.json({ message: 'Restauration terminée.', ...result });
    } catch (err) {
        next(err);
    }
}

/** Restauration pendant l'installation (sans session admin). */
async function restaurerInstallation(req, res, next) {
    try {
        const [p] = await Parametre.findOrCreate({ where: { id: 1 }, defaults: {} });
        if (p.installation_terminee) {
            return res.status(403).json({ message: 'Installation déjà terminée.' });
        }
        let payload = req.body;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch {
                return res.status(400).json({ message: 'JSON invalide.' });
            }
        }
        if (payload.backup) payload = payload.backup;

        await assurerColonnes();
        const result = await restaurerSauvegarde(payload, { vider: true });

        // Conserver CGU acceptées, ne pas forcer terminer si l'utilisateur
        // doit encore passer les étapes suivantes.
        const nbUsers = await Utilisateur.count();
        await p.update({
            cgu_acceptees_le: p.cgu_acceptees_le || new Date(),
            // Si des utilisateurs sont présents, on peut considérer l'admin OK
        });

        res.json({
            message: 'Sauvegarde restaurée.',
            ...result,
            a_admin: nbUsers > 0,
            etape_suivante: nbUsers > 0 ? 'terminer' : 'auth'
        });
    } catch (err) { next(err); }
}

module.exports = { telecharger, restaurer, restaurerInstallation };
