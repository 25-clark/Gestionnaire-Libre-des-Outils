const { Utilisateur, Role, Parametre } = require('../models');
const { verifier, hacher, validerPolitiqueMotDePasse } = require('../utils/motDePasse');
const { consigner } = require('../utils/journal');
const { verifierBlocageIp, enregistrerEchecIp, reinitialiserIp } = require('../utils/limiteurIp');

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

        req.session.userId = user.id;
        // Durée de session configurable (Réglages généraux), appliquée à
        // CETTE session — pas besoin de redémarrer le serveur pour qu'un
        // changement prenne effet.
        req.session.cookie.maxAge = parametre.session_duree_heures * 60 * 60 * 1000;

        await consigner({
            user,
            action: 'connexion',
            ressource: 'auth',
            id_ressource: user.id,
            libelle: `Connexion de ${user.prenom} ${user.nom} (${user.matricule})`
        });

        const userSansMdp = user.toJSON();
        delete userSansMdp.mot_de_passe;

        return res.json({
            message: 'Connexion réussie.',
            user: userSansMdp
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
    res.json({ user: req.currentUser });
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

module.exports = { login, logout, me, changerMotDePasse };
