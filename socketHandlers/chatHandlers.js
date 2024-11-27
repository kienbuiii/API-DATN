const User = require('../models/User');
const Message = require('../models/Message');

const chatHandler = (io, socket) => {
    // Xử lý user kết nối
    socket.on('user_connected', async (userId) => {
        try {
            // Cập nhật trạng thái user
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                {
                    isOnline: true,
                    lastActive: new Date(),
                    socketId: socket.id
                },
                { new: true }
            ).select('username avatar isOnline');

            if (updatedUser) {
                // Broadcast trạng thái online cho tất cả users
                io.emit('user_status_changed', {
                    userId: updatedUser._id,
                    isOnline: true,
                    username: updatedUser.username,
                    avatar: updatedUser.avatar
                });

                // Join vào room riêng của user
                socket.join(`user_${userId}`);
            }
        } catch (error) {
            console.error('Error in user_connected:', error);
        }
    });

    // Xử lý gửi tin nhắn
    socket.on('send_message', async (data) => {
        try {
            const { senderId, receiverId, content, type = 'text', tempId } = data;

            // Tạo và lưu tin nhắn mới
            const newMessage = await Message.create({
                sender: senderId,
                receiver: receiverId,
                content,
                type,
                read: false,
                createdAt: new Date()
            });

            // Populate thông tin sender
            const populatedMessage = await Message.findById(newMessage._id)
                .populate('sender', 'username avatar')
                .lean();

            // Cập nhật hoặc tạo conversation cho cả sender và receiver
            const updateConversation = async (userId, partnerId, unreadCount) => {
                const user = await User.findById(userId);
                const convIndex = user.conversations.findIndex(
                    conv => conv.with.toString() === partnerId
                );

                if (convIndex === -1) {
                    // Tạo conversation mới
                    user.conversations.unshift({
                        with: partnerId,
                        lastMessage: newMessage._id,
                        unreadCount
                    });
                } else {
                    // Cập nhật conversation hiện có
                    user.conversations[convIndex].lastMessage = newMessage._id;
                    user.conversations[convIndex].unreadCount = unreadCount;
                    // Đưa conversation lên đầu
                    const [conv] = user.conversations.splice(convIndex, 1);
                    user.conversations.unshift(conv);
                }

                await user.save();
            };

            // Cập nhật conversations
            await Promise.all([
                updateConversation(senderId, receiverId, 0),
                updateConversation(receiverId, senderId, 1)
            ]);

            // Gửi tin nhắn và cập nhật conversation
            const conversationUpdate = {
                messageId: newMessage._id,
                content,
                createdAt: newMessage.createdAt,
                senderId,
                receiverId,
                type
            };

            // Gửi cho receiver
            io.to(`user_${receiverId}`).emit('receive_message', populatedMessage);
            io.to(`user_${receiverId}`).emit('conversation_updated', conversationUpdate);

            // Gửi xác nhận cho sender
            socket.emit('message_sent', {
                ...populatedMessage,
                tempId
            });
            socket.emit('conversation_updated', conversationUpdate);

        } catch (error) {
            console.error('Error in send_message:', error);
            socket.emit('message_error', { 
                error: 'Failed to send message', 
                tempId: data.tempId 
            });
        }
    });

    // Xử lý đánh dấu đã đọc
    socket.on('mark_messages_read', async (data) => {
        try {
            const { userId, fromUserId } = data;
            
            // Cập nhật trạng thái tin nhắn và conversation
            await Promise.all([
                Message.updateMany(
                    {
                        sender: fromUserId,
                        receiver: userId,
                        read: false
                    },
                    { read: true }
                ),
                User.findOneAndUpdate(
                    { 
                        _id: userId,
                        'conversations.with': fromUserId 
                    },
                    { 
                        $set: { 'conversations.$.unreadCount': 0 }
                    }
                )
            ]);

            // Thông báo cho sender
            io.to(`user_${fromUserId}`).emit('messages_marked_read', { 
                fromUserId,
                byUserId: userId 
            });
        } catch (error) {
            console.error('Error in mark_messages_read:', error);
        }
    });

    // Xử lý ngắt kết nối
    socket.on('disconnect', async () => {
        try {
            const user = await User.findOneAndUpdate(
                { socketId: socket.id },
                {
                    isOnline: false,
                    lastActive: new Date(),
                    socketId: null
                },
                { new: true }
            ).select('_id username avatar');

            if (user) {
                socket.leave(`user_${user._id}`);
                io.emit('user_status_changed', {
                    userId: user._id,
                    isOnline: false,
                    username: user.username,
                    avatar: user.avatar,
                    lastActive: new Date()
                });
            }
        } catch (error) {
            console.error('Error in disconnect:', error);
        }
    });
};

module.exports = { chatHandler };