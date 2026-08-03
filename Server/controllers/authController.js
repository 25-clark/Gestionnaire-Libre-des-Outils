const { Utilisateur, Role } = require('../models');

// Connexion simple par matricule (outil interne, pas de mot de passe).
// À sécuriser davantage si l'app devient accessible depuis l'extérieur
// (ajout d'un mot de passe / SSO).
async function login(req, res, next) {
    try {
        const { matricule } = req.body;

        if (!matricule) {
            return res.status(400).json({ message: 'Le matricule est requis.' });
        }

        const user = await Utilisateur.findOne({
            where: { matricule },
            include: [{ model: Role }]
        });

        if (!user) {
            return res.status(401).json({ message: 'Matricule inconnu.' });
        }

        req.session.userId = user.id;

        return res.json({
            message: 'Connexion réussie.',
            user
        });
    } catch (err) {
        next(err);
    }
}

function logout(req, res, next) {
    req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie('connect.sid');
        res.json({ message: 'Déconnecté.' });
    });
}

async function me(req, res) {
    res.json({ user: req.currentUser });
}

module.exports = { login, logout, me };
