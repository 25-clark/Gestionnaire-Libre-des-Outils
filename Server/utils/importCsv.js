/**
 * Parse CSV simple (virgule ou point-virgule) → lignes d'objets.
 */
function parseCsv(texte) {
    const lines = String(texte || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return { headers: [], rows: [] };
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
        if (!cols.some(Boolean)) continue;
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = cols[idx] != null ? cols[idx] : ''; });
        rows.push(obj);
    }
    return { headers, rows };
}

module.exports = { parseCsv };
