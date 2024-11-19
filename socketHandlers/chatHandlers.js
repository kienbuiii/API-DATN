const Message = require('../models/Message');
const User = require('../models/User');

// Lưu trạng thái người dùng
const onlineUsers = new Map(); // Lưu trữ userId -> socketId
const userSockets = new Map(); // Lưu trữ socketId -> userId
const lastActiveTime = new Map(); // Lưu trữ userId -> lastActiveTime

const chatHandler = (io, socket) => {
    // Xử lý khi user kết nối
    socket.on('userConnected', async (userId) => {
        try {
            // Lưu thông tin user online
            onlineUsers.set(userId, socket.id);
            userSockets.set(socket.id, userId);
            lastActiveTime.set(userId, new Date());

            // Join vào room cá nhân
            socket.join(`user_${userId}`);

            // Thông báo cho tất cả user khác về trạng thái online
            io.emit('userStatusChanged', {
                userId,
                isOnline: true,
                lastActive: new Date()
            });

            // Gửi danh sách user online cho client vừa kết nối
            const onlineUsersList = Array.from(onlineUsers.keys());
            socket.emit('onlineUsers', onlineUsersList);

        } catch (error) {
            console.error('Error in userConnected:', error);
        }
    });

    socket.on('joinChat', ({ userId, receiverId }) => {
        socket.join(`chat_${userId}_${receiverId}`);
        socket.join(`chat_${receiverId}_${userId}`);
    });

    // Xử lý gửi tin nhắn
    socket.on('sendMessage', async (messageData) => {
        try {
            console.log('Received message data:', messageData); // Debug log

            const { senderId, receiverId, text, type = 'text' } = messageData;

            // Detailed validation
            if (!senderId) {
                throw new Error('senderId is required');
            }
            if (!receiverId) {
                throw new Error('receiverId is required');
            }
            if (!text || !text.trim()) {
                throw new Error('message text is required');
            }

            // Create new message
            const newMessage = new Message({
                senderId,
                receiverId,
                text: text.trim(),
                type,
                status: 'sent',
                createdAt: new Date(),
                read: false
            });

            console.log('Creating new message:', newMessage); // Debug log

            await newMessage.save();

            // Populate thông tin người gửi và người nhận
            const populatedMessage = await Message.findById(newMessage._id)
                .populate('senderId', 'username avatar')
                .populate('receiverId', 'username avatar');

            // Gửi tin nhắn đến cả người gửi và người nhận
            io.to(`chat_${senderId}_${receiverId}`)
              .to(`chat_${receiverId}_${senderId}`)
              .emit('newMessage', {
                success: true,
                message: populatedMessage
            });

            // Kiểm tra trạng thái online
            if (!onlineUsers.has(receiverId)) {
                io.to(`user_${receiverId}`).emit('unreadMessage', {
                    success: true,
                    from: senderId,
                    message: populatedMessage
                });
            } else {
                // Cập nhật trạng thái delivered nếu online
                newMessage.status = 'delivered';
                await newMessage.save();
            }

        } catch (error) {
            console.error('Error in sendMessage:', error);
            socket.emit('messageSendError', { 
                success: false,
                error: error.message 
            });
        }
    });

    // Xử lý đánh dấu tin nhắn đã đọc
    socket.on('markMessageRead', async ({ messageId, userId }) => {
        try {
            const message = await Message.findByIdAndUpdate(
                messageId,
                { read: true },
                { new: true }
            ).populate('senderId', 'username avatar')
             .populate('receiverId', 'username avatar');

            if (message) {
                io.to(`user_${message.senderId}`).emit('messageRead', message);
                io.to(`user_${message.receiverId}`).emit('messageRead', message);
            }
        } catch (error) {
            console.error('Error in markMessageRead:', error);
        }
    });

    // Xử lý typing status
    socket.on('typing', ({ senderId, receiverId }) => {
        io.to(`user_${receiverId}`).emit('userTyping', { userId: senderId });
    });

    socket.on('stopTyping', ({ senderId, receiverId }) => {
        io.to(`user_${receiverId}`).emit('userStopTyping', { userId: senderId });
    });

    // Xử lý khi user disconnect
    socket.on('disconnect', () => {
        const userId = userSockets.get(socket.id);
        if (userId) {
            // Cập nhật thời gian hoạt động cuối
            lastActiveTime.set(userId, new Date());
            
            // Xóa thông tin user khỏi danh sách online
            onlineUsers.delete(userId);
            userSockets.delete(socket.id);

            // Thông báo cho tất cả user khác
            io.emit('userStatusChanged', {
                userId,
                isOnline: false,
                lastActive: new Date()
            });
        }
    });

    // Xử lý lấy trạng thái online của một user
    socket.on('getUserStatus', async (userId) => {
        const isOnline = onlineUsers.has(userId);
        const lastActive = lastActiveTime.get(userId);
        socket.emit('userStatus', {
            userId,
            isOnline,
            lastActive
        });
    });
};

// Export các functions và biến cần thiết
module.exports = {
    chatHandler,
    onlineUsers,
    lastActiveTime,
    isUserOnline: (userId) => onlineUsers.has(userId)
};