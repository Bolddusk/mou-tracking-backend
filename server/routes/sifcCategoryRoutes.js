const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getActiveSifcCategories } = require('../controllers/sifcCategoryController');

const router = express.Router();

router.get('/', verifyToken, getActiveSifcCategories);

module.exports = router;
