// Génère un CSV compatible Excel (séparateur ";", BOM UTF-8 pour les accents).
// Pas de dépendance externe : le format CSV est assez simple pour ne pas en
// avoir besoin, et ça évite d'installer quoi que ce soit.

function echapper(valeur) {
    const s = valeur === null || valeur === undefined ? '' : String(valeur);
    if (/[";\n\r]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

/**
 * @param {{cle: string, libelle: string}[]} colonnes
 * @param {object[]} lignes  tableau d'objets, lus via colonne.cle
 */
function versCsv(colonnes, lignes) {
    const entete = colonnes.map(c => echapper(c.libelle)).join(';');
    const corps = lignes.map(ligne => colonnes.map(c => echapper(ligne[c.cle])).join(';')).join('\r\n');
    return '\uFEFF' + entete + '\r\n' + corps;
}

function envoyerCsv(res, nomFichier, colonnes, lignes) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
    res.send(versCsv(colonnes, lignes));
}

module.exports = { versCsv, envoyerCsv };
