const { Op } = require('sequelize');
const { Outil, Parametre, OutilHistoriqueStatut } = require('../models');
const { pingSimple } = require('./ping');
const { consigner } = require('./journal');
const { notifier } = require('./notification');

let cycleEnCours = false;
let minuteur = null;

async function obtenirParametres() {
    const [parametre] = await Parametre.findOrCreate({ where: { id: 1 }, defaults: {} });
    return parametre;
}

/**
 * Vérifie tous les outils ayant une adresse renseignée, met à jour leur
 * statut, et journalise UNIQUEMENT les changements d'état (pas chaque
 * vérification) dans OutilHistoriqueStatut + le Journal général.
 * Exportée séparément pour pouvoir être déclenchée manuellement
 * ("Vérifier maintenant" sur un outil) sans attendre le cycle automatique.
 */
async function verifierTousLesOutils() {
    if (cycleEnCours) return; // évite un chevauchement si un cycle précédent traîne encore
    cycleEnCours = true;

    try {
        const outils = await Outil.findAll({ where: { adresse: { [Op.ne]: null } } });
        for (const outil of outils) {
            await verifierUnOutil(outil);
        }
    } catch (err) {
        console.error('[surveillance] erreur pendant le cycle :', err.message);
    } finally {
        cycleEnCours = false;
    }
}

/**
 * Vérifie un seul outil (utilisé aussi bien par le cycle automatique que
 * par le bouton "Vérifier maintenant" côté outilController).
 */
async function verifierUnOutil(outil) {
    if (!outil.adresse) return outil;

    const enLigne = await pingSimple(outil.adresse);
    const nouveauStatut = enLigne ? 'en_ligne' : 'hors_ligne';
    const ancienStatut = outil.dernier_statut;

    await outil.update({
        dernier_statut: nouveauStatut,
        derniere_verification: new Date()
    });

    // On garde une trace de l'état initial ET de chaque changement, mais pas
    // des vérifications répétées qui ne changent rien (sinon la table grossit
    // sans apporter d'information).
    if (ancienStatut !== nouveauStatut) {
        await OutilHistoriqueStatut.create({ id_outil: outil.id, statut: nouveauStatut });

        // "changement_statut" uniquement pour un vrai changement (pas la
        // toute première vérification, où il n'y a rien à "changer").
        if (ancienStatut !== 'inconnu') {
            await consigner({
                user: null,
                action: 'changement_statut',
                ressource: 'outil',
                id_ressource: outil.id,
                libelle: `Outil "${outil.nom}" passé ${enLigne ? 'en ligne 🟢' : 'hors ligne 🔴'} (${outil.adresse})`
            });

            // On ne notifie que le passage hors ligne (c'est ce qui nécessite
            // une action), pas le retour en ligne, pour ne pas noyer le
            // propriétaire de notifications à chaque va-et-vient.
            if (!enLigne && outil.id_user) {
                await notifier({
                    id_user: outil.id_user,
                    type: 'alerte',
                    message: `Votre outil "${outil.nom}" (${outil.adresse}) ne répond plus.`
                });
            }
        }
    }

    return outil;
}

/**
 * Démarre le planificateur en arrière-plan. Relit l'intervalle et
 * l'activation à chaque cycle (via Parametre), pour qu'un changement dans
 * Réglages généraux prenne effet sans redémarrer le serveur.
 */
function demarrerSurveillance() {
    const planifierProchainCycle = async () => {
        try {
            const parametre = await obtenirParametres();
            if (parametre.surveillance_active) {
                await verifierTousLesOutils();
            }
            const intervalleMs = Math.max(parametre.surveillance_intervalle_minutes, 1) * 60 * 1000;
            minuteur = setTimeout(planifierProchainCycle, intervalleMs);
            minuteur.unref(); // ne doit jamais empêcher le process de s'arrêter
        } catch (err) {
            console.error('[surveillance] erreur de planification :', err.message);
            // On retente dans 5 minutes plutôt que d'abandonner définitivement.
            minuteur = setTimeout(planifierProchainCycle, 5 * 60 * 1000);
            minuteur.unref();
        }
    };

    // Premier cycle décalé de 30s après le démarrage, le temps que le
    // serveur (et la connexion base de données) se stabilise.
    minuteur = setTimeout(planifierProchainCycle, 30 * 1000);
    minuteur.unref();

    console.log('Surveillance réseau automatique activée (premier cycle dans 30s).');
}

module.exports = { demarrerSurveillance, verifierTousLesOutils, verifierUnOutil };
