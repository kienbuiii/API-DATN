const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');
const { onlineUsers, lastActiveTime } = require('../socketHandlers');

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

module.exports = router;