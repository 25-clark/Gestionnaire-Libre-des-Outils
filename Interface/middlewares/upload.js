const multer = require('multer');
const path = require('path');

// L'Interface héberge elle-même les images (logos d'activités, images
// d'outils) dans son dossier public/uploads, puis transmet juste le chemin
// résultant (ex: "/uploads/logos/xxx.png") au Server via l'API.
function makeStorage(sousDossier) {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, path.join(__dirname, '..', 'public', 'uploads', sousDossier));
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        }
    });
}

const uploadLogo = multer({ storage: makeStorage('logos') });
const uploadOutilImage = multer({ storage: makeStorage('outils') });

module.exports = { uploadLogo, uploadOutilImage };
