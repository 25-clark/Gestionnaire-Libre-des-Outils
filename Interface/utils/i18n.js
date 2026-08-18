/**
 * Traductions minimales FR / EN pour l'interface.
 * Usage : const t = creerTraducteur(langue); t('nav.dashboard')
 */
const DICT = {
    fr: {
        'nav.dashboard': 'Tableau de bord',
        'nav.assistance': 'Assistance',
        'nav.administration': 'Administration',
        'nav.security': 'Administration',
        'nav.roles': 'Rôles et permissions',
        'nav.access': "Droits d'accès",
        'nav.settings': 'Paramètres généraux',
        'nav.stats': 'Statistiques',
        'nav.ldap': 'Annuaire LDAP',
        'nav.journal': "Journal d'audit",
        'nav.diagnostic': 'Diagnostic réseau',
        'nav.tickets': 'Demandes et tickets',
        'nav.notifications': 'Notifications',
        'nav.profile': 'Mon profil',
        'nav.logout': 'Se déconnecter',
        'nav.search': 'Rechercher une activité, un outil, un ticket…',
        'profile.title': 'Mon profil',
        'profile.personal': 'Informations personnelles',
        'profile.prefs': 'Préférences de compte',
        'profile.email': 'Email',
        'profile.phone': 'Numéro de téléphone',
        'profile.contacts': 'Autres contacts',
        'profile.function': 'Fonction',
        'profile.address': 'Adresse',
        'profile.theme': "Thème d'affichage",
        'profile.lang': "Langue de l'interface",
        'profile.theme.light': 'Clair',
        'profile.theme.dark': 'Sombre',
        'profile.theme.auto': 'Automatique (système)',
        'profile.save.info': 'Enregistrer les infos',
        'profile.save.prefs': 'Enregistrer les préférences',
        'profile.change.password': 'Changer mon mot de passe',
        'profile.theme.hint': "Le thème s'applique immédiatement après enregistrement.",
        'profile.prefs.saved': 'Préférences enregistrées.',
        'profile.info.saved': 'Informations enregistrées.',
        'btn.cancel': 'Annuler',
        'btn.save': 'Enregistrer',
        'common.matricule': 'Matricule'
    },
    en: {
        'nav.dashboard': 'Dashboard',
        'nav.assistance': 'Support',
        'nav.administration': 'Administration',
        'nav.security': 'Administration',
        'nav.roles': 'Roles & permissions',
        'nav.access': 'Access rights',
        'nav.settings': 'General settings',
        'nav.stats': 'Statistics',
        'nav.ldap': 'LDAP directory',
        'nav.journal': 'Audit log',
        'nav.diagnostic': 'Network diagnostics',
        'nav.tickets': 'Requests & tickets',
        'nav.notifications': 'Notifications',
        'nav.profile': 'My profile',
        'nav.logout': 'Sign out',
        'nav.search': 'Search activities, tools, tickets…',
        'profile.title': 'My profile',
        'profile.personal': 'Personal information',
        'profile.prefs': 'Account preferences',
        'profile.email': 'Email',
        'profile.phone': 'Phone number',
        'profile.contacts': 'Other contacts',
        'profile.function': 'Job title',
        'profile.address': 'Address',
        'profile.theme': 'Display theme',
        'profile.lang': 'Interface language',
        'profile.theme.light': 'Light',
        'profile.theme.dark': 'Dark',
        'profile.theme.auto': 'Automatic (system)',
        'profile.save.info': 'Save information',
        'profile.save.prefs': 'Save preferences',
        'profile.change.password': 'Change my password',
        'profile.theme.hint': 'The theme applies immediately after saving.',
        'profile.prefs.saved': 'Preferences saved.',
        'profile.info.saved': 'Information saved.',
        'btn.cancel': 'Cancel',
        'btn.save': 'Save',
        'common.matricule': 'Employee ID'
    }
};

function creerTraducteur(langue) {
    const lang = langue === 'en' ? 'en' : 'fr';
    const table = DICT[lang] || DICT.fr;
    return function t(key) {
        return table[key] || DICT.fr[key] || key;
    };
}

function normaliserPreferences(prefs) {
    if (!prefs) return { theme: 'clair', langue: 'fr' };
    if (typeof prefs === 'string') {
        try { prefs = JSON.parse(prefs); } catch { return { theme: 'clair', langue: 'fr' }; }
    }
    if (typeof prefs !== 'object') return { theme: 'clair', langue: 'fr' };
    return {
        theme: ['clair', 'sombre', 'auto'].includes(prefs.theme) ? prefs.theme : 'clair',
        langue: ['fr', 'en'].includes(prefs.langue) ? prefs.langue : 'fr'
    };
}

module.exports = { creerTraducteur, normaliserPreferences, DICT };
