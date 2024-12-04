const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const { admin, db } = require('../config/firebase');
const {createTestNotification} =require('../config/notificationHelper')

// Tạo notification mới
router.post('/', auth, async (req, res) => {
    try {
        // Lưu vào MongoDB
        const notification = new Notification({
            recipient: req.body.recipient,
            sender: req.body.sender,
            type: req.body.type,
            content: req.body.content,
            post: req.body.post,
            read: false
        });
        const savedNotification = await notification.save();

        // Lưu vào Firebase
        await notificationsRef.child(savedNotification._id.toString()).set({
            recipient: req.body.recipient,
            sender: req.body.sender,
            type: req.body.type,
            content: req.body.content,
            post: req.body.post,
            read: false,
            createdAt: admin.database.ServerValue.TIMESTAMP
        });

        res.status(201).json(savedNotification);
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({ message: error.message });
    }
});

// Lấy tất cả notifications của một user
router.get('/user/:userId', auth, async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.params.userId })
            .populate('sender', 'username avatar')
            .populate('post', 'content')
            .sort({ createdAt: -1 });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Đánh dấu notification đã đọc
router.patch('/:id/read', auth, async (req, res) => {
    try {
        // Cập nhật trong MongoDB
        const notification = await Notification.findByIdAndUpdate(
            req.params.id,
            { read: true },
            { new: true }
        );

        // Cập nhật trong Firebase
        await notificationsRef.child(req.params.id).update({
            read: true
        });

        res.json(notification);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Xóa notification
router.delete('/:id', auth, async (req, res) => {
    try {
        // Xóa từ MongoDB
        await Notification.findByIdAndDelete(req.params.id);

        // Xóa từ Firebase
        await notificationsRef.child(req.params.id).remove();

        res.json({ message: 'Notification deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Lấy số lượng thông báo chưa đọc
router.get('/unread/:userId', auth, async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            recipient: req.params.userId,
            read: false
        });
        res.json({ unreadCount: count });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;