require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:4000/api';

/**
 * L'Interface (EJS) et le Server (API) sont deux applications distinctes.
 * Le Server utilise une session (cookie "connect.sid") pour savoir qui est
 * connecté. On stocke ce cookie côté Interface (dans la session de
 * l'Interface elle-même) après le login, puis on le retransmet à chaque
 * appel API pour que le Server reconnaisse l'utilisateur.
 *
 * Utilisation : const api = apiClient(req); await api.get('/activites');
 */
function apiClient(req) {
    const instance = axios.create({
        baseURL: API_URL,
        headers: req.session && req.session.apiCookie
            ? { Cookie: req.session.apiCookie }
            : {}
    });
    return instance;
}

// Client "nu", sans cookie, utilisé uniquement pour le login (avant d'avoir une session).
function apiClientAnonyme() {
    return axios.create({ baseURL: API_URL });
}

module.exports = { apiClient, apiClientAnonyme, API_URL };
