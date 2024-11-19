const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');
const { onlineUsers, lastActiveTime } = require('../socketHandlers/chatHandlers');

// Get all users except current user
router.get('/all-users', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const allUsers = await User.find({ _id: { $ne: userId } }, 'username avatar');
        const usersWithStatus = allUsers.map(user => ({
            ...user.toObject(),
            isOnline: onlineUsers.has(user._id.toString()),
            lastActive: lastActiveTime.get(user._id.toString()) || null
        }));
        res.json(usersWithStatus);
    } catch (error) {
        console.error('Server error in /api/all-users:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get chat history for a user
router.get('/chat-history/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const chatHistory = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { senderId: new mongoose.Types.ObjectId(userId) },
                        { receiverId: new mongoose.Types.ObjectId(userId) }
                    ]
                }
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$senderId", new mongoose.Types.ObjectId(userId)] },
                            "$receiverId",
                            "$senderId"
                        ]
                    },
                    lastMessage: { $last: "$$ROOT" }
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "userDetails"
                }
            },
            {
                $project: {
                    id: "$_id",
                    username: { $arrayElemAt: ["$userDetails.username", 0] },
                    avatar: { $arrayElemAt: ["$userDetails.avatar", 0] },
                    lastMessage: 1
                }
            }
        ]);
        res.json(chatHistory);
    } catch (error) {
        console.error('Server error in /api/chat-history/:userId:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get messages between two users
router.get('/messages/:senderId/:receiverId', authMiddleware, async (req, res) => {
    const { senderId, receiverId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).json({ message: 'Invalid senderId or receiverId' });
    }
    
    try {
        const messages = await Message.find({
            $or: [
                { senderId, receiverId },
                { senderId: receiverId, receiverId: senderId }
            ]
        })
        .sort({ createdAt: 1 })
        .populate('senderId', 'username')
        .populate('receiverId', 'username');

        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// API gửi tin nhắn
router.post('/send-message', authMiddleware, async (req, res) => {
    try {
        const { receiverId, text, type = 'text' } = req.body;
        const senderId = req.user.id;

        // Validate input
        if (!text || !text.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Message text is required'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(receiverId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid receiver ID'
            });
        }

        // Kiểm tra người nhận tồn tại
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({
                success: false,
                message: 'Receiver not found'
            });
        }

        // Tạo tin nhắn mới
        const newMessage = new Message({
            senderId,
            receiverId,
            text,
            type,
            status: 'sent',
            createdAt: new Date()
        });

        await newMessage.save();

        // Populate thông tin chi tiết
        const populatedMessage = await Message.findById(newMessage._id)
            .populate('senderId', 'username avatar')
            .populate('receiverId', 'username avatar');

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            // Gửi tin nhắn tới cả người gửi và người nhận
            io.to(`user_${senderId}`).emit('newMessage', {
                success: true,
                message: populatedMessage
            });
            
            io.to(`user_${receiverId}`).emit('newMessage', {
                success: true,
                message: populatedMessage
            });

            // Nếu người nhận offline, gửi thông báo
            if (!onlineUsers.has(receiverId)) {
                io.to(`user_${receiverId}`).emit('unreadMessage', {
                    success: true,
                    from: senderId,
                    message: populatedMessage
                });
            } else {
                // Nếu online, cập nhật trạng thái delivered
                newMessage.status = 'delivered';
                await newMessage.save();
            }
        }

        // Trả về response
        res.status(201).json({
            success: true,
            message: 'Message sent successfully',
            data: {
                messageId: populatedMessage._id,
                senderId: populatedMessage.senderId,
                receiverId: populatedMessage.receiverId,
                text: populatedMessage.text,
                type: populatedMessage.type,
                status: populatedMessage.status,
                createdAt: populatedMessage.createdAt,
                sender: {
                    username: populatedMessage.senderId.username,
                    avatar: populatedMessage.senderId.avatar
                },
                receiver: {
                    username: populatedMessage.receiverId.username,
                    avatar: populatedMessage.receiverId.avatar
                }
            }
        });

    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: error.message
        });
    }
});

// API đánh dấu tin nhắn đã đọc
router.put('/mark-read/:messageId', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        // Kiểm tra quyền đánh dấu đã đọc
        if (message.receiverId.toString() !== userId) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Cập nhật trạng thái đã đọc
        message.read = true;
        await message.save();

        // Populate thông tin
        const populatedMessage = await Message.findById(messageId)
            .populate('senderId', 'username avatar')
            .populate('receiverId', 'username avatar');

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`user_${message.senderId}`).emit('messageRead', populatedMessage);
            io.to(`user_${message.receiverId}`).emit('messageRead', populatedMessage);
        }

        res.json({
            success: true,
            message: 'Message marked as read',
            data: populatedMessage
        });

    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error marking message as read', 
            error: error.message 
        });
    }
});

// API lấy tin nhắn chưa đọc
router.get('/unread', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const unreadMessages = await Message.find({
            receiverId: userId,
            read: false
        })
        .populate('senderId', 'username avatar')
        .populate('receiverId', 'username avatar')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: unreadMessages.length,
            data: unreadMessages
        });

    } catch (error) {
        console.error('Get unread messages error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error getting unread messages', 
            error: error.message 
        });
    }
});

module.exports = router;