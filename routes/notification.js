const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const authMiddleware = require('../middleware/auth');

// Lấy tất cả notifications của user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user.id })
            .populate('sender', 'username avatar')
            .populate('post', 'title images')
            .sort({ createdAt: -1 });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Đánh dấu một notification là đã đọc
router.put('/:id/mark-read', authMiddleware, async (req, res) => {
    try {
        const notification = await Notification.findByIdAndUpdate(
            req.params.id,
            { read: true },
            { new: true }
        ).populate('sender', 'username avatar')
         .populate('post', 'title images');

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json(notification);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Đánh dấu tất cả notifications là đã đọc
router.put('/mark-all-read', authMiddleware, async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user.id, read: false },
            { read: true }
        );

        const updatedNotifications = await Notification.find({ recipient: req.user.id })
            .populate('sender', 'username avatar')
            .populate('post', 'title images')
            .sort({ createdAt: -1 });

        res.json(updatedNotifications);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Xóa một notification
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const notification = await Notification.findByIdAndDelete(req.params.id);
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        res.json({ message: 'Notification deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Lấy số lượng thông báo chưa đọc
router.get('/unread-count', authMiddleware, async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            recipient: req.user.id,
            read: false
        });
        res.json({ unreadCount: count });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;