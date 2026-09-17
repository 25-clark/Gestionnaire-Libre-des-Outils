/**
 * Configuration d'environnement unifiée (local / production).
 * Chargé en premier depuis server.js après dotenv.
 */
const path = require('path');

const NODE_ENV = (process.env.NODE_ENV || 'development').toLowerCase();
const isProd = NODE_ENV === 'production';
const isDev = !isProd;

function requisEnProd(cle, valeur) {
    if (isProd && (!valeur || valeur === 'change_moi' || valeur === 'change_moi_en_production')) {
        console.error(`[env] Variable obligatoire en production : ${cle}`);
        process.exit(1);
    }
}

const SESSION_SECRET = process.env.SESSION_SECRET || (isDev ? 'glo-dev-session-secret' : '');
const CREDENTIALS_SECRET = process.env.CREDENTIALS_SECRET || SESSION_SECRET;

requisEnProd('SESSION_SECRET', SESSION_SECRET);
if (isProd && !process.env.CREDENTIALS_SECRET) {
    console.warn('[env] CREDENTIALS_SECRET absent — SESSION_SECRET sera utilisé pour le chiffrement des credentials.');
}

/** Origines CORS autorisées (CLIENT_URL ou CLIENT_URLS séparées par des virgules). */
function originesCors() {
    const raw = process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:3000';
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Cookie de session API.
 * - local  : secure false, sameSite lax
 * - prod HTTPS (même site ou reverse-proxy) : secure true, sameSite lax
 * - prod cross-origin (Interface sur autre domaine) : COOKIE_SAME_SITE=none + secure true
 */
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
    port: parseInt(process.env.PORT, 10) || 4000,
    sessionSecret: SESSION_SECRET,
    credentialsSecret: CREDENTIALS_SECRET,
    clientOrigins: originesCors(),
    trustProxy: isProd || process.env.TRUST_PROXY === '1',
    cookie: optionsCookieSession(),
    db: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        name: process.env.DB_NAME || 'glo_db',
        user: process.env.DB_USER || 'root',
        pass: process.env.DB_PASS || '',
        // SSL cloud (PlanetScale, etc.)
        ssl: process.env.DB_SSL === '1' || process.env.DB_SSL === 'true'
            ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== '0' }
            : undefined,
        logging: process.env.DB_LOGGING === '1' ? console.log : false
    },
    uploadsDir: path.join(__dirname, '..', 'uploads')
};

function logDemarrage() {
    console.log(`[env] Mode : ${config.nodeEnv} (${config.isProd ? 'production' : 'local/développement'})`);
    console.log(`[env] Port API : ${config.port}`);
    console.log(`[env] CORS : ${config.clientOrigins.join(', ')}`);
    console.log(`[env] Cookie secure=${config.cookie.secure} sameSite=${config.cookie.sameSite}`);
    console.log(`[env] DB : ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.name}${config.db.ssl ? ' (SSL)' : ''}`);
}

module.exports = { config, logDemarrage, originesCors };
