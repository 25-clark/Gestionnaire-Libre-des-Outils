const { Utilisateur, Role, Parametre } = require('../models');
const { verifier, hacher, validerPolitiqueMotDePasse } = require('../utils/motDePasse');
const { consigner } = require('../utils/journal');
const { verifierBlocageIp, enregistrerEchecIp, reinitialiserIp } = require('../utils/limiteurIp');
const { genererSecret, verifierTotp, otpauthUrl } = require('../utils/totp');
const { envoyerCodeConnexion } = require('../utils/email');

// Réglages de sécurité toujours disponibles (créés à la volée s'ils
// n'existent pas encore, comme dans parametreController.js).
async function obtenirParametres() {
    const [parametre] = await Parametre.findOrCreate({ where: { id: 1 }, defaults: {} });
    return parametre;
}

function formatDuree(ms) {
    const minutes = Math.max(Math.ceil(ms / 60000), 1);
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

// Connexion par matricule + mot de passe, protégée contre le brute-force à
// deux niveaux :
//  - par IP (en mémoire) : empêche de tester beaucoup de matricules
//    différents depuis la même machine.
//  - par matricule (persisté en base, Utilisateur.tentatives_echouees /
//    bloque_jusqu_a) : protège CE compte précis, même depuis des IP
//    différentes, et survit à un redémarrage du serveur.
//
// Si le mot de passe est celui par défaut (doit_changer_mdp = true), le
// client (Interface) doit rediriger vers le changement de mot de passe
// avant de laisser continuer.

/** Génère un code 3FA à 6 chiffres (valide 5 min). */
function genererCodeAuth() {
    return String(Math.floor(100000 + Math.random() * 900000));
}


async function demarrerAuthEmail(req, res, user) {
    const email = (user.email || '').trim();
    if (!email || !email.includes('@')) {
        return res.json({
            message: 'Une adresse e-mail est requise pour le code de connexion. Ajoutez-la dans Mon profil.',
            require_email: true,
            requireAuthEmail: false
        });
    }
    const code = genererCodeAuth();
    req.session.pendingAuthEmailUserId = user.id;
    req.session.pendingAuthEmailExpire = Date.now() + 5 * 60 * 1000;
    req.session.pendingAuthEmailCode = code;
    const envoi = await envoyerCodeConnexion(email, code, {
        prenom: user.prenom,
        matricule: user.matricule
    });
    const masque = email.replace(/(.{2})(.*)(@.*)/, (_, a, b, d) => a + '***' + d);
    console.log(`[auth-email] Code pour ${user.matricule} → ${email} (mode ${envoi.mode})`, envoi.error || '');

    let message = `Un code a été envoyé à ${masque}.`;
    let hint = undefined;
    if (envoi.mode === 'smtp' && envoi.ok) {
        message = `Un code a été envoyé à ${masque}. Vérifiez votre boîte de réception (et les spams).`;
    } else if (envoi.mode === 'not_configured') {
        message = `SMTP non lu depuis Server/.env (SMTP_HOST manquant ?). Code de secours affiché.`;
        hint = code;
    } else if (envoi.mode === 'smtp_error') {
        message = `Échec d'envoi SMTP vers ${masque} : ${envoi.error || 'erreur inconnue'}. Code de secours affiché. Vérifiez SMTP_USER / SMTP_PASS (mot de passe d'application Gmail) et npm install nodemailer.`;
        hint = code;
    } else {
        message = `Code généré pour ${masque} (mode secours).`;
        hint = code;
    }

    return res.json({
        message,
        requireAuthEmail: true,
        email_masque: masque,
        smtp_mode: envoi.mode,
        hint
    });
}

async function login(req, res, next) {
    try {
        const { matricule, mot_de_passe } = req.body;
        const ip = req.ip;

        if (!matricule || !mot_de_passe) {
            return res.status(400).json({ message: 'Le matricule et le mot de passe sont requis.' });
        }

        const parametre = await obtenirParametres();
        const maxTentatives = parametre.max_tentatives_connexion;
        const dureeBlocageMs = parametre.duree_blocage_minutes * 60 * 1000;

        const restantIp = verifierBlocageIp(ip);
        if (restantIp > 0) {
            return res.status(429).json({
                message: `Trop de tentatives de connexion depuis cette machine. Réessayez dans ${formatDuree(restantIp)}.`
            });
        }

        const user = await Utilisateur.scope('avecMotDePasse').findOne({
            where: { matricule },
            include: [{ model: Role }]
        });

        if (user && user.bloque_jusqu_a && new Date(user.bloque_jusqu_a).getTime() > Date.now()) {
            const restant = new Date(user.bloque_jusqu_a).getTime() - Date.now();
            return res.status(429).json({
                message: `Ce compte est temporairement bloqué suite à plusieurs échecs de connexion. Réessayez dans ${formatDuree(restant)}.`
            });
        }

        const motDePasseValide = !!user && verifier(mot_de_passe, user.mot_de_passe);

        if (!motDePasseValide) {
            enregistrerEchecIp(ip, maxTentatives, dureeBlocageMs);

            if (user) {
                const tentatives = user.tentatives_echouees + 1;
                const misesAJour = { tentatives_echouees: tentatives };
                const vientDetreBloque = tentatives >= maxTentatives;

                if (vientDetreBloque) {
                    misesAJour.bloque_jusqu_a = new Date(Date.now() + dureeBlocageMs);
                }
                await user.update(misesAJour);

                await consigner({
                    user: null,
                    action: vientDetreBloque ? 'compte_bloque' : 'connexion_echouee',
                    ressource: 'auth',
                    id_ressource: user.id,
                    libelle: vientDetreBloque
                        ? `Compte ${user.prenom} ${user.nom} (${user.matricule}) bloqué ${parametre.duree_blocage_minutes} min après ${tentatives} échecs (IP ${ip})`
                        : `Échec de connexion pour ${user.matricule} — tentative ${tentatives}/${maxTentatives} (IP ${ip})`
                });

                const tentativesRestantes = maxTentatives - tentatives;
                if (!vientDetreBloque && tentativesRestantes <= 2) {
                    return res.status(401).json({
                        message: `Matricule ou mot de passe incorrect. Attention : ${tentativesRestantes} tentative(s) restante(s) avant blocage temporaire du compte.`
                    });
                }
            } else {
                await consigner({
                    user: null,
                    action: 'connexion_echouee',
                    ressource: 'auth',
                    id_ressource: null,
                    libelle: `Échec de connexion : matricule "${matricule}" inconnu (IP ${ip})`
                });
            }

            return res.status(401).json({ message: 'Matricule ou mot de passe incorrect.' });
        }

        // Connexion réussie : on lève les compteurs de blocage (matricule + IP).
        reinitialiserIp(ip);
        if (user.tentatives_echouees > 0 || user.bloque_jusqu_a) {
            await user.update({ tentatives_echouees: 0, bloque_jusqu_a: null });
        }

        const totpDispo = parametre.totp_disponible !== false;
        const totpOblig = !!parametre.totp_obligatoire;
        const userTotpActif = !!user.totp_actif && !!user.totp_secret;

        // Ordre des facteurs (cumulatifs, jamais exclusifs) :
        // 1) mot de passe  2) TOTP app si actif  3) code e-mail si actif dans préférences
        // 2FA activé pour ce compte, ou obligatoire globalement
        if (totpDispo && (userTotpActif || totpOblig)) {
            if (totpOblig && !userTotpActif) {
                // Connexion autorisée mais devra configurer 2FA (flag session)
                req.session.userId = user.id;
                req.session.cookie.maxAge = parametre.session_duree_heures * 60 * 60 * 1000;
                req.session.doit_configurer_2fa = true;
            } else if (userTotpActif) {
                req.session.pending2faUserId = user.id;
                req.session.pending2faExpire = Date.now() + 5 * 60 * 1000;
                return res.json({
                    message: 'Code d\'authentification à deux facteurs requis.',
                    needs_2fa: true
                });
            }
        }

        if (!req.session.userId) {
            // 3ᵉ facteur si activé globalement
            // Code e-mail (choix personnel dans Mon profil)
            let prefs = user.preferences || {};
            if (typeof prefs === 'string') { try { prefs = JSON.parse(prefs); } catch { prefs = {}; } }
            if (prefs.auth_code_actif) {
                return demarrerAuthEmail(req, res, user);
            }
            req.session.userId = user.id;
            req.session.cookie.maxAge = parametre.session_duree_heures * 60 * 60 * 1000;

        // Détection multi-session (même compte sur un autre appareil)
        try {
            const fp = req.sessionID || req.session.id || null;
            const prev = user.session_active_id || null;
            if (prev && fp && prev !== fp) {
                const { consigner } = require('../utils/journal');
                const { Notification, Utilisateur, Role } = require('../models');
                await consigner({
                    user,
                    action: 'connexion',
                    ressource: 'session',
                    id_ressource: user.id,
                    libelle: `Connexion concurrente détectée pour ${user.matricule} (nouvelle session alors qu'une autre était active)`
                }).catch(() => {});
                // Notifier l'utilisateur
                await Notification.create({
                    id_user: user.id,
                    message: 'Une nouvelle connexion à votre compte a été détectée depuis un autre appareil ou navigateur. Si ce n\'est pas vous, changez votre mot de passe.',
                    type: 'securite',
                    lu: false
                }).catch(() => {});
                // Notifier les admins (journal + notification)
                const admins = await Utilisateur.findAll({
                    include: [{ model: Role, where: { abbreviation: 'ADMIN' }, required: true }]
                }).catch(() => []);
                for (const admin of (admins || [])) {
                    if (admin.id === user.id) continue;
                    await Notification.create({
                        id_user: admin.id,
                        message: `Connexion concurrente : ${user.prenom} ${user.nom} (${user.matricule}) s'est connecté alors qu'une autre session était active.`,
                        type: 'securite',
                        lu: false
                    }).catch(() => {});
                }
            }
            if (fp) {
                await user.update({ session_active_id: fp }).catch(() => {});
            }
        } catch (e) {
            console.warn('[session] détection multi-session:', e.message);
        }

        }

        await consigner({
            user,
            action: 'connexion',
            ressource: 'auth',
            id_ressource: user.id,
            libelle: `Connexion de ${user.prenom} ${user.nom} (${user.matricule})`
        });

        const userSansMdp = user.toJSON();
        delete userSansMdp.mot_de_passe;
        delete userSansMdp.totp_secret;
        if (userSansMdp.preferences && typeof userSansMdp.preferences === 'string') {
            try { userSansMdp.preferences = JSON.parse(userSansMdp.preferences); } catch { userSansMdp.preferences = { theme: 'clair', langue: 'fr' }; }
        }
        if (!userSansMdp.preferences || typeof userSansMdp.preferences !== 'object') {
            userSansMdp.preferences = { theme: 'clair', langue: 'fr' };
        }
        userSansMdp.totp_actif = !!user.totp_actif;

        return res.json({
            message: 'Connexion réussie.',
            user: userSansMdp,
            doit_configurer_2fa: !!req.session.doit_configurer_2fa
        });
    } catch (err) {
        next(err);
    }
}

function logout(req, res, next) {
    const user = req.currentUser || null;
    req.session.destroy(async (err) => {
        if (err) return next(err);
        if (user) {
            await consigner({
                user,
                action: 'deconnexion',
                ressource: 'auth',
                id_ressource: user.id,
                libelle: `Déconnexion de ${user.prenom} ${user.nom} (${user.matricule})`
            });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'Déconnecté.' });
    });
}

async function me(req, res) {
    const u = req.currentUser && req.currentUser.toJSON ? req.currentUser.toJSON() : { ...req.currentUser };
    delete u.mot_de_passe;
    delete u.totp_secret;
    res.json({ user: u });
}

// Changement de mot de passe par l'utilisateur lui-même : à froid (menu
// "Mon compte") ou forcé après une connexion avec le mot de passe par
// défaut (doit_changer_mdp = true). On exige toujours l'ancien mot de passe,
// y compris dans le cas forcé (c'est précisément celui par défaut qu'il
// vient de taper pour se connecter) — évite qu'une session volée change le
// mot de passe sans le connaître. Le nouveau mot de passe est validé selon
// la politique configurée dans les réglages généraux.
async function changerMotDePasse(req, res, next) {
    try {
        const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;

        if (!ancien_mot_de_passe || !nouveau_mot_de_passe) {
            return res.status(400).json({ message: "L'ancien et le nouveau mot de passe sont requis." });
        }

        const parametre = await obtenirParametres();
        const { valide, message } = validerPolitiqueMotDePasse(nouveau_mot_de_passe, parametre);
        if (!valide) {
            return res.status(400).json({ message });
        }

        const user = await Utilisateur.scope('avecMotDePasse').findByPk(req.currentUser.id);
        if (!verifier(ancien_mot_de_passe, user.mot_de_passe)) {
            return res.status(401).json({ message: "L'ancien mot de passe est incorrect." });
        }

        await user.update({
            mot_de_passe: hacher(nouveau_mot_de_passe),
            doit_changer_mdp: false
        });

        await consigner({
            user: req.currentUser,
            action: 'modification',
            ressource: 'utilisateur',
            id_ressource: user.id,
            libelle: `${req.currentUser.prenom} ${req.currentUser.nom} a changé son mot de passe`
        });

        res.json({ message: 'Mot de passe modifié.' });
    } catch (err) { next(err); }
}


async function verifier2fa(req, res, next) {
    try {
        const { code } = req.body;
        const pendingId = req.session.pending2faUserId;
        const exp = req.session.pending2faExpire || 0;
        if (!pendingId || Date.now() > exp) {
            return res.status(401).json({ message: 'Session 2FA expirée. Reconnectez-vous.' });
        }
        const user = await Utilisateur.scope('avecMotDePasse').findByPk(pendingId, { include: [{ model: Role }] });
        if (!user || !user.totp_secret) {
            return res.status(401).json({ message: '2FA invalide.' });
        }
        if (!verifierTotp(user.totp_secret, code)) {
            return res.status(401).json({ message: 'Code 2FA incorrect.' });
        }
        const parametre = await obtenirParametres();
        delete req.session.pending2faUserId;
        delete req.session.pending2faExpire;
        let prefs2 = user.preferences || {};
        if (typeof prefs2 === 'string') { try { prefs2 = JSON.parse(prefs2); } catch { prefs2 = {}; } }
        if (prefs2.auth_code_actif) {
            return demarrerAuthEmail(req, res, user);
        }
        req.session.userId = user.id;
        req.session.cookie.maxAge = parametre.session_duree_heures * 60 * 60 * 1000;

        await consigner({
            user,
            action: 'connexion',
            ressource: 'auth',
            id_ressource: user.id,
            libelle: `Connexion 2FA de ${user.prenom} ${user.nom} (${user.matricule})`
        });

        const userSansMdp = user.toJSON();
        delete userSansMdp.mot_de_passe;
        delete userSansMdp.totp_secret;
        userSansMdp.totp_actif = true;
        res.json({ message: 'Connexion réussie.', user: userSansMdp });
    } catch (err) { next(err); }
}

async function setup2fa(req, res, next) {
    try {
        const parametre = await obtenirParametres();
        if (parametre.totp_disponible === false) {
            return res.status(403).json({ message: 'La 2FA est désactivée dans les réglages généraux.' });
        }
        const user = await Utilisateur.findByPk(req.currentUser.id);
        const secret = genererSecret();
        req.session.pendingTotpSecret = secret;
        const label = user.matricule || user.email || String(user.id);
        const url = otpauthUrl({ secret, label, issuer: parametre.nom_entreprise || 'GLO' });
        res.json({ secret, otpauth_url: url });
    } catch (err) { next(err); }
}

async function activer2fa(req, res, next) {
    try {
        const { code } = req.body;
        const secret = req.session.pendingTotpSecret;
        if (!secret) return res.status(400).json({ message: 'Démarrez d\'abord la configuration 2FA.' });
        if (!verifierTotp(secret, code)) {
            return res.status(400).json({ message: 'Code invalide. Vérifiez votre application d\'authentification.' });
        }
        const user = await Utilisateur.findByPk(req.currentUser.id);
        await user.update({ totp_secret: secret, totp_actif: true });
        delete req.session.pendingTotpSecret;
        delete req.session.doit_configurer_2fa;
        res.json({ message: 'Authentification à deux facteurs activée.', totp_actif: true });
    } catch (err) { next(err); }
}

async function desactiver2fa(req, res, next) {
    try {
        const parametre = await obtenirParametres();
        if (parametre.totp_obligatoire) {
            return res.status(403).json({ message: 'La 2FA est obligatoire dans les réglages généraux.' });
        }
        const { code, mot_de_passe } = req.body;
        const user = await Utilisateur.scope('avecMotDePasse').findByPk(req.currentUser.id);
        if (user.totp_actif && user.totp_secret) {
            if (!verifierTotp(user.totp_secret, code)) {
                return res.status(400).json({ message: 'Code 2FA incorrect.' });
            }
        }
        if (mot_de_passe && !verifier(mot_de_passe, user.mot_de_passe)) {
            return res.status(400).json({ message: 'Mot de passe incorrect.' });
        }
        await user.update({ totp_secret: null, totp_actif: false });
        res.json({ message: '2FA désactivée.', totp_actif: false });
    } catch (err) { next(err); }
}


async function verifierCodeEmail(req, res, next) {
    try {
        const pendingId = req.session.pendingAuthEmailUserId;
        const exp = req.session.pendingAuthEmailExpire || 0;
        const expected = req.session.pendingAuthEmailCode;
        if (!pendingId || Date.now() > exp) {
            return res.status(401).json({ message: 'Code expiré. Reconnectez-vous.' });
        }
        const code = String(req.body.code || '').trim();
        if (!code || code !== String(expected)) {
            return res.status(401).json({ message: 'Code incorrect.' });
        }
        const { Utilisateur, Role } = require('../models');
        const user = await Utilisateur.scope('avecMotDePasse').findByPk(pendingId, {
            include: [{ model: Role }, { model: Role, as: 'Roles' }]
        });
        if (!user) return res.status(401).json({ message: 'Utilisateur introuvable.' });

        delete req.session.pendingAuthEmailUserId;
        delete req.session.pendingAuthEmailExpire;
        delete req.session.pendingAuthEmailCode;
        req.session.userId = user.id;

        const { consigner } = require('../utils/journal');
        await consigner({
            user,
            action: 'connexion',
            ressource: 'auth',
            libelle: `3ᵉ authentification validée pour ${user.matricule}`
        }).catch(() => {});

        res.json({ message: 'Authentification complète.', ok: true });
    } catch (err) { next(err); }
}

module.exports = { login, logout, me, changerMotDePasse, verifier2fa, setup2fa, activer2fa, desactiver2fa, verifierCodeEmail };

