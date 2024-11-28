const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const User = require('../models/User');
const  auth  = require('../middleware/auth');
const jwt = require('jsonwebtoken');

const checkAdminRole = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    console.log('Received token:', token);

    if (!token) {
      return res.status(401).json({ message: 'Không có token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);

    const user = await User.findById(decoded.id);
    console.log('Found user:', user);

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Không có quyền admin' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
};
// Create report
router.post('/create', auth, async (req, res) => {
  try {
    const { reportedItem, itemType, reason, description } = req.body;

    // Validate required fields
    if (!reportedItem || !itemType || !reason || !description) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin báo cáo'
      });
    }

    // Validate itemType
    const validItemTypes = ['User', 'Post', 'TravelPost', 'Comment'];
    if (!validItemTypes.includes(itemType)) {
      return res.status(400).json({
        success: false,
        message: 'Loại báo cáo không hợp lệ'
      });
    }

    // Validate reason
    const validReasons = [
      'spam',
      'harassment',
      'inappropriate_content',
      'violence',
      'hate_speech',
      'false_information',
      'other'
    ];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Lý do báo cáo không hợp lệ'
      });
    }

    // Create new report
    const report = new Report({
      reporter: req.user.id, // Lấy từ middleware auth
      reportedItem,
      itemType,
      reason,
      description,
      status: 'pending'
    });

    await report.save();

    // Populate reporter information
    const populatedReport = await Report.findById(report._id)
      .populate('reporter', 'name email avatar')
      .populate('reportedItem', 'name username title content images');

    res.status(201).json({
      success: true,
      data: populatedReport
    });

  } catch (error) {
    console.error('Create report error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Không thể gửi báo cáo'
    });
  }
});

// Get my reports
router.get('/my-reports', auth, async (req, res) => {
  try {
    const reports = await Report.find({ reporter: req.user.id })
      .populate('reportedItem', 'username name title') 
      .sort({ createdAt: -1 });

    res.json({ 
      success: true, 
      data: reports 
    });
  } catch (error) {
    console.error('Get my reports error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Không thể lấy danh sách báo cáo' 
    });
  }
});

// Get all reports (admin only)
router.post('/admin/all', checkAdminRole, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('reporter', 'username email avatar')
      .populate('reportedItem', 'username title name avatar')
      .sort({ createdAt: -1 });

    res.json({ 
      success: true, 
      data: reports 
    });
  } catch (error) {
    console.error('Get all reports error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Không thể lấy danh sách báo cáo' 
    });
  }
});

// Update report status (admin only)
router.post('/admin/:id', checkAdminRole, async (req, res) => {
  try {
    const { status } = req.body;
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!report) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy báo cáo' 
      });
    }

    res.json({ 
      success: true, 
      data: report 
    });
  } catch (error) {
    console.error('Update report status error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Không thể cập nhật trạng thái báo cáo' 
    });
  }
});

// Delete report (admin only)
router.delete('/admin/:id', checkAdminRole, async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);
    
    if (!report) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy báo cáo' 
      });
    }

    res.json({
      success: true,
      message: 'Đã xóa báo cáo thành công'
    });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Không thể xóa báo cáo' 
    });
  }
});

// Get report detail
router.post('/admin/:id', checkAdminRole, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('reporter', 'username email avatar')
      .populate('reportedItem', 'username name title content images avatar');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy báo cáo'
      });
    }

    // Kiểm tra quyền xem báo cáo
    if (report.reporter.toString() !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền xem báo cáo này'
      });
    }

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Get report detail error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể lấy chi tiết báo cáo'
    });
  }
});

// Get report detail for user
router.get('/user/:id', auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('reporter', 'username email avatar')
      .populate('reportedItem', 'username name title content images avatar');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy báo cáo'
      });
    }

    // Chỉ cho phép người tạo báo cáo xem chi tiết
    if (report.reporter._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xem báo cáo này'
      });
    }

    // Định dạng dữ liệu phù hợp cho user view
    const userViewReport = {
      _id: report._id,
      status: report.status,
      reason: report.reason,
      description: report.description,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      itemType: report.itemType,
      reportedItem: {
        _id: report.reportedItem._id,
        name: report.reportedItem.name || report.reportedItem.username,
        title: report.reportedItem.title,
        content: report.reportedItem.content,
        images: report.reportedItem.images,
        avatar: report.reportedItem.avatar
      }
    };

    res.json({
      success: true,
      data: userViewReport
    });

  } catch (error) {
    console.error('Get user report detail error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể lấy chi tiết báo cáo'
    });
  }
});

module.exports = router;