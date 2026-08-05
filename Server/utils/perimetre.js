const { UtilisateurActivite, UtilisateurSousActivite, SousActivite } = require('../models');

function isAdmin(user) {
    return !!user && !!user.Role && user.Role.abbreviation === 'ADMIN';
}

/**
 * Calcule le périmètre d'accès d'un utilisateur : quelles activités et
 * quelles sous-activités il a le droit de voir/utiliser, indépendamment
 * des permissions CRUD de son rôle (qui disent CE QU'IL PEUT FAIRE ; ceci
 * dit OÙ il peut le faire).
 *
 * Règles :
 * - Un admin voit tout (toutAcces = true, pas de filtrage).
 * - Un utilisateur voit toujours son activité principale (id_activite) et
 *   toute son arborescence de sous-activités.
 * - Un utilisateur voit en plus toute activité pour laquelle un admin lui
 *   a accordé un accès particulier (UtilisateurActivite), en entier.
 * - Un utilisateur voit une sous-activité précise (même hors de son
 *   activité principale) si un admin la lui a accordée directement
 *   (UtilisateurSousActivite) — l'accès inclut alors ses sous-activités
 *   enfants (comme un dossier partagé) et la chaîne de ses parents
 *   (nécessaire pour la navigation / le fil d'ariane), mais pas le reste
 *   de l'activité.
 * - Sans aucune de ces conditions (pas d'activité principale correspondante,
 *   pas d'accès accordé via l'onglet "Utilisateurs"), l'activité ou la
 *   sous-activité n'apparaît nulle part : ni sur le tableau de bord, ni en
 *   accès direct.
 */
async function getPerimetreAcces(user) {
    if (isAdmin(user)) {
        return { toutAcces: true, activiteIds: null, sousActiviteIds: null };
    }

    const activiteIds = new Set();
    if (user.id_activite) activiteIds.add(user.id_activite);

    const accesActivites = await UtilisateurActivite.findAll({ where: { id_user: user.id } });
    accesActivites.forEach(a => activiteIds.add(a.id_activite));

    // Toutes les sous-activités existantes, chargées une seule fois pour
    // reconstruire les chaînes parent/enfant sans multiplier les requêtes.
    const toutesSousActivites = await SousActivite.findAll();
    const parId = new Map(toutesSousActivites.map(sa => [sa.id, sa]));

    const sousActiviteIds = new Set();

    // 1) Toute sous-activité appartenant à une activité déjà accessible en
    //    entier (activité principale ou accès accordé).
    toutesSousActivites.forEach(sa => {
        if (activiteIds.has(sa.id_activite)) sousActiviteIds.add(sa.id);
    });

    // 2) Accès particuliers sur des sous-activités précises, en dehors de
    //    l'activité principale de l'utilisateur.
    const accesSousActivites = await UtilisateurSousActivite.findAll({ where: { id_user: user.id } });

    for (const acces of accesSousActivites) {
        const depart = parId.get(acces.id_sous_activite);
        if (!depart) continue;

        // La sous-activité accordée + toute sa descendance.
        const pile = [depart];
        while (pile.length) {
            const courant = pile.pop();
            sousActiviteIds.add(courant.id);
            toutesSousActivites
                .filter(sa => sa.id_parent === courant.id)
                .forEach(enfant => pile.push(enfant));
        }

        // Remonte la chaîne des parents pour permettre la navigation
        // (fil d'ariane) jusqu'à la sous-activité accordée, et rend
        // l'activité racine visible sur le tableau de bord.
        let parentCourant = parId.get(depart.id_parent);
        while (parentCourant) {
            sousActiviteIds.add(parentCourant.id);
            parentCourant = parId.get(parentCourant.id_parent);
        }
        activiteIds.add(depart.id_activite);
    }

    return { toutAcces: false, activiteIds, sousActiviteIds };
}

module.exports = { getPerimetreAcces, isAdmin };
