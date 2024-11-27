const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Lấy danh sách conversations
router.get('/conversations', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate({
                path: 'conversations.with',
                select: 'username avatar isOnline lastActive',
            })
            .populate({
                path: 'conversations.lastMessage',
                select: 'content type createdAt read sender',
                populate: {
                    path: 'sender',
                    select: 'username avatar'
                }
            })
            .lean();

        if (!user?.conversations) {
            return res.json([]);
        }

        // Sắp xếp và lọc conversations
        const sortedConversations = user.conversations
            .filter(conv => conv.lastMessage)
            .map(conv => ({
                ...conv,
                lastMessage: {
                    ...conv.lastMessage,
                    createdAt: new Date(conv.lastMessage.createdAt).toISOString()
                }
            }))
            .sort((a, b) => 
                new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt)
            );

        res.json(sortedConversations);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Lấy lịch sử chat
router.get('/messages/:userId', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const messages = await Message.find({
            $or: [
                { sender: req.user.id, receiver: req.params.userId },
                { sender: req.params.userId, receiver: req.user.id }
            ]
        })
        .select('content type createdAt read sender')
        .populate('sender', 'username avatar')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .lean();

        // Đảm bảo định dạng thời gian nhất quán
        const formattedMessages = messages.map(msg => ({
            ...msg,
            createdAt: new Date(msg.createdAt).toISOString()
        }));

        res.json({
            messages: formattedMessages.reverse(),
            page,
            hasMore: messages.length === limit
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Lấy danh sách user online
router.get('/online-users', auth, async (req, res) => {
    try {
        const users = await User.find({
            isOnline: true,
            _id: { $ne: req.user.id }
        })
        .select('username avatar isOnline lastActive')
        .sort('-lastActive')
        .lean();

        // Đảm bảo định dạng thời gian nhất quán
        const formattedUsers = users.map(user => ({
            ...user,
            lastActive: new Date(user.lastActive).toISOString()
        }));

        res.json(formattedUsers);
    } catch (error) {
        console.error('Error fetching online users:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;