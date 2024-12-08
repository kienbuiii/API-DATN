const User = require('../models/User');
const Message = require('../models/Message');
const {uploadToCloudinary} = require('../config/cloudinaryConfig');

const adminChatHandler = (io, socket) => {
    // Xử lý admin kết nối
    socket.on('admin_connected', async (adminId) => {
        try {
            // Cập nhật trạng thái admin
            const updatedAdmin = await User.findByIdAndUpdate(
                adminId,
                {
                    isOnline: true,
                    lastActive: new Date(),
                    socketId: socket.id
                },
                { new: true }
            ).select('username avatar isOnline');

            if (updatedAdmin) {
                // Join vào room riêng của admin
                socket.join(`admin_${adminId}`);

                // Broadcast trạng thái online của admin cho tất cả users
                io.emit('user_status_changed', {
                    userId: updatedAdmin._id,
                    isOnline: true,
                    username: updatedAdmin.username,
                    avatar: updatedAdmin.avatar,
                    isAdmin: true
                });

                // Lấy danh sách users online
                const onlineUsers = await User.find({ 
                    isOnline: true,
                    role: { $ne: 'admin' }
                })
                .select('_id username avatar isOnline lastActive')
                .lean();

                // Gửi danh sách users online cho admin
                socket.emit('onlineUsers', onlineUsers);
            }
        } catch (error) {
            console.error('Error in admin_connected:', error);
        }
    });

    // Xử lý admin ngắt kết nối
    socket.on('admin_disconnect', async (adminId) => {
        try {
            // Cập nhật trạng thái admin
            const updatedAdmin = await User.findByIdAndUpdate(
                adminId,
                {
                    isOnline: false,
                    lastActive: new Date(),
                    socketId: null
                },
                { new: true }
            ).select('_id username avatar');

            if (updatedAdmin) {
                // Rời khỏi room admin
                socket.leave(`admin_${adminId}`);

                // Broadcast trạng thái offline của admin
                io.emit('user_status_changed', {
                    userId: updatedAdmin._id,
                    isOnline: false,
                    username: updatedAdmin.username,
                    avatar: updatedAdmin.avatar,
                    lastActive: new Date(),
                    isAdmin: true
                });
            }
        } catch (error) {
            console.error('Error in admin_disconnect:', error);
        }
    });

    // Xử lý ngắt kết nối đột ngột
    socket.on('disconnect', async () => {
        try {
            // Tìm admin bằng socketId
            const admin = await User.findOneAndUpdate(
                { socketId: socket.id, role: 'admin' },
                {
                    isOnline: false,
                    lastActive: new Date(),
                    socketId: null
                },
                { new: true }
            ).select('_id username avatar');

            if (admin) {
                // Broadcast trạng thái offline
                io.emit('user_status_changed', {
                    userId: admin._id,
                    isOnline: false,
                    username: admin.username,
                    avatar: admin.avatar,
                    lastActive: new Date(),
                    isAdmin: true
                });
            }
        } catch (error) {
            console.error('Error in disconnect:', error);
        }
    });

    // Xử lý admin join chat với user
    socket.on('admin_join_chat', async (userId) => {
        try {
            socket.join(`chat_${userId}`);
            console.log('Admin joined chat with user:', userId);
        } catch (error) {
            console.error('Error in admin_join_chat:', error);
        }
    });

    // Xử lý admin gửi tin nhắn
    socket.on('admin_message', async (data) => {
        try {
            const { userId, text, type = 'text', adminId } = data;

            // Tạo tin nhắn mới
            const newMessage = await Message.create({
                sender: adminId,
                receiver: userId,
                content: text,
                type,
                isAdminMessage: true,
                read: false
            });

            // Populate thông tin sender
            const populatedMessage = await Message.findById(newMessage._id)
                .populate('sender', 'username avatar role')
                .lean();

            // Gửi tin nhắn cho user
            io.to(`user_${userId}`).emit('receive_message', {
                ...populatedMessage,
                isAdminMessage: true
            });

            // Gửi xác nhận cho admin
            socket.emit('message_sent', {
                ...populatedMessage,
                tempId: data.tempId
            });

            // Cập nhật conversation
            const updateConversation = async (userId, partnerId) => {
                const user = await User.findById(userId);
                if (!user) return;

                const convIndex = user.conversations.findIndex(
                    conv => conv.with.toString() === partnerId.toString()
                );

                if (convIndex === -1) {
                    user.conversations.unshift({
                        with: partnerId,
                        lastMessage: newMessage._id,
                        unreadCount: userId === newMessage.receiver ? 1 : 0
                    });
                } else {
                    user.conversations[convIndex].lastMessage = newMessage._id;
                    if (userId === newMessage.receiver) {
                        user.conversations[convIndex].unreadCount += 1;
                    }
                    const [conv] = user.conversations.splice(convIndex, 1);
                    user.conversations.unshift(conv);
                }

                await user.save();
            };

            // Cập nhật conversations cho cả admin và user
            await Promise.all([
                updateConversation(adminId, userId),
                updateConversation(userId, adminId)
            ]);

            // Gửi cập nhật conversation
            const conversationUpdate = {
                messageId: newMessage._id,
                content: text,
                createdAt: newMessage.createdAt,
                senderId: adminId,
                receiverId: userId,
                type
            };

            socket.emit('conversation_updated', conversationUpdate);
            io.to(`user_${userId}`).emit('conversation_updated', conversationUpdate);

        } catch (error) {
            console.error('Error in admin_message:', error);
            socket.emit('message_error', { 
                error: 'Failed to send message',
                tempId: data.tempId 
            });
        }
    });

    // Xử lý admin đánh dấu đã đọc
    socket.on('admin_mark_read', async (data) => {
        try {
            const { userId, adminId } = data;
            
            await Message.updateMany(
                {
                    sender: userId,
                    receiver: adminId,
                    read: false
                },
                { read: true }
            );

            // Cập nhật unreadCount trong conversation
            await User.findOneAndUpdate(
                { 
                    _id: adminId,
                    'conversations.with': userId 
                },
                { 
                    $set: { 'conversations.$.unreadCount': 0 }
                }
            );

            // Thông báo cho user
            io.to(`user_${userId}`).emit('messages_marked_read', {
                byUserId: adminId,
                forUserId: userId
            });

            socket.emit('messages_marked_read_success', { userId });

        } catch (error) {
            console.error('Error in admin_mark_read:', error);
        }
    });

    // Xử lý admin typing
    socket.on('admin_typing', (data) => {
        const { userId, isTyping } = data;
        io.to(`user_${userId}`).emit('admin_typing_status', { isTyping });
    });

    socket.on('admin_send_image', async (data) => {
        try {
            const { userId, image, adminId, caption = '' } = data;
    
            // Upload ảnh lên Cloudinary
            const result = await uploadToCloudinary(image);
            
            // Tạo tin nhắn mới với hình ảnh
            const newMessage = await Message.create({
                sender: adminId,
                receiver: userId,
                content: result.secure_url,
                caption: caption,
                type: 'image',
                isAdminMessage: true,
                read: false
            });
    
            // Populate thông tin sender
            const populatedMessage = await Message.findById(newMessage._id)
                .populate('sender', 'username avatar role')
                .lean();
    
            // Gửi tin nhắn cho user
            io.to(`user_${userId}`).emit('receive_message', {
                ...populatedMessage,
                isAdminMessage: true
            });
    
            // Gửi xác nhận cho admin
            socket.emit('message_sent', {
                ...populatedMessage,
                tempId: data.tempId
            });
    
            // Cập nhật conversation
            const conversationUpdate = {
                messageId: newMessage._id,
                content: result.secure_url,
                caption: caption,
                createdAt: newMessage.createdAt,
                senderId: adminId,
                receiverId: userId,
                type: 'image'
            };
    
            socket.emit('conversation_updated', conversationUpdate);
            io.to(`user_${userId}`).emit('conversation_updated', conversationUpdate);
    
        } catch (error) {
            console.error('Error in admin_send_image:', error);
            socket.emit('message_error', { 
                error: 'Failed to send image',
                tempId: data.tempId 
            });
        }
    });
    
};

module.exports = { adminChatHandler };
