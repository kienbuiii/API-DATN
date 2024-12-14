const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const User = require('../models/User');
const auth = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const {
  createAdminNotification,
  NOTIFICATION_TYPES
} = require('../config/notificationHelper');

const checkAdminRole = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Không có token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

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

    if (!reportedItem || !itemType || !reason || !description) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin báo cáo'
      });
    }

    const validItemTypes = ['User', 'Post', 'TravelPost', 'Comment'];
    if (!validItemTypes.includes(itemType)) {
      return res.status(400).json({
        success: false,
        message: 'Loại báo cáo không hợp lệ'
      });
    }

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

    const report = new Report({
      reporter: req.user.id,
      reportedItem,
      itemType,
      reason,
      description,
      status: 'pending'
    });

    await report.save();

    const populatedReport = await Report.findById(report._id)
      .populate('reporter', 'username email avatar')
      .populate('reportedItem', 'username name title content images');

    const admins = await User.find({ role: 'admin' });

    let reportMessage = '';
    switch (itemType) {
      case 'User':
        reportMessage = `Báo cáo người dùng: ${populatedReport.reportedItem.username}`;
        break;
      case 'Post':
        reportMessage = `Báo cáo bài viết: "${populatedReport.reportedItem.title}"`;
        break;
      case 'TravelPost':
        reportMessage = `Báo cáo bài viết du lịch: "${populatedReport.reportedItem.title}"`;
        break;
      case 'Comment':
        reportMessage = `Báo cáo bình luận`;
        break;
    }

    try {
      const notificationPromises = admins.map(admin => 
        createAdminNotification({
          recipientId: admin._id,
          senderId: req.user.id,
          type: NOTIFICATION_TYPES.NEW_REPORT,
          reportId: report._id.toString(),
          senderName: populatedReport.reporter.username,
          senderAvatar: populatedReport.reporter.avatar,
          message: reportMessage,
          priority: 'high',
          metadata: {
            reportType: itemType,
            reason: reason,
            description: description,
            reportedItemId: reportedItem,
            reportedItemType: itemType,
            reporterInfo: {
              id: req.user.id,
              username: populatedReport.reporter.username
            },
            reportStatus: 'pending',
            createdAt: new Date()
          }
        })
      );

      await Promise.all(notificationPromises);
      console.log('Đã gửi thông báo cho tất cả admin');
    } catch (notifError) {
      console.error('Lỗi khi gửi thông báo cho admin:', notifError);
    }

    res.status(201).json({
      success: true,
      data: populatedReport,
      message: 'Gửi báo cáo thành công'
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

router.post('/admin/detail/:id', checkAdminRole, async (req, res) => {
  try {
    console.log('Getting report detail for ID:', req.params.id);
    
    const report = await Report.findById(req.params.id)
      .populate('reporter', 'username email avatar')
      .populate('reportedItem', 'username name title content images avatar');

    console.log('Found report:', report);

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