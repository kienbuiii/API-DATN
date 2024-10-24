require('dotenv').config();
const express = require('express');
const http = require('http');
const connectDB = require('./config/db');
const userRoutes = require('./routes/user');
const postRoutes = require('./routes/posts');
const scanRoutes = require('./routes/scan');
const travelPostRoutes = require('./routes/TravelPost');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const User = require('./models/User');
const Message = require('./models/Message');
const soThich = require('./models/soThich');
const authMiddleware = require('./middleware/auth');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

connectDB();

app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/uploads', express.static('uploads'));
app.use('/api/posts', postRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/travel-posts', travelPostRoutes);
app.use('/api/soThich', soThich);



// Online users storage
let onlineUsers = new Map();

// Thêm biến để lưu trữ thời gian hoạt động cuối cùng của người dùng
let lastActiveTime = new Map();

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('userConnected', (userId) => {
        onlineUsers.set(userId, socket.id);
        lastActiveTime.set(userId, new Date());
        io.emit('updateOnlineUsers', Array.from(onlineUsers.keys()).map(id => ({ id })));
    });

    socket.on('sendMessage', async (data) => {
        try {
            const { senderId, receiverId, text } = data;
    
            if (!senderId || !receiverId || !mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
                socket.emit('error', { message: 'Invalid senderId or receiverId' });
                return;
            }
    
            const message = new Message({ senderId, receiverId, text });
            await message.save();
    
            const populatedMessage = await Message.findById(message._id)
                .populate('senderId', 'username')
                .populate('receiverId', 'username');
    
            io.emit('receiveMessage', populatedMessage);
            
            // Send notification to receiver if online
            const receiverSocketId = onlineUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('newMessageNotification', { senderId, text });
            }
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', { message: 'Error sending message' });
        }
    });

    socket.on('updateMessageStatus', async ({ messageId, status }) => {
        try {
            const message = await Message.findByIdAndUpdate(messageId, { status }, { new: true });
            if (message) {
                io.emit('messageStatusUpdated', { messageId, status });
            }
        } catch (error) {
            console.error('Error updating message status:', error);
        }
    });

    socket.on('disconnect', () => {
        const userId = Array.from(onlineUsers.entries()).find(([key, value]) => value === socket.id)?.[0];
        if (userId) {
            onlineUsers.delete(userId);
            lastActiveTime.set(userId, new Date());
            io.emit('updateOnlineUsers', Array.from(onlineUsers.keys()).map(id => ({ id })));
        }
        console.log('Client disconnected');
    });
});

// Sửa đổi route để lấy tất cả người dùng và trạng thái online
app.get('/api/all-users', authMiddleware, async (req, res) => {
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

// Get online users

// Get chat history
app.get('/api/chat-history/:userId', authMiddleware, async (req, res) => {
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
app.get('/api/messages/:senderId/:receiverId', authMiddleware, async (req, res) => {
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

// Route để gửi tin nhắn SMS
app.post('/api/send-sms', async (req, res) => {
    const { to, body } = req.body; // Lấy số điện thoại và nội dung tin nhắn từ request body

    try {
        const message = await twilioClient.messages.create({
            body,
            from: process.env.TWILIO_PHONE_NUMBER, // Số điện thoại Twilio của bạn
            to
        });
        res.json({ success: true, messageSid: message.sid });
    } catch (error) {
        console.error('Error sending SMS:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
