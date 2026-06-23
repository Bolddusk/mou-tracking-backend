const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { getEmailStatus, testEmail } = require('../controllers/devController');

const router = express.Router();

const superAdmin = [verifyToken, requireRole('super_admin')];

router.get('/email-status', ...superAdmin, getEmailStatus);
router.post('/test-email', ...superAdmin, testEmail);

module.exports = router;
