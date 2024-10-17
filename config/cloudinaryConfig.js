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
    folder: 'DuAnTotNghiep', // Tên folder trên Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif'], // Định dạng file cho phép
    transformation: [{ width: 500, height: 500, crop: 'limit' }] // Tùy chọn: giới hạn kích thước ảnh
  }
});

const upload = multer({ storage: storage });

// Hàm helper để upload ảnh lên Cloudinary
const uploadToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(file, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
};

module.exports = { cloudinary, upload, uploadToCloudinary };