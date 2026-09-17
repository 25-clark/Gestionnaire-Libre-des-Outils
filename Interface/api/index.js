/**
 * Point d'entrée Vercel (serverless).
 * Toutes les requêtes sont réécrites vers /api → ce handler Express.
 */
try {
    module.exports = require('../app');
} catch (err) {
    console.error('[vercel] Échec chargement app:', err);
    module.exports = (req, res) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(
            '<h1>Erreur au démarrage de GLO Interface</h1>' +
            '<pre style="white-space:pre-wrap">' +
            String(err && err.stack ? err.stack : err) +
            '</pre>' +
            '<p>Vérifiez les variables API_URL et SESSION_SECRET sur Vercel.</p>'
        );
    };
}
