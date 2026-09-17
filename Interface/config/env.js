/**
 * Configuration d'environnement Interface (local / production).
 */
const NODE_ENV = (process.env.NODE_ENV || 'development').toLowerCase();
const isProd = NODE_ENV === 'production';
const isDev = !isProd;

function requisEnProd(cle, valeur) {
    if (isProd && (!valeur || valeur === 'glo_interface_secret' || valeur === 'glo_interface_secret_a_changer')) {
        const msg = `[env] Variable obligatoire en production : ${cle}`;
        // Sur Vercel, process.exit tue la fonction → 500 FUNCTION_INVOCATION_FAILED
        if (process.env.VERCEL) {
            console.error(msg + ' (définir dans Project → Settings → Environment Variables)');
        } else {
            console.error(msg);
            process.exit(1);
        }
    }
}

const SESSION_SECRET = process.env.SESSION_SECRET
    || (isDev ? 'glo-interface-dev-secret' : '')
    || (process.env.VERCEL ? 'vercel-insecure-change-me' : '');
requisEnProd('SESSION_SECRET', process.env.SESSION_SECRET || '');

const API_URL = (process.env.API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
if (isProd && /localhost|127\.0\.0\.1/.test(API_URL)) {
    console.warn('[env] API_URL pointe vers localhost en production — vérifiez Interface/.env');
}

function optionsCookieSession() {
    const sameSiteEnv = (process.env.COOKIE_SAME_SITE || '').toLowerCase();
    let sameSite = 'lax';
    if (sameSiteEnv === 'none' || sameSiteEnv === 'strict' || sameSiteEnv === 'lax') {
        sameSite = sameSiteEnv;
    } else if (isProd && process.env.COOKIE_CROSS_SITE === '1') {
        sameSite = 'none';
    }
    const secure = process.env.COOKIE_SECURE === '1'
        || process.env.COOKIE_SECURE === 'true'
        || (isProd && sameSite === 'none')
        || (isProd && process.env.COOKIE_SECURE !== '0' && process.env.COOKIE_SECURE !== 'false');

    return {
        httpOnly: true,
        sameSite,
        secure: !!secure,
        maxAge: parseInt(process.env.SESSION_MAX_AGE_MS, 10) || (1000 * 60 * 60 * 8)
    };
}

const config = {
    nodeEnv: NODE_ENV,
    isProd,
    isDev,
    port: parseInt(process.env.PORT, 10) || 3000,
    apiUrl: API_URL,
    sessionSecret: SESSION_SECRET,
    trustProxy: isProd || process.env.TRUST_PROXY === '1',
    cookie: optionsCookieSession(),
    staticMaxAge: isProd ? '7d' : 0
};

function logDemarrage() {
    console.log(`[env] Mode : ${config.nodeEnv} (${config.isProd ? 'production' : 'local/développement'})`);
    console.log(`[env] Port Interface : ${config.port}`);
    console.log(`[env] API_URL : ${config.apiUrl}`);
    console.log(`[env] Cookie secure=${config.cookie.secure} sameSite=${config.cookie.sameSite}`);
}

module.exports = { config, logDemarrage };
