const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Report = require('../models/Report');

// Báo cáo người dùng
router.post('/user/:userId', auth, async (req, res) => {
  try {
    const report = new Report({
      reporter: req.user._id,
      reportedItem: req.params.userId,
      itemType: 'User',
      reason: req.body.reason,
      description: req.body.description
    });
    
    await report.save();
    res.status(201).json({ message: 'Báo cáo người dùng thành công', report });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// Báo cáo bài feed
router.post('/post/:postId', auth, async (req, res) => {
  try {
    const report = new Report({
      reporter: req.user._id,
      reportedItem: req.params.postId,
      itemType: 'Post',
      reason: req.body.reason,
      description: req.body.description
    });
    
    await report.save();
    res.status(201).json({ message: 'Báo cáo bài viết thành công', report });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// Báo cáo bài travel
router.post('/travel/:travelId', auth, async (req, res) => {
  try {
    const report = new Report({
      reporter: req.user._id,
      reportedItem: req.params.travelId,
      itemType: 'TravelPost',
      reason: req.body.reason,
      description: req.body.description
    });
    
    await report.save();
    res.status(201).json({ message: 'Báo cáo bài travel thành công', report });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// Lấy danh sách báo cáo (có thể lọc theo loại)
router.get('/', auth, async (req, res) => {
  try {
    const { itemType, status } = req.query;
    const filter = {};
    
    if (itemType) filter.itemType = itemType;
    if (status) filter.status = status;
    
    const reports = await Report.find(filter)
      .populate('reporter', 'username email')
      .populate('reportedItem')
      .sort({ createdAt: -1 });
      
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// Cập nhật trạng thái báo cáo (dành cho admin)
router.patch('/:reportId', auth, async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.reportId,
      { status: req.body.status },
      { new: true }
    );
    
    if (!report) {
      return res.status(404).json({ message: 'Không tìm thấy báo cáo' });
    }
    
    res.json({ message: 'Cập nhật trạng thái thành công', report });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

module.exports = router;
