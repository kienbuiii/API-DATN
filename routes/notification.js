const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// Lấy tất cả thông báo của user
router.get('/:userId', auth, async (req, res) => {
    try {
        const notifications = await Notification.find({ 
            recipient: req.params.userId 
        })
        .sort({ createdAt: -1 })
        .populate('sender', 'username avatar')
        .populate('post', 'content');
        
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

// Đánh dấu thông báo đã đọc
router.put('/:notificationId/read', auth, async (req, res) => {
    try {
        const notification = await Notification.findByIdAndUpdate(
            req.params.notificationId,
            { read: true },
            { new: true }
        );
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        res.json(notification);
    } catch (error) {
        res.status(500).json({ message: 'Error updating notification' });
    }
});

// Xóa thông báo
router.delete('/:notificationId', auth, async (req, res) => {
    try {
        const notification = await Notification.findByIdAndDelete(req.params.notificationId);
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        res.json({ message: 'Notification deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting notification' });
    }
});

// Đánh dấu tất cả thông báo đã đọc
router.put('/read-all/:userId', auth, async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.params.userId, read: false },
            { read: true }
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating notifications' });
    }
});

module.exports = router;