const { Utilisateur, Role } = require('../models');
const { verifier, hacher } = require('../utils/motDePasse');
const { consigner } = require('../utils/journal');

// Connexion par matricule + mot de passe. Si le mot de passe est celui par
// défaut (doit_changer_mdp = true), le client (Interface) doit rediriger
// vers le changement de mot de passe avant de laisser continuer.
async function login(req, res, next) {
    try {
        const { matricule, mot_de_passe } = req.body;

        if (!matricule || !mot_de_passe) {
            return res.status(400).json({ message: 'Le matricule et le mot de passe sont requis.' });
        }

        const user = await Utilisateur.scope('avecMotDePasse').findOne({
            where: { matricule },
            include: [{ model: Role }]
        });

        if (!user || !verifier(mot_de_passe, user.mot_de_passe)) {
            return res.status(401).json({ message: 'Matricule ou mot de passe incorrect.' });
        }

        req.session.userId = user.id;

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
// mot de passe sans le connaître.
async function changerMotDePasse(req, res, next) {
    try {
        const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;

        if (!ancien_mot_de_passe || !nouveau_mot_de_passe) {
            return res.status(400).json({ message: "L'ancien et le nouveau mot de passe sont requis." });
        }
        if (nouveau_mot_de_passe.length < 6) {
            return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
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
