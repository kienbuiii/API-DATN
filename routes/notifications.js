const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');
const admin = require('firebase-admin');
const User = require('../models/User');

// Lấy tất cả thông báo của người dùng
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(notifications);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Đánh dấu thông báo đã đọc
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json(notification);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Gửi thông báo (sử dụng trong các route khác)
const sendNotification = async (userId, type, content, relatedId, onModel) => {
  try {
    const notification = new Notification({
      userId,
      type,
      content,
      relatedId,
      onModel
    });
    await notification.save();

    // Gửi thông báo qua Firebase
    const user = await User.findById(userId);
    if (user && user.fcmToken) {
      const message = {
        notification: {
          title: 'New Notification',
          body: content
        },
        token: user.fcmToken
      };
      await admin.messaging().send(message);
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

module.exports = { router, sendNotification };