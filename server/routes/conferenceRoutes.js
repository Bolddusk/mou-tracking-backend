const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getActiveConferences } = require('../controllers/conferenceController');

const router = express.Router();

router.get('/', verifyToken, getActiveConferences);

module.exports = router;
