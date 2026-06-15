import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

/**
 * Uploads a file buffer to a specified Cloudinary folder using streams
 * @param {Buffer} fileBuffer - The file buffer provided by multer
 * @param {string} folder - The destination folder path in Cloudinary
 * @returns {Promise<Object>} Cloudinary upload result object
 */
export const uploadToCloudinary = (fileBuffer, folder = "food-waste-reduction/products") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};

/**
 * Deletes an asset from Cloudinary using its public ID
 * @param {string} publicId - The public ID of the image
 * @returns {Promise<Object>} Cloudinary deletion result
 */
export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return null;
  return await cloudinary.uploader.destroy(publicId);
};