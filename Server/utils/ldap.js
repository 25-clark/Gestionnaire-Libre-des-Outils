// Intégration LDAP — nécessite le paquet npm "ldapjs", qui n'a PAS pu être
// installé dans cet environnement de développement (pas d'accès réseau ici).
// Le module est chargé de façon défensive : si absent, chaque fonction
// renvoie une erreur claire plutôt que de faire planter le serveur. Dès que
// `npm install ldapjs` est exécuté dans Server/ (sur une machine avec accès
// réseau), tout ce fichier fonctionne tel quel, sans modification.
let ldapjs = null;
try {
    ldapjs = require('ldapjs');
} catch {
    ldapjs = null;
}

function estDisponible() {
    return !!ldapjs;
}

function verifierDisponibilite() {
    if (!ldapjs) {
        const err = new Error(
            "Le module 'ldapjs' n'est pas installé sur ce serveur. Exécutez `npm install ldapjs` dans le dossier Server/, puis relancez le serveur."
        );
        err.code = 'LDAPJS_INDISPONIBLE';
        throw err;
    }
}

function creerClient(config) {
    verifierDisponibilite();
    if (!config.ldap_url) {
        throw new Error("L'URL du serveur LDAP n'est pas configurée (Réglages > LDAP).");
    }
    return ldapjs.createClient({ url: config.ldap_url, timeout: 8000, connectTimeout: 8000 });
}

function bind(client, dn, motDePasse) {
    return new Promise((resolve, reject) => {
        client.bind(dn, motDePasse, (err) => (err ? reject(err) : resolve()));
    });
}

function rechercher(client, base, options) {
    return new Promise((resolve, reject) => {
        if (!base) return reject(new Error('Base de recherche LDAP manquante.'));
        const resultats = [];
        client.search(base, options, (err, res) => {
            if (err) return reject(err);
            res.on('searchEntry', (entree) => {
                // ldapjs >= 2 expose .pojo (objet simple), les versions plus
                // anciennes exposent .object directement.
                resultats.push(entree.pojo ? aplatirPojo(entree.pojo) : entree.object);
            });
            res.on('error', (errRecherche) => reject(errRecherche));
            res.on('end', () => resolve(resultats));
        });
    });
}

// ldapjs v2+ renvoie les attributs sous forme de tableau [{type, values}],
// on les remet à plat en { type: valeur } pour rester simple à consommer.
function aplatirPojo(pojo) {
    const objet = { dn: pojo.objectName };
    (pojo.attributes || []).forEach((attr) => {
        objet[attr.type] = attr.values.length > 1 ? attr.values : attr.values[0];
    });
    return objet;
}

function extraireAttribut(entree, nomAttribut) {
    if (!nomAttribut || !entree) return null;
    const valeur = entree[nomAttribut];
    if (Array.isArray(valeur)) return valeur[0] || null;
    return valeur || null;
}

async function testerConnexion(config) {
    verifierDisponibilite();
    const client = creerClient(config);
    try {
        await bind(client, config.ldap_bind_dn, config.ldap_bind_password);
        return { ok: true, message: 'Connexion et authentification au serveur LDAP réussies.' };
    } finally {
        client.unbind(() => {});
    }
}

async function rechercherUtilisateursLdap(config) {
    verifierDisponibilite();
    const client = creerClient(config);
    try {
        await bind(client, config.ldap_bind_dn, config.ldap_bind_password);
        const entrees = await rechercher(client, config.ldap_base_dn_utilisateurs, {
            scope: 'sub',
            filter: config.ldap_filtre_utilisateurs || '(objectClass=person)',
            attributes: [config.ldap_attribut_matricule, config.ldap_attribut_nom, config.ldap_attribut_prenom]
        });

        return entrees
            .map((e) => ({
                matricule: extraireAttribut(e, config.ldap_attribut_matricule),
                nom: extraireAttribut(e, config.ldap_attribut_nom),
                prenom: extraireAttribut(e, config.ldap_attribut_prenom)
            }))
            .filter((u) => u.matricule);
    } finally {
        client.unbind(() => {});
    }
}

// Groupes racine (activités) + pour chacun, ses sous-groupes directs
// (sous-activités), recherchés sous le DN du groupe parent.
async function rechercherGroupesLdap(config) {
    verifierDisponibilite();
    const client = creerClient(config);
    try {
        await bind(client, config.ldap_bind_dn, config.ldap_bind_password);
        const groupesRacine = await rechercher(client, config.ldap_base_dn_groupes, {
            scope: 'one',
            filter: config.ldap_filtre_groupes || '(objectClass=groupOfNames)',
            attributes: [config.ldap_attribut_groupe_nom]
        });

        const groupes = [];
        for (const g of groupesRacine) {
            const nom = extraireAttribut(g, config.ldap_attribut_groupe_nom);
            if (!nom || !g.dn) continue;

            let sousGroupes = [];
            try {
                const entreesEnfants = await rechercher(client, g.dn, {
                    scope: 'one',
                    filter: config.ldap_filtre_sous_groupes || '(objectClass=groupOfNames)',
                    attributes: [config.ldap_attribut_groupe_nom]
                });
                sousGroupes = entreesEnfants
                    .map((sg) => extraireAttribut(sg, config.ldap_attribut_groupe_nom))
                    .filter(Boolean);
            } catch {
                // Pas de sous-arborescence sous ce groupe (ou base invalide pour la recherche
                // imbriquée) : on continue sans bloquer l'import de l'activité elle-même.
            }

            groupes.push({ nom, dn: g.dn, sousGroupes });
        }

        return groupes;
    } finally {
        client.unbind(() => {});
    }
}

module.exports = {
    estDisponible,
    testerConnexion,
    rechercherUtilisateursLdap,
    rechercherGroupesLdap
};
