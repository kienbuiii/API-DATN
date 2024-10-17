
const express = require('express');
const router = express.Router();
const SoThich = require('../models/soThich'); // Đảm bảo bạn đã tạo model SoThich
const User = require('../models/User');
const auth = require('../middleware/auth');

// Thêm sở thích mới
router.post('/add', async (req, res) => {
  try {
    const { Ten } = req.body;
   

    if (!Ten) {
      return res.status(400).json({ message: 'Vui lòng nhập tên sở thích' });
    }

    // Kiểm tra xem sở thích đã tồn tại chưa
    let soThich = await SoThich.findOne({ Ten: Ten.toLowerCase() });

    if (!soThich) {
      // Nếu sở thích chưa tồn tại, tạo mới
      soThich = new SoThich({
        Ten: Ten.toLowerCase(),
       
      });
      await soThich.save();
    }

    // Thêm sở thích vào danh sách sở thích của người dùn

    res.status(201).json({
      message: 'Thêm sở thích thành công',
      soThich: soThich
    });
  } catch (error) {
    console.error('Lỗi khi thêm sở thích:', error);
    res.status(500).json({ message: 'Lỗi server khi thêm sở thích', error: error.message });
  }
});

// Lấy danh sách sở thích của người dùng hiện tại
router.get('/my-interests', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('soThich');
    res.status(200).json({
      message: 'Lấy danh sách sở thích thành công',
      soThich: user.soThich
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách sở thích:', error);
    res.status(500).json({ message: 'Lỗi server khi lấy danh sách sở thích', error: error.message });
  }
});

// Xóa sở thích của người dùng
router.delete('/remove/:soThichId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const soThichId = req.params.soThichId;

    const user = await User.findById(userId);
    user.soThich = user.soThich.filter(id => id.toString() !== soThichId);
    await user.save();

    res.status(200).json({ message: 'Xóa sở thích thành công' });
  } catch (error) {
    console.error('Lỗi khi xóa sở thích:', error);
    res.status(500).json({ message: 'Lỗi server khi xóa sở thích', error: error.message });
  }
});

module.exports = router;