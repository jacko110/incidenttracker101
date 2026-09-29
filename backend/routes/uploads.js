const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { requireAuth, requireAuthFromHeaderOrQuery, SECRET } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_FILES = 10;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    cb(null, `${unique}-${safeBase}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

// POST /api/uploads  (multipart/form-data, field name: files) — requires login
router.post("/", requireAuth, (req, res) => {
  upload.array("files", MAX_FILES)(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "One or more files exceed the 10MB limit" });
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({ error: `You can upload up to ${MAX_FILES} files at once` });
      }
      return res.status(400).json({ error: err.message || "Upload failed" });
    }

    const files = (req.files || []).map((f) => ({
      originalName: f.originalname,
      storedName: f.filename,
      // Authenticated download URL — the token is appended by the frontend
      // (image/anchor tags can't send Authorization headers) so this alone
      // is not fetchable without a valid, unexpired token.
      url: `/api/uploads/file/${f.filename}`,
      size: f.size,
      mimetype: f.mimetype,
    }));

    res.status(201).json({ files });
  });
});

// GET /api/uploads/file/:filename?token=...  — authenticated file download.
// Accepts the token via header OR query string since <img>/<a> can't set headers.
router.get("/file/:filename", requireAuthFromHeaderOrQuery, (req, res) => {
  // Reject path traversal / anything that isn't a plain filename we generated
  const filename = req.params.filename;
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: "File not found" });
    }
  });
});

module.exports = router;
