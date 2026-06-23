const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const {
  getSectorLeads,
  getRegionalFocalPoints,
  getRoles,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  changeRole,
  resetPassword,
  issuePartyBCredentials,
  deleteUser,
} = require('../controllers/userController');

const router = express.Router();

const superAdmin = [verifyToken, requireRole('super_admin')];

// Dropdown helpers (other roles)
router.get(
  '/sector-leads',
  verifyToken,
  requireRole('sector_lead', 'regional_focal_point', 'focal_point', 'super_admin'),
  getSectorLeads
);
router.get(
  '/regional-focal-points',
  verifyToken,
  requireRole('sector_lead'),
  getRegionalFocalPoints
);

// Super Admin — user management
router.get('/roles', ...superAdmin, getRoles);
router.get('/', ...superAdmin, listUsers);
router.post('/', ...superAdmin, createUser);
router.get('/:id', ...superAdmin, getUserById);
router.patch('/:id', ...superAdmin, updateUser);
router.patch('/:id/role', ...superAdmin, changeRole);
router.patch('/:id/password', ...superAdmin, resetPassword);
router.post('/:id/issue-credentials', ...superAdmin, issuePartyBCredentials);
router.delete('/:id', ...superAdmin, deleteUser);

module.exports = router;
