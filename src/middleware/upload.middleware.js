import multer from "multer";
import { sendJsonResponse } from '../utils/response.js';

const storage = multer.memoryStorage();

const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

const fileFilter = (req, file, cb) => {
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(
      new Error(
        `Invalid file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(", ")}`
      ),
      false
    );
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

const uploadSingle = upload.single("image");

export const uploadMiddleware = (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return sendJsonResponse(res, 400, {
          message: "File size exceeds maximum limit of 5MB",
        });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return sendJsonResponse(res, 400, {
          message: "Only one image file is allowed",
        });
      }
      return sendJsonResponse(res, 400, {
        message: err.message || "File upload error",
      });
    }
    if (err) {
      return sendJsonResponse(res, 400, {
        message: err.message,
      });
    }

    next();
  });
};