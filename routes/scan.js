const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const User = require('../models/User');
const moment = require('moment');
// Đảm bảo thư mục uploads tồn tại
const auth = require('../middleware/auth');
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Cấu hình Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir)
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
    }
});

const upload = multer({ storage: storage });

const apiKey = 'MrYyHv2fPQi1juObplL9JxVwn1UFnjD6';  // Thay bằng API Key của bạn

// Endpoint để nhận và xử lý file ảnh
router.post('/scan-cccd', upload.single('image'), (req, res) => {
    // Kiểm tra xem file có được gửi không
    if (!req.file) {
        return res.status(400).send('Vui lòng tải lên file ảnh với key là "image"');
    }

    // Đường dẫn đến file ảnh được tải lên
    const imagePath = req.file.path;

    // Kiểm tra xem file có tồn tại không
    if (!fs.existsSync(imagePath)) {
        return res.status(500).send('Không tìm thấy file ảnh đã upload');
    }

    // Đọc file ảnh
    const imageFile = fs.createReadStream(imagePath);

    // Tạo form-data để gửi file ảnh
    const form = new FormData();
    form.append('image', imageFile);

    // Gọi API FPT
    axios.post('https://api.fpt.ai/vision/idr/vnm', form, {
        headers: {
            'api-key': apiKey,
            ...form.getHeaders()
        }
    })
    .then(response => {
        // Xoá file ảnh sau khi gửi xong
        fs.unlinkSync(imagePath);

        // Gửi kết quả từ API về cho client
        res.json(response.data);
        console.log(response.data)
    })
    .catch(error => {
        console.error('Lỗi khi gọi API:', error);
        // Xoá file ảnh nếu có lỗi
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
        res.status(500).send('Lỗi khi gọi API');
    });
});







router.post('/update-cccd', auth, async (req, res) => {
    try {
        const { 
            cccd, 
            name, 
            dob,
            sex, 
            nationality, 
            home, 
            address, 
        } = req.body;

        // Lấy thông tin người dùng từ req.user (đã được set bởi middleware auth)
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }

        // Update CCCD information
        user.cccd = cccd;
        user.name = name;
        user.dob = dob;
        user.sex = sex;
        user.nationality = nationality;
        user.home = home;
        user.diachi = address;
        user.xacMinhDanhTinh = true;

        // Save the updated user
        await user.save();

        res.status(200).json({ message: 'Cập nhật thông tin CCCD thành công', user });
    } catch (error) {
        console.error('Lỗi khi cập nhật CCCD:', error);
        res.status(500).json({ message: 'Lỗi server khi cập nhật CCCD' });
    }
});
module.exports = router;
