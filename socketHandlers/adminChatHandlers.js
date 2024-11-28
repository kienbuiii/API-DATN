const User = require('../models/User');
const Message = require('../models/Message');

const adminChatHandler = (io, socket) => {
    // Xử lý admin kết nối
    socket.on('adminConnected', async (adminId) => {
        try {
            console.log('Admin connected:', adminId);
            socket.join(`admin_${adminId}`);
            
            // Thông báo cho tất cả users biết admin online
            io.emit('adminStatusChanged', { adminId, isOnline: true });
        } catch (error) {
            console.error('Error in admin connect:', error);
        }
    });

    // Xử lý admin join chat room
    socket.on('adminJoinChat', ({ adminId, userId }) => {
        try {
            // Join cả hai phiên bản của chat room
            const chatRoom1 = `chat_${adminId}_${userId}`;
            const chatRoom2 = `chat_${userId}_${adminId}`;
            socket.join([chatRoom1, chatRoom2]);
            console.log(`Admin ${adminId} joined chat rooms with user ${userId}`);
        } catch (error) {
            console.error('Error joining chat room:', error);
        }
    });

    // Xử lý admin gửi tin nhắn
    socket.on('adminSendMessage', async (data) => {
        try {
            const { adminId, userId, text, type = 'text' } = data;
            
            // Tạo tin nhắn mới
            const newMessage = new Message({
                sender: adminId,
                receiver: userId,
                content: text,
                type,
                isAdminMessage: true
            });

            await newMessage.save();

            // Populate thông tin
            const populatedMessage = await Message.findById(newMessage._id)
                .populate('sender', 'username avatar')
                .populate('receiver', 'username avatar');

            // Gửi tin nhắn đến cả hai phiên bản của chat room
            const chatRoom1 = `chat_${adminId}_${userId}`;
            const chatRoom2 = `chat_${userId}_${adminId}`;
            io.to([chatRoom1, chatRoom2]).emit('newMessage', {
                message: populatedMessage
            });

            // Gửi thông báo cho user
            io.to(`user_${userId}`).emit('messageReceived', {
                message: populatedMessage
            });

            // Gửi xác nhận về cho admin
            socket.emit('messageSent', {
                success: true,
                message: populatedMessage
            });

        } catch (error) {
            console.error('Error sending admin message:', error);
            socket.emit('messageError', { message: 'Không thể gửi tin nhắn' });
        }
    });

    // Xử lý admin đang nhập
    socket.on('adminTyping', ({ adminId, userId }) => {
        const chatRoom = `chat_${adminId}_${userId}`;
        socket.to(chatRoom).emit('adminTyping', { adminId });
    });

    // Xử lý admin dừng nhập
    socket.on('adminStopTyping', ({ adminId, userId }) => {
        const chatRoom = `chat_${adminId}_${userId}`;
        socket.to(chatRoom).emit('adminStopTyping', { adminId });
    });

    // Xử lý admin đánh dấu đã đọc
    socket.on('adminMarkRead', async ({ adminId, userId }) => {
        try {
            await Message.updateMany(
                {
                    sender: userId,
                    receiver: adminId,
                    read: false
                },
                { read: true }
            );

            // Thông báo cho user tin nhắn đã được đọc
            io.to(`user_${userId}`).emit('messagesRead', { by: adminId });
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    });

    // Xử lý admin rời chat room
    socket.on('adminLeaveChat', ({ adminId, userId }) => {
        const chatRoom = `chat_${adminId}_${userId}`;
        socket.leave(chatRoom);
    });

    // Xử lý admin disconnect
    socket.on('disconnect', async () => {
        try {
            // Thông báo cho tất cả users biết admin offline
            io.emit('adminStatusChanged', { 
                adminId: socket.adminId,
                isOnline: false,
                lastActive: new Date()
            });
        } catch (error) {
            console.error('Error in admin disconnect:', error);
        }
    });
};

module.exports = { adminChatHandler };