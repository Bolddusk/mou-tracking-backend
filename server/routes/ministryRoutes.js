const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const {
  listMinistries,
  getMinistry,
  createMinistry,
  updateMinistry,
  deleteMinistry,
} = require('../controllers/ministryController');

const router = express.Router();

const readers = [verifyToken, requireRole('super_admin', 'power_admin', 'admin', 'sector_lead', 'party_a')];
const writers = [verifyToken, requireRole('super_admin')];

router.get('/', ...readers, listMinistries);
router.get('/:id', ...readers, getMinistry);
router.post('/', ...writers, createMinistry);
router.patch('/:id', ...writers, updateMinistry);
router.delete('/:id', ...writers, deleteMinistry);

module.exports = router;
