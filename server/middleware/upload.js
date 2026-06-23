const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsDir = path.join(__dirname, '..', 'uploads');
const complaintsDir = path.join(uploadsDir, 'complaints');
const profilesDir = path.join(uploadsDir, 'profiles');
const complianceDir = path.join(uploadsDir, 'compliance');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(complaintsDir)) {
  fs.mkdirSync(complaintsDir, { recursive: true });
}

if (!fs.existsSync(profilesDir)) {
  fs.mkdirSync(profilesDir, { recursive: true });
}

if (!fs.existsSync(complianceDir)) {
  fs.mkdirSync(complianceDir, { recursive: true });
}

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp']);

function buildStorage(destinationDir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destinationDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, safeName);
    },
  });
}

const storage = buildStorage(uploadsDir);
const complaintStorage = buildStorage(complaintsDir);
const profileStorage = buildStorage(profilesDir);
const complianceStorage = buildStorage(complianceDir);

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) || ALLOWED_EXT.has(ext)) {
    cb(null, true);
    return;
  }
  cb(new Error('Only PDF, DOC, and DOCX files are allowed'));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const proposalUpload = upload.fields([
  { name: 'proposal_file', maxCount: 1 },
  { name: 'mou_file', maxCount: 1 },
  { name: 'company_logo', maxCount: 1 },
  { name: 'cover_image', maxCount: 1 },
]);

const activitySupportUpload = upload.single('support_file');

const complaintUpload = multer({
  storage: complaintStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const complaintDocumentUpload = complaintUpload.single('document');

const profileUpload = multer({
  storage: profileStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const profileDocumentUpload = profileUpload.single('document');

const complianceUpload = multer({
  storage: complianceStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const complianceDocumentUpload = complianceUpload.single('document');

function handleUploadError(err, req, res, next) {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
    }
    return res.status(400).json({ error: err.message });
  }

  return res.status(400).json({ error: err.message || 'File upload failed' });
}

function getPublicFileUrl(req, filename, subfolder = '') {
  const port = process.env.PORT || 5000;
  const host = process.env.API_HOST || `http://localhost:${port}`;
  const pathPart = subfolder ? `uploads/${subfolder}/${filename}` : `uploads/${filename}`;
  return `${host}/${pathPart}`;
}

module.exports = {
  proposalUpload,
  activitySupportUpload,
  complaintDocumentUpload,
  profileDocumentUpload,
  complianceDocumentUpload,
  handleUploadError,
  getPublicFileUrl,
};
