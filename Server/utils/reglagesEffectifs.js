/**
 * Fusion des réglages : Global → Activité → Sous-activité.
 * Règle d'or : un niveau enfant ne peut QUE renforcer (restreindre),
 * jamais assouplir une contrainte posée par un parent / les Réglages généraux.
 */
const { Parametre } = require('../models');

const DEFAUT_GLOBAL = {
    credentials_actifs: false,
    surveillance_active: true,
    mdp_longueur_min: 6,
    mdp_complexite: false,
    max_tentatives_connexion: 5,
    // Politiques métier (global = autorisé par défaut si non défini ailleurs)
    tickets_actifs: true,
    partage_outils: true,
    export_autorise: true,
    diagnostic_actif: true
};

function normaliserLocal(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { return {}; }
    }
    if (typeof raw !== 'object') return {};
    return raw;
}

/**
 * Pour un booléen "fonctionnalité autorisée" :
 * - global false → toujours false (enfant ne peut pas activer)
 * - global true → enfant peut mettre false (désactiver localement) ou true/null (hériter)
 */
function fusionAutorisation(valeurGlobale, valeurLocale) {
    if (!valeurGlobale) return false;
    if (valeurLocale === false) return false;
    if (valeurLocale === true) return true;
    return true; // null / undefined → hérite = autorisé
}

/**
 * Complexité MDP : global true impose true partout.
 * Global false → local peut forcer true (plus strict).
 */
function fusionComplexite(globalOn, localVal) {
    if (globalOn) return true;
    if (localVal === true) return true;
    return false;
}

/**
 * Longueur min MDP : on prend le MAX (plus strict).
 */
function fusionLongueurMin(globalMin, localMin) {
    const g = parseInt(globalMin, 10) || DEFAUT_GLOBAL.mdp_longueur_min;
    if (localMin === null || localMin === undefined || localMin === '') return g;
    const l = parseInt(localMin, 10);
    if (Number.isNaN(l)) return g;
    return Math.max(g, l);
}

/**
 * Tentatives max : on prend le MIN (plus strict), plancher 3.
 */
function fusionMaxTentatives(globalMax, localMax) {
    const g = parseInt(globalMax, 10) || DEFAUT_GLOBAL.max_tentatives_connexion;
    if (localMax === null || localMax === undefined || localMax === '') return g;
    const l = parseInt(localMax, 10);
    if (Number.isNaN(l)) return g;
    return Math.max(3, Math.min(g, l));
}

async function chargerGlobal() {
    const [p] = await Parametre.findOrCreate({ where: { id: 1 }, defaults: {} });
    return {
        credentials_actifs: !!p.credentials_actifs,
        surveillance_active: p.surveillance_active !== false,
        mdp_longueur_min: p.mdp_longueur_min ?? DEFAUT_GLOBAL.mdp_longueur_min,
        mdp_complexite: !!p.mdp_complexite,
        max_tentatives_connexion: p.max_tentatives_connexion ?? DEFAUT_GLOBAL.max_tentatives_connexion,
        tickets_actifs: true,
        partage_outils: true,
        export_autorise: true,
        diagnostic_actif: true,
        message_info: null
    };
}

/**
 * @param {object|null} reglagesActivite
 * @param {object|null} reglagesSousActivite
 * @returns {Promise<object>} réglages effectifs + métadonnées d'héritage
 */
async function reglagesEffectifs(reglagesActivite = null, reglagesSousActivite = null) {
    const global = await chargerGlobal();
    const act = normaliserLocal(reglagesActivite);
    const sous = normaliserLocal(reglagesSousActivite);

    // Fusion activité sur global
    let cur = {
        credentials_actifs: fusionAutorisation(global.credentials_actifs, act.credentials_actifs),
        surveillance_active: fusionAutorisation(global.surveillance_active, act.surveillance_active),
        tickets_actifs: fusionAutorisation(global.tickets_actifs, act.tickets_actifs),
        partage_outils: fusionAutorisation(global.partage_outils, act.partage_outils),
        export_autorise: fusionAutorisation(global.export_autorise, act.export_autorise),
        diagnostic_actif: fusionAutorisation(global.diagnostic_actif, act.diagnostic_actif),
        mdp_complexite: fusionComplexite(global.mdp_complexite, act.mdp_complexite),
        mdp_longueur_min: fusionLongueurMin(global.mdp_longueur_min, act.mdp_longueur_min),
        max_tentatives_connexion: fusionMaxTentatives(global.max_tentatives_connexion, act.max_tentatives_connexion),
        message_info: act.message_info || null
    };

    // Fusion sous-activité sur activité
    if (reglagesSousActivite !== null && reglagesSousActivite !== undefined) {
        cur = {
            credentials_actifs: fusionAutorisation(cur.credentials_actifs, sous.credentials_actifs),
            surveillance_active: fusionAutorisation(cur.surveillance_active, sous.surveillance_active),
            tickets_actifs: fusionAutorisation(cur.tickets_actifs, sous.tickets_actifs),
            partage_outils: fusionAutorisation(cur.partage_outils, sous.partage_outils),
            export_autorise: fusionAutorisation(cur.export_autorise, sous.export_autorise),
            diagnostic_actif: fusionAutorisation(cur.diagnostic_actif, sous.diagnostic_actif),
            mdp_complexite: fusionComplexite(cur.mdp_complexite, sous.mdp_complexite),
            mdp_longueur_min: fusionLongueurMin(cur.mdp_longueur_min, sous.mdp_longueur_min),
            max_tentatives_connexion: fusionMaxTentatives(cur.max_tentatives_connexion, sous.max_tentatives_connexion),
            message_info: sous.message_info || cur.message_info || null
        };
    }

    return {
        global,
        effectifs: cur,
        locaux_activite: act,
        locaux_sous_activite: sous
    };
}

/**
 * Valide et normalise un payload de réglages locaux avant sauvegarde.
 * Ignore / corrige toute tentative d'assouplir le global.
 */
async function normaliserPourSauvegarde(payload) {
    const global = await chargerGlobal();
    const src = normaliserLocal(payload);
    const out = {};

    // Booléens : on stocke true / false / null (hériter)
    const boolKeys = [
        'credentials_actifs', 'surveillance_active', 'tickets_actifs',
        'partage_outils', 'export_autorise', 'diagnostic_actif', 'mdp_complexite'
    ];
    for (const k of boolKeys) {
        if (src[k] === undefined || src[k] === '' || src[k] === 'inherit') {
            out[k] = null;
            continue;
        }
        const v = src[k] === true || src[k] === 'true' || src[k] === 'on' || src[k] === '1';
        const falseV = src[k] === false || src[k] === 'false' || src[k] === '0';

        if (k === 'mdp_complexite') {
            // Ne peut pas désactiver si global impose
            if (global.mdp_complexite && falseV) out[k] = null; // hérite = true effectif
            else if (v) out[k] = true;
            else if (falseV) out[k] = false;
            else out[k] = null;
            continue;
        }

        // Fonctionnalités : impossible d'activer si global off → on force null (héritage false)
        const globalKey = k;
        if (k === 'credentials_actifs' && !global.credentials_actifs && v) {
            out[k] = null;
            continue;
        }
        if (k === 'surveillance_active' && !global.surveillance_active && v) {
            out[k] = null;
            continue;
        }
        if (v) out[k] = true;
        else if (falseV) out[k] = false;
        else out[k] = null;
    }

    if (src.mdp_longueur_min !== undefined && src.mdp_longueur_min !== '') {
        const l = parseInt(src.mdp_longueur_min, 10);
        if (!Number.isNaN(l)) {
            out.mdp_longueur_min = Math.max(global.mdp_longueur_min || 6, Math.min(32, l));
        } else {
            out.mdp_longueur_min = null;
        }
    } else {
        out.mdp_longueur_min = null;
    }

    if (src.max_tentatives_connexion !== undefined && src.max_tentatives_connexion !== '') {
        const l = parseInt(src.max_tentatives_connexion, 10);
        if (!Number.isNaN(l)) {
            out.max_tentatives_connexion = Math.max(3, Math.min(global.max_tentatives_connexion || 5, l));
        } else {
            out.max_tentatives_connexion = null;
        }
    } else {
        out.max_tentatives_connexion = null;
    }

    out.message_info = src.message_info ? String(src.message_info).slice(0, 500) : null;

    return out;
}

module.exports = {
    reglagesEffectifs,
    normaliserPourSauvegarde,
    chargerGlobal,
    DEFAUT_GLOBAL
};
