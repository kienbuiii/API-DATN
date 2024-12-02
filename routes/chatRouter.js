const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const auth = require('../middleware/auth');
const VideoCall = require('../models/VideoCall');

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

// Khởi tạo cuộc gọi video
router.post('/video-call/init', auth, async (req, res) => {
    try {
        const { receiverId } = req.body;

        // Kiểm tra người nhận có online không
        const receiver = await User.findById(receiverId).select('isOnline socketId');
        if (!receiver || !receiver.isOnline) {
            return res.status(400).json({ 
                message: 'Người dùng không trực tuyến' 
            });
        }

        // Kiểm tra xem người nhận có đang trong cuộc gọi khác không
        const existingCall = await VideoCall.findOne({
            $or: [
                { caller: receiverId, status: 'active' },
                { receiver: receiverId, status: 'active' }
            ]
        });

        if (existingCall) {
            return res.status(400).json({
                message: 'Người dùng đang trong cuộc gọi khác'
            });
        }

        const channelName = `${req.user.id}-${receiverId}-${Date.now()}`;
        
        // Lấy thông tin người gọi
        const caller = await User.findById(req.user.id)
            .select('username avatar socketId')
            .lean();
        
        // Tạo bản ghi cuộc gọi mới
        const newCall = new VideoCall({
            channelName,
            caller: req.user.id,
            receiver: receiverId,
            status: 'pending',
            startTime: new Date()
        });
        await newCall.save();

        const io = req.app.get('io');
        
        // Gửi thông báo đến người nhận
        io.to(receiver.socketId).emit('incoming_call', {
            channelName,
            callerId: req.user.id,
            callerName: caller.username,
            callerAvatar: caller.avatar,
            callType: 'video'
        });

        // Tạo timeout để tự động hủy cuộc gọi nếu không có phản hồi
        const timeoutId = setTimeout(async () => {
            try {
                // Cập nhật trạng thái cuộc gọi
                await VideoCall.findOneAndUpdate(
                    { channelName },
                    { status: 'missed', endTime: new Date() }
                );

                // Thông báo cho cả hai bên
                io.to(receiver.socketId).emit('call_timeout', {
                    channelName,
                    callerId: req.user.id
                });
                
                io.to(caller.socketId).emit('call_no_answer', {
                    channelName,
                    receiverId
                });
            } catch (error) {
                console.error('Timeout handling error:', error);
            }
        }, 30000);

        // Lưu timeoutId vào cache hoặc database để có thể hủy nếu cần
        // Ví dụ: await cache.set(`call_timeout:${channelName}`, timeoutId);
        
        res.json({ 
            channelName,
            callUrl: `/video-call.html?channel=${channelName}&userId=${req.user.id}&callType=video`
        });
    } catch (error) {
        console.error('Error initiating video call:', error);
        res.status(500).json({ message: 'Error initiating video call' });
    }
});

// Xử lý chấp nhận cuộc gọi
router.post('/video-call/accept', auth, async (req, res) => {
    try {
        const { channelName, callerId } = req.body;

        // Cập nhật trạng thái cuộc gọi
        const call = await VideoCall.findOneAndUpdate(
            { channelName, status: 'pending' },
            { status: 'active', acceptTime: new Date() },
            { new: true }
        );

        if (!call) {
            return res.status(404).json({
                message: 'Cuộc gọi không tồn tại hoặc đã kết thúc'
            });
        }

        const io = req.app.get('io');
        
        // Thông báo cho người gọi
        io.to(call.caller.socketId).emit('call_accepted', {
            channelName,
            receiverId: req.user.id
        });

        res.json({
            success: true,
            channelName,
            callUrl: `/video-call.html?channel=${channelName}&userId=${req.user.id}&callType=video`
        });
    } catch (error) {
        console.error('Error accepting video call:', error);
        res.status(500).json({ message: 'Lỗi khi chấp nhận cuộc gọi' });
    }
});

// Xử lý từ chối cuộc gọi
router.post('/video-call/reject', auth, async (req, res) => {
    try {
        const { channelName, callerId } = req.body;

        // Cập nhật trạng thái cuộc gọi
        const call = await VideoCall.findOneAndUpdate(
            { channelName, status: 'pending' },
            { status: 'rejected', endTime: new Date() },
            { new: true }
        );

        if (!call) {
            return res.status(404).json({
                message: 'Cuộc gọi không tồn tại hoặc đã kết thúc'
            });
        }

        const io = req.app.get('io');
        
        // Thông báo cho người gọi
        io.to(call.caller.socketId).emit('call_rejected', {
            channelName,
            receiverId: req.user.id
        });

        res.json({ 
            success: true,
            message: 'Đã từ chối cuộc gọi'
        });
    } catch (error) {
        console.error('Error rejecting video call:', error);
        res.status(500).json({ message: 'Lỗi khi từ chối cuộc gọi' });
    }
});

// Xử lý kết thúc cuộc gọi
router.post('/video-call/end', auth, async (req, res) => {
    try {
        const { channelName, receiverId, duration } = req.body;

        // Tìm cuộc gọi hiện tại
        const call = await VideoCall.findOne({ 
            channelName,
            status: { $in: ['pending', 'active'] } // Cho phép kết thúc cả cuộc gọi đang chờ
        });

        if (!call) {
            return res.status(404).json({
                message: 'Cuộc gọi không tồn tại hoặc đã kết thúc'
            });
        }

        // Cập nhật thông tin cuộc gọi
        const endTime = new Date();
        const callDuration = duration || 0; // Sử dụng duration từ client hoặc mặc định là 0

        call.status = 'ended';
        call.endTime = endTime;
        call.duration = callDuration;

        // Lưu các thay đổi
        await call.save();

        const io = req.app.get('io');
        
        // Thông báo cho cả người gọi và người nhận
        if (receiverId) {
            const receiver = await User.findById(receiverId).select('socketId');
            if (receiver?.socketId) {
                io.to(receiver.socketId).emit('call_ended', {
                    channelName,
                    callerId: req.user.id
                });
            }
        }

        // Thông báo cho người gọi (nếu người kết thúc là người nhận)
        if (call.caller.toString() !== req.user.id) {
            const caller = await User.findById(call.caller).select('socketId');
            if (caller?.socketId) {
                io.to(caller.socketId).emit('call_ended', {
                    channelName,
                    receiverId: req.user.id
                });
            }
        }

        res.json({ 
            success: true,
            message: 'Cuộc gọi đã kết thúc',
            duration: callDuration
        });

    } catch (error) {
        console.error('Error ending video call:', error);
        // Thêm chi tiết lỗi để debug
        res.status(500).json({ 
            message: 'Lỗi khi kết thúc cuộc gọi',
            error: error.message 
        });
    }
});

// Lấy lịch sử cuộc gọi
router.get('/video-call/history', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const calls = await VideoCall.find({
            $or: [
                { caller: req.user.id },
                { receiver: req.user.id }
            ]
        })
        .populate('caller', 'username avatar')
        .populate('receiver', 'username avatar')
        .sort('-startTime')
        .skip(skip)
        .limit(limit)
        .lean();

        const formattedCalls = calls.map(call => ({
            ...call,
            startTime: new Date(call.startTime).toISOString(),
            endTime: call.endTime ? new Date(call.endTime).toISOString() : null,
            acceptTime: call.acceptTime ? new Date(call.acceptTime).toISOString() : null
        }));

        res.json({
            calls: formattedCalls,
            page,
            hasMore: calls.length === limit
        });
    } catch (error) {
        console.error('Error fetching call history:', error);
        res.status(500).json({ message: 'Lỗi khi lấy lịch sử cuộc gọi' });
    }
});

module.exports = router;