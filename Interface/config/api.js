require('dotenv').config();
const axios = require('axios');
const http = require('http');
const https = require('https');

const API_URL = process.env.API_URL || 'http://localhost:4000/api';

// keepAlive désactivé : évite ECONNRESET quand le Server redémarre (nodemon)
// ou ferme une connexion idle pendant qu'Axios la réutilise.
const httpAgent = new http.Agent({ keepAlive: false, maxSockets: 32 });
const httpsAgent = new https.Agent({ keepAlive: false, maxSockets: 32 });

function capturerCookieSession(req, response) {
    try {
        if (!req || !req.session || !response || !response.headers) return;
        let setCookie = response.headers['set-cookie'];
        if (!setCookie) return;
        if (!Array.isArray(setCookie)) setCookie = [setCookie];
        for (const raw of setCookie) {
            const part = String(raw).split(';')[0].trim();
            if (part.toLowerCase().startsWith('connect.sid=')) {
                req.session.apiCookie = part;
                break;
            }
        }
    } catch (_) {}
}

function estErreurReseauTransitoire(err) {
    if (!err) return false;
    const code = err.code || (err.cause && err.cause.code);
    if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EPIPE') return true;
    if (err.message && /ECONNRESET|ECONNREFUSED|socket hang up/i.test(err.message)) return true;
    return false;
}

function attacherIntercepteurs(client, req) {
    client.interceptors.response.use(
        (response) => {
            capturerCookieSession(req, response);
            return response;
        },
        async (error) => {
            if (error.response) capturerCookieSession(req, error.response);

            const config = error.config;
            if (config && estErreurReseauTransitoire(error) && !config.__retryCount) {
                config.__retryCount = 1;
                // Courte pause puis 1 nouvel essai (nouvelle connexion TCP)
                await new Promise((r) => setTimeout(r, 150));
                return client.request(config);
            }
            return Promise.reject(error);
        }
    );
    return client;
}

function apiClient(req) {
    const client = axios.create({
        baseURL: API_URL,
        timeout: 20000,
        httpAgent,
        httpsAgent,
        headers: req.session && req.session.apiCookie
            ? { Cookie: req.session.apiCookie }
            : {}
    });
    return attacherIntercepteurs(client, req);
}

function apiClientAnonyme() {
    const client = axios.create({
        baseURL: API_URL,
        timeout: 15000,
        httpAgent,
        httpsAgent
    });
    return attacherIntercepteurs(client, null);
}

module.exports = { apiClient, apiClientAnonyme, API_URL };
