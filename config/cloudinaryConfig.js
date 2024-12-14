const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'DuAnTotNghiep',
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif'],
    transformation: [
      { quality: 'auto:best' }
    ],
    resource_type: 'auto'
  }
});

const uploadToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(file, {
      quality: 'auto:best',
      resource_type: 'auto'
    }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
};

module.exports = { cloudinary, upload: multer({ storage: storage }), uploadToCloudinary };