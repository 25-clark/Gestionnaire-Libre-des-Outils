/**
 * Traductions légères FR/EN pour l'Interface.
 * Usage : const t = creerTraducteur(langue); t('nav.dashboard')
 */
const DICT = {
    fr: {
        'nav.dashboard': 'Tableau de bord',
        'nav.assistance': 'Assistance',
        'nav.administration': 'Administration',
        'nav.tickets': 'Tickets',
        'nav.diagnostic': 'Diagnostic réseau',
        'nav.roles': 'Rôles',
        'nav.access': 'Accès particuliers',
        'nav.journal': 'Journal',
        'nav.stats': 'Statistiques',
        'nav.ldap': 'LDAP',
        'nav.settings': 'Réglages généraux',
        'nav.help': 'Aide',
        'nav.search': 'Rechercher…',
        'nav.notifications': 'Notifications',
        'nav.profile': 'Mon profil',
        'nav.preferences': 'Préférences',
        'nav.logout': 'Se déconnecter'
    },
    en: {
        'nav.dashboard': 'Dashboard',
        'nav.assistance': 'Support desk',
        'nav.administration': 'Administration',
        'nav.tickets': 'Tickets',
        'nav.diagnostic': 'Network diagnostic',
        'nav.roles': 'Roles',
        'nav.access': 'Special access',
        'nav.journal': 'Audit log',
        'nav.stats': 'Statistics',
        'nav.ldap': 'LDAP',
        'nav.settings': 'General settings',
        'nav.help': 'Help',
        'nav.search': 'Search…',
        'nav.notifications': 'Notifications',
        'nav.profile': 'My profile',
        'nav.preferences': 'Preferences',
        'nav.logout': 'Sign out'
    }
};

function creerTraducteur(langue) {
    const lang = langue === 'en' ? 'en' : 'fr';
    const table = DICT[lang] || DICT.fr;
    return function t(key) {
        return table[key] || DICT.fr[key] || key;
    };
}

/** Conserve toutes les clés de préférences (ne pas écraser theme/langue seuls). */
function normaliserPreferences(prefs) {
    const defaut = {
        theme: 'clair',
        langue: 'fr',
        densite: 'confortable',
        vue_outils_defaut: 'liste',
        par_page_defaut: 25,
        auth_code_actif: false,
        notif_son: false,
        notif_badge: true,
        notif_resume: 'tous',
        filtres_tickets_persist: true,
        ouvrir_outil_nouvel_onglet: true,
        masquer_creds_defaut: true,
        confirmer_avant_quitter: false,
        menu_compact: false,
        rappel_session: false,
        export_format_pref: 'csv',
        export_filtres_seuls: true,
        raccourci_ctrl_k: true,
        raccourci_aide: true
    };
    if (!prefs) return { ...defaut };
    if (typeof prefs === 'string') {
        try { prefs = JSON.parse(prefs); } catch { return { ...defaut }; }
    }
    if (typeof prefs !== 'object' || Array.isArray(prefs)) return { ...defaut };

    const out = { ...defaut, ...prefs };
    let theme = String(out.theme || 'clair');
    if (theme === 'auto') theme = 'systeme';
    if (!['clair', 'sombre', 'systeme'].includes(theme)) theme = 'clair';
    out.theme = theme;
    out.langue = ['fr', 'en'].includes(out.langue) ? out.langue : 'fr';
    out.densite = out.densite === 'compact' ? 'compact' : 'confortable';
    out.vue_outils_defaut = ['liste', 'cartes', 'vignettes'].includes(out.vue_outils_defaut)
        ? out.vue_outils_defaut : 'liste';
    const pp = parseInt(out.par_page_defaut, 10);
    out.par_page_defaut = [10, 25, 50, 100].includes(pp) ? pp : 25;

    const boolKeys = [
        'auth_code_actif', 'notif_son', 'notif_badge', 'filtres_tickets_persist',
        'ouvrir_outil_nouvel_onglet', 'masquer_creds_defaut', 'confirmer_avant_quitter',
        'menu_compact', 'rappel_session', 'export_filtres_seuls',
        'raccourci_ctrl_k', 'raccourci_aide'
    ];
    for (const k of boolKeys) {
        const v = out[k];
        out[k] = v === true || v === 'true' || v === '1' || v === 1 || v === 'on';
    }
    return out;
}

module.exports = { creerTraducteur, normaliserPreferences, DICT };
