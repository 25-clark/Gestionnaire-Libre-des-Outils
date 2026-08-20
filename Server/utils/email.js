/**
 * Envoi d'e-mails (codes de connexion).
 *
 * Gmail (recommandé) :
 *   1. Compte Google → Sécurité → Validation en 2 étapes (activée)
 *   2. Mots de passe des applications → générer un mot de passe pour "GLO"
 *   3. Dans Server/.env :
 *        SMTP_HOST=smtp.gmail.com
 *        SMTP_PORT=587
 *        SMTP_SECURE=false
 *        SMTP_USER=votre.adresse@gmail.com
 *        SMTP_PASS=xxxx xxxx xxxx xxxx   (mot de passe d'application, 16 caractères)
 *        SMTP_FROM=votre.adresse@gmail.com
 *
 * Sans SMTP : le code est journalisé en console (mode développement).
 */
const fs = require('fs');
const path = require('path');

function smtpConfigure() {
    const host = (process.env.SMTP_HOST || '').trim();
    if (!host) return null;
    return {
        host,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        user: (process.env.SMTP_USER || '').trim(),
        pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''), // Gmail app password may be copied with spaces
        from: (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@glo.local').trim()
    };
}

let _nodemailer = null;
function getNodemailer() {
    if (_nodemailer !== null) return _nodemailer;
    try {
        _nodemailer = require('nodemailer');
    } catch {
        _nodemailer = false;
    }
    return _nodemailer;
}

async function envoyerViaNodemailer(cfg, opts) {
    const nodemailer = getNodemailer();
    if (!nodemailer) throw new Error('nodemailer non installé');
    const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
        tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT === 'true' }
    });
    await transporter.sendMail({
        from: cfg.from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html
    });
}

/**
 * @returns {Promise<{ ok: boolean, mode: 'smtp'|'log', error?: string }>}
 */
async function envoyerEmail(opts) {
    const to = String(opts.to || '').trim();
    if (!to || !to.includes('@')) {
        return { ok: false, mode: 'invalid', error: 'Adresse e-mail invalide.' };
    }
    const cfg = smtpConfigure();
    if (!cfg) {
        console.log('[email:dev] SMTP_HOST absent — code non envoyé par mail', {
            to, subject: opts.subject, text: opts.text
        });
        return { ok: false, mode: 'not_configured', error: 'SMTP_HOST non défini dans Server/.env' };
    }

    console.log('[email] Tentative SMTP', { host: cfg.host, port: cfg.port, user: cfg.user, to });

    try {
        if (getNodemailer()) {
            await envoyerViaNodemailer(cfg, opts);
        } else {
            console.warn('[email] nodemailer absent — npm install nodemailer dans Server/');
            const { envoyerSmtpBrut } = require('./emailSmtpBrut');
            await envoyerSmtpBrut(cfg, opts);
        }
        console.log('[email] Envoi OK vers', to);
        return { ok: true, mode: 'smtp' };
    } catch (err) {
        console.error('[email] échec envoi:', err.message);
        console.log('[email:fallback-log]', { to, subject: opts.subject, text: opts.text });
        return { ok: false, mode: 'smtp_error', error: err.message };
    }
}

async function envoyerCodeConnexion(email, code, context = {}) {
    const nom = context.prenom || context.matricule || 'utilisateur';
    const subject = 'Votre code de connexion GLO';
    const text = [
        `Bonjour ${nom},`,
        '',
        `Votre code de connexion à usage unique est : ${code}`,
        '',
        "Il est valable 5 minutes. Si vous n'êtes pas à l'origine de cette connexion, ignorez ce message et changez votre mot de passe.",
        '',
        '— GLO'
    ].join('\n');
    const html = `<div style="font-family:system-ui,sans-serif;max-width:480px">
<p>Bonjour <strong>${nom}</strong>,</p>
<p>Votre code de connexion à usage unique est :</p>
<p style="font-size:28px;letter-spacing:0.35em;font-weight:700;background:#f0fdf4;padding:12px 16px;border-radius:10px;display:inline-block">${code}</p>
<p>Il est valable <strong>5 minutes</strong>.</p>
<p style="color:#666;font-size:13px">Si vous n'êtes pas à l'origine de cette connexion, ignorez ce message.</p>
</div>`;
    return envoyerEmail({ to: email, subject, text, html });
}

module.exports = { envoyerEmail, envoyerCodeConnexion, smtpConfigure };
