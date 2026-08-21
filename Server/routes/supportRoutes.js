const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const { envoyerEmail } = require('../utils/email');

/**
 * POST /api/support
 * Envoie une demande de support vers SUPPORT_EMAIL (ou SMTP_USER) défini dans Server/.env
 */
router.post('/', requireAuth, async (req, res, next) => {
    try {
        const { sujet, message, categorie, contact } = req.body || {};
        if (!sujet || !String(sujet).trim()) {
            return res.status(400).json({ message: 'Le sujet est requis.' });
        }
        if (!message || String(message).trim().length < 10) {
            return res.status(400).json({ message: 'Le message doit contenir au moins 10 caractères.' });
        }

        const destinataire = (process.env.SUPPORT_EMAIL || process.env.SMTP_USER || '').trim();
        if (!destinataire) {
            return res.status(503).json({
                message: 'Adresse de support non configurée. Définissez SUPPORT_EMAIL (ou SMTP_USER) dans Server/.env.'
            });
        }

        const user = req.currentUser;
        const fromLabel = user
            ? `${user.prenom || ''} ${user.nom || ''}`.trim() + ` (${user.matricule})`
            : 'Utilisateur GLO';
        const emailUser = (user && user.email) ? user.email : (contact || 'non renseigné');

        const subject = `[GLO Support] ${String(categorie || 'general').toUpperCase()} — ${String(sujet).trim().slice(0, 80)}`;
        const text = [
            'Nouvelle demande de support GLO',
            '--------------------------------',
            `De : ${fromLabel}`,
            `E-mail contact : ${emailUser}`,
            `Catégorie : ${categorie || 'general'}`,
            `Sujet : ${String(sujet).trim()}`,
            '',
            String(message).trim(),
            '',
            `Matricule : ${user ? user.matricule : '—'}`,
            `ID utilisateur : ${user ? user.id : '—'}`,
            `Date : ${new Date().toISOString()}`
        ].join('\n');

        const html = `
<div style="font-family:system-ui,sans-serif;max-width:640px;line-height:1.5">
  <h2 style="color:#1e3a5f">Demande de support GLO</h2>
  <p><strong>De :</strong> ${fromLabel}<br>
  <strong>Contact :</strong> ${emailUser}<br>
  <strong>Catégorie :</strong> ${categorie || 'general'}<br>
  <strong>Sujet :</strong> ${String(sujet).trim()}</p>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;white-space:pre-wrap">${String(message).trim().replace(/</g, '&lt;')}</div>
  <p style="color:#64748b;font-size:12px;margin-top:16px">Matricule ${user ? user.matricule : '—'} · ${new Date().toLocaleString('fr-FR')}</p>
</div>`;

        const resultat = await envoyerEmail({
            to: destinataire,
            subject,
            text,
            html,
            replyTo: (user && user.email) || contact || undefined
        });

        if (!resultat.ok) {
            return res.status(502).json({
                message: resultat.error || 'Échec de l’envoi. Vérifiez la configuration SMTP dans Server/.env.'
            });
        }

        res.json({ message: 'Votre demande a été envoyée. Notre équipe ou votre administrateur vous répondra dans les meilleurs délais.' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
