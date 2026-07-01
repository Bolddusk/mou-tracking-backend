const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getActiveSectors } = require('../controllers/sectorController');

const router = express.Router();

router.get('/', verifyToken, getActiveSectors);

module.exports = router;
