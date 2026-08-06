const express = require('express');
const router = express.Router();
const accesController = require('../controllers/accesController');
const { requireAuth, checkPermission } = require('../middlewares/auth');

router.use(requireAuth);

// Consultation de son propre accès : toujours autorisée, peu importe la
// permission "acces" du rôle (utilisé par l'interface pour savoir si des
// boutons Modifier/Supprimer doivent apparaître).
router.get('/mon-acces/activite', accesController.getMonAccesActivite);
router.get('/mon-acces/sous-activite', accesController.getMonAccesSousActivite);

router.get('/activites', checkPermission('acces', 'read'), accesController.getAccesActivites);
router.post('/activites', checkPermission('acces', 'create'), accesController.accorderAccesActivite);
router.delete('/activites/:id', checkPermission('acces', 'delete'), accesController.revoquerAccesActivite);

router.get('/sous-activites', checkPermission('acces', 'read'), accesController.getAccesSousActivites);
router.post('/sous-activites', checkPermission('acces', 'create'), accesController.accorderAccesSousActivite);
router.delete('/sous-activites/:id', checkPermission('acces', 'delete'), accesController.revoquerAccesSousActivite);

module.exports = router;
