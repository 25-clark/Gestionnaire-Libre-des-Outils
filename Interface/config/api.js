require('dotenv').config();
const axios = require('axios');
const http = require('http');
const https = require('https');

const API_URL = process.env.API_URL || 'http://localhost:4000/api';

// Réutilise les connexions TCP vers l'API (moins de latence par requête)
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32 });

function apiClient(req) {
    return axios.create({
        baseURL: API_URL,
        timeout: 15000,
        httpAgent,
        httpsAgent,
        headers: req.session && req.session.apiCookie
            ? { Cookie: req.session.apiCookie }
            : {}
    });
}

function apiClientAnonyme() {
    return axios.create({
        baseURL: API_URL,
        timeout: 10000,
        httpAgent,
        httpsAgent
    });
}

module.exports = { apiClient, apiClientAnonyme, API_URL };
