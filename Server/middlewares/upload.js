const multer = require('multer');
const path = require('path');

function makeStorage(sousDossier) {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, path.join(__dirname, '..', 'uploads', sousDossier));
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            const nomFichier = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
            cb(null, nomFichier);
        }
    });
}

function filtreImage(req, file, cb) {
    const typesAutorises = /jpeg|jpg|png|gif|svg|webp/;
    const extOk = typesAutorises.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = typesAutorises.test(file.mimetype);
    if (extOk && mimeOk) {
        return cb(null, true);
    }
    cb(new Error('Format d\'image non autorisé (jpeg, jpg, png, gif, svg, webp uniquement).'));
}

const uploadLogo = multer({
    storage: makeStorage('logos'),
    fileFilter: filtreImage,
    limits: { fileSize: 3 * 1024 * 1024 }
});

const uploadOutilImage = multer({
    storage: makeStorage('outils'),
    fileFilter: filtreImage,
    limits: { fileSize: 3 * 1024 * 1024 }
});

module.exports = { uploadLogo, uploadOutilImage };
