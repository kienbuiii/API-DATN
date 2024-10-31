const mongoose = require('mongoose');
const Message = require('./models/Message');
const Notification = require('./models/Notification');

let io = null;
let onlineUsers = new Map();
let lastActiveTime = new Map();

// Function để emit notification
async function emitNotification(notificationData) {
    try {
        // console.log('Creating notification:', notificationData);
        
        // Tạo notification mới
        const notification = new Notification(notificationData);
        await notification.save();
        // console.log('Notification saved:', notification);

        // Populate đầy đủ thông tin cho notification
        const populatedNotification = await Notification.findById(notification._id)
            .populate('sender', 'username avatar')
            .populate('post', 'title images')
            .populate('recipient', 'username avatar');
        
        // console.log('Populated notification:', populatedNotification);

        // Emit tới user cụ thể
        const recipientId = notificationData.recipient.toString();
        const recipientSocketId = onlineUsers.get(recipientId);
        
        console.log('Recipient socket info:', {
            recipientId,
            recipientSocketId,
            onlineUsers: Array.from(onlineUsers.entries())
        });

        if (recipientSocketId) {
            console.log('Emitting to socket:', recipientSocketId);
            // Gửi notification qua socket
            io.to(recipientSocketId).emit('newNotification', {
                ...populatedNotification.toObject(),
                createdAt: new Date(),
                isRead: false
            });
        }

        return populatedNotification;
    } catch (error) {
        console.error('Error emitting notification:', error);
        throw error;
    }
}

// Xử lý chat messages
async function handleChatMessage(socket, data) {
    try {
        const { senderId, receiverId, text } = data;

        // Validate input
        if (!senderId || !receiverId || !mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
            socket.emit('error', { message: 'Invalid senderId or receiverId' });
            return;
        }

        // Lưu tin nhắn vào database
        const message = new Message({ 
            senderId, 
            receiverId, 
            text,
            status: 'sent' 
        });
        await message.save();

        // Populate thông tin người gửi và người nhận
        const populatedMessage = await Message.findById(message._id)
            .populate('senderId', 'username avatar')
            .populate('receiverId', 'username avatar');

        // Gửi tin nhắn đến cả người gửi và người nhận
        socket.emit('receiveMessage', populatedMessage);
        
        // Kiểm tra người nhận có online không
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
            // Gửi tin nhắn đến người nhận
            io.to(receiverSocketId).emit('receiveMessage', populatedMessage);
            
            // Gửi thông báo tin nhắn mới
            io.to(receiverSocketId).emit('newMessageNotification', {
                senderId,
                senderName: populatedMessage.senderId.username,
                text
            });
        }

        // Cập nhật trạng thái tin nhắn
        message.status = receiverSocketId ? 'delivered' : 'sent';
        await message.save();

    } catch (error) {
        console.error('Error handling chat message:', error);
        socket.emit('error', { message: 'Error sending message' });
    }
}

// Xử lý trạng thái tin nhắn
async function handleMessageStatus(messageId, status) {
    try {
        const message = await Message.findByIdAndUpdate(
            messageId,
            { status },
            { new: true }
        ).populate('senderId', 'username avatar')
         .populate('receiverId', 'username avatar');

        if (message) {
            // Thông báo cập nhật trạng thái cho cả người gửi và người nhận
            const senderSocketId = onlineUsers.get(message.senderId._id.toString());
            const receiverSocketId = onlineUsers.get(message.receiverId._id.toString());

            if (senderSocketId) {
                io.to(senderSocketId).emit('messageStatusUpdated', { messageId, status });
            }
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('messageStatusUpdated', { messageId, status });
            }
        }
    } catch (error) {
        console.error('Error updating message status:', error);
    }
}

function handleSocket(socketIo) {
    io = socketIo;

    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);

        // Xử lý user kết nối
        socket.on('userConnected', (userId) => {
            if (!userId) return;
            
            console.log('User connected:', userId, 'Socket ID:', socket.id);
            onlineUsers.set(userId.toString(), socket.id);
            socket.join(`notification_${userId}`);
            
            // Gửi danh sách thông báo chưa đọc khi user kết nối
            Notification.find({ 
                recipient: userId,
                read: false 
            })
            .populate('sender', 'username avatar')
            .populate('post', 'title images')
            .sort({ createdAt: -1 })
            .then(notifications => {
                socket.emit('unreadNotifications', notifications);
            })
            .catch(error => {
                console.error('Error fetching unread notifications:', error);
            });
        });

        // Xử lý chat
        socket.on('sendMessage', (data) => handleChatMessage(socket, data));
        
        // Xử lý cập nhật trạng thái tin nhắn
        socket.on('updateMessageStatus', ({ messageId, status }) => {
            handleMessageStatus(messageId, status);
        });

        // Xử lý typing status
        socket.on('typing', ({ senderId, receiverId }) => {
            const receiverSocketId = onlineUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('userTyping', { userId: senderId });
            }
        });

        socket.on('stopTyping', ({ senderId, receiverId }) => {
            const receiverSocketId = onlineUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('userStopTyping', { userId: senderId });
            }
        });

        // Xử lý notifications
        socket.on('markAsRead', async (notificationId) => {
            try {
                const notification = await Notification.findByIdAndUpdate(
                    notificationId,
                    { read: true },
                    { new: true }
                ).populate('sender', 'username avatar')
                 .populate('post', 'title');

                if (notification) {
                    io.to(`notification_${notification.recipient}`).emit('notificationRead', {
                        notificationId,
                        notification
                    });
                }
            } catch (error) {
                console.error('Error marking notification as read:', error);
            }
        });

        socket.on('markAllRead', async (userId) => {
            try {
                const notifications = await Notification.updateMany(
                    { recipient: userId, read: false },
                    { read: true }
                );

                const updatedNotifications = await Notification.find({ recipient: userId })
                    .populate('sender', 'username avatar')
                    .populate('post', 'title');

                io.to(`notification_${userId}`).emit('allNotificationsRead', updatedNotifications);
            } catch (error) {
                console.error('Error marking all notifications as read:', error);
            }
        });

        // Xử lý disconnect
        socket.on('disconnect', () => {
            const userId = Array.from(onlineUsers.entries())
                .find(([_, value]) => value === socket.id)?.[0];
            
            if (userId) {
                console.log('User disconnected:', userId);
                onlineUsers.delete(userId);
                lastActiveTime.set(userId, new Date());
                io.emit('updateOnlineUsers', Array.from(onlineUsers.keys()));
            }
        });
    });
}

module.exports = {
    handleSocket,
    emitNotification,
    onlineUsers,
    lastActiveTime
};