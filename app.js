require('dotenv').config();
const express = require('express');
const http = require('http');
const connectDB = require('./config/db');
const soThich = require('./models/soThich');
const userRoutes = require('./routes/user');
const postRoutes = require('./routes/posts');
const scanRoutes = require('./routes/scan');
const travelPostRoutes = require('./routes/TravelPost');
const notificationRoutes = require('./routes/notification');
const socketIo = require('socket.io');
const chatHandler = require('./routes/chat');
const Notification = require('./models/Notification');

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
app.use('/api/notification', notificationRoutes);
// Khởi tạo chat handler
chatHandler(io, app);

// Socket connection handler
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log('User connected to socket');

    // Lưu thông tin user khi họ kết nối
    socket.on('userConnected', (userId) => {
        connectedUsers.set(userId, socket.id);
        socket.userId = userId;
        console.log(`User ${userId} connected`);
    });

    // Xử lý khi user ngắt kết nối
    socket.on('disconnect', () => {
        if (socket.userId) {
            connectedUsers.delete(socket.userId);
            console.log(`User ${socket.userId} disconnected`);
        }
    });
});

// Notification helper function
const sendNotification = async (notificationData) => {
    try {
        const notification = await Notification.create(notificationData);
        const populatedNotification = await Notification.findById(notification._id)
            .populate('sender', 'username avatar')
            .populate('post', 'content');

        const recipientSocketId = connectedUsers.get(notificationData.recipient.toString());
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('newNotification', populatedNotification);
        }

        return populatedNotification;
    } catch (error) {
        console.error('Error sending notification:', error);
        throw error;
    }
};

// Add sendNotification to app for use in routes
app.set('sendNotification', sendNotification);

const PORT = process.env.PORT;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));