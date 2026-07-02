const express = require('express');
const { verifyToken, requireRole, hasPermission } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/requirePermission');
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
const userList = [verifyToken, requireAnyPermission('nav.users.manage', 'users.list', 'admin.users')];
const userCreate = [verifyToken, requireAnyPermission('users.create', 'admin.users')];
const userUpdate = [verifyToken, requireAnyPermission('users.update')];
const userDelete = [verifyToken, requireAnyPermission('users.delete')];
const userChangeRole = [verifyToken, requireAnyPermission('users.change_role')];

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

// Super Admin — user management (permission-gated; super_admin middleware bypass in hasPermission)
router.get('/roles', ...userList, getRoles);
router.get('/', ...userList, listUsers);
router.post('/', ...userCreate, createUser);
router.get('/:id', ...userList, getUserById);
router.patch('/:id', ...userUpdate, updateUser);
router.patch('/:id/role', ...userChangeRole, changeRole);
router.patch('/:id/password', ...userUpdate, resetPassword);
router.post('/:id/issue-credentials', ...userUpdate, issuePartyBCredentials);
router.delete('/:id', ...userDelete, deleteUser);

module.exports = router;
