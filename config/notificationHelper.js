const Notification = require('../models/Notification');
const { admin, db } = require('./firebase');
const firebase = require('firebase-admin');
const User = require('../models/User');

// Thay đổi cấu trúc ref để userID đứng trước
const getNotificationsRef = (userId) => db.ref(`notifications/${userId}`);

const createNotification = async (data) => {
    try {
        // console.log('Creating notification:', data);

        // Lưu vào MongoDB
        const notificationData = {
            recipient: data.recipientId,
            sender: data.senderId,
            type: data.type,
            read: false
        };

        // Chỉ thêm postId nếu nó tồn tại
        if (data.postId) {
            notificationData.post = data.postId;
        }

        const notification = new Notification(notificationData);
        const savedNotification = await notification.save();

        // Chuẩn bị dữ liệu cho Firebase
        const firebaseData = {
            recipient: data.recipientId,
            sender: data.senderId,
            type: data.type,
            read: false,
            senderName: data.senderName,
            senderAvatar: data.senderAvatar,
            createdAt: admin.database.ServerValue.TIMESTAMP
        };

        // Chỉ thêm postId vào firebaseData nếu nó tồn tại
        if (data.postId) {
            firebaseData.post = data.postId;
        }

        // Lấy ref theo userID
        const userNotificationsRef = getNotificationsRef(data.recipientId);
        
        // Lưu vào Firebase
        await userNotificationsRef.child(savedNotification._id.toString()).set(firebaseData);

        console.log('Notification saved with path:', `notifications/${data.recipientId}/${savedNotification._id}`);

        return savedNotification;
    } catch (error) {
        console.error('Error creating notification:', error);
        throw error;
    }
};

// Thêm hàm để đánh dấu đã đọc
const markNotificationAsRead = async (userId, notificationId) => {
    try {
        // Cập nhật trong MongoDB
        await Notification.findByIdAndUpdate(notificationId, { read: true });

        // Cập nhật trong Firebase
        const userNotificationsRef = getNotificationsRef(userId);
        await userNotificationsRef.child(notificationId).update({ read: true });

        return true;
    } catch (error) {
        console.error('Error marking notification as read:', error);
        throw error;
    }
};

// Thêm hàm để xóa thông báo
const deleteNotification = async (userId, notificationId) => {
    try {
        // Xóa trong MongoDB
        await Notification.findByIdAndDelete(notificationId);

        // Xóa trong Firebase
        const userNotificationsRef = getNotificationsRef(userId);
        await userNotificationsRef.child(notificationId).remove();

        return true;
    } catch (error) {
        console.error('Error deleting notification:', error);
        throw error;
    }
};

// Thêm hàm tạo thông báo cho admin
const createAdminNotification = async (data) => {
    try {
        const adminUsers = await User.find({ role: 'admin' });
        
        const notificationPromises = adminUsers.map(async (admin) => {
            const notificationData = {
                recipient: admin._id,
                sender: data.senderId,
                type: data.type,
                read: false
            };

            if (data.postId) notificationData.post = data.postId;
            if (data.reportId) notificationData.report = data.reportId;
            if (data.userId) notificationData.user = data.userId;

            const notification = new Notification(notificationData);
            const savedNotification = await notification.save();

            const firebaseData = {
                recipient: admin._id.toString(),
                sender: data.senderId,
                type: data.type,
                read: false,
                senderName: data.senderName,
                senderAvatar: data.senderAvatar,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                message: data.message || '',
                priority: data.priority || 'normal'
            };

            if (data.postId) firebaseData.post = data.postId;
            if (data.reportId) firebaseData.report = data.reportId;
            if (data.userId) firebaseData.user = data.userId;

            const userNotificationsRef = getNotificationsRef(admin._id.toString());
            await userNotificationsRef.child(savedNotification._id.toString()).set(firebaseData);

            return savedNotification;
        });

        return await Promise.all(notificationPromises);
    } catch (error) {
        console.error('Error creating admin notification:', error);
        throw error;
    }
};

// Hàm lấy tất cả thông báo của admin
const getAdminNotifications = async (adminId, page = 1, limit = 20) => {
    try {
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({ recipient: adminId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('sender', 'username avatar')
            .populate('post', 'title')
            .lean();

        const total = await Notification.countDocuments({ recipient: adminId });

        return {
            notifications,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                total,
                hasMore: total > skip + notifications.length
            }
        };
    } catch (error) {
        console.error('Error getting admin notifications:', error);
        throw error;
    }
};

// Hàm đánh dấu đã đọc tất cả thông báo của admin
const markAllAdminNotificationsAsRead = async (adminId) => {
    try {
        // Cập nhật trong MongoDB
        await Notification.updateMany(
            { recipient: adminId, read: false },
            { read: true }
        );

        // Cập nhật trong Firebase
        const userNotificationsRef = getNotificationsRef(adminId);
        const snapshot = await userNotificationsRef.once('value');
        const updates = {};
        
        snapshot.forEach(child => {
            if (!child.val().read) {
                updates[`${child.key}/read`] = true;
            }
        });

        if (Object.keys(updates).length > 0) {
            await userNotificationsRef.update(updates);
        }

        return true;
    } catch (error) {
        console.error('Error marking all admin notifications as read:', error);
        throw error;
    }
};

// Hàm xóa thông báo của admin
const deleteAdminNotification = async (adminId, notificationId) => {
    try {
        // Xóa trong MongoDB
        await Notification.findOneAndDelete({
            _id: notificationId,
            recipient: adminId
        });

        // Xóa trong Firebase
        const userNotificationsRef = getNotificationsRef(adminId);
        await userNotificationsRef.child(notificationId).remove();

        return true;
    } catch (error) {
        console.error('Error deleting admin notification:', error);
        throw error;
    }
};

// Thêm enum NOTIFICATION_TYPES
const NOTIFICATION_TYPES = {
    NEW_REPORT: 'new_report',
    NEW_USER: 'new_user',
    NEW_POST: 'new_post',
    USER_VERIFICATION: 'user_verification',
    REPORT_STATUS_UPDATE: 'report_status_update'
};

// Export NOTIFICATION_TYPES
module.exports = { 
    createNotification,
    markNotificationAsRead,
    deleteNotification,
    createAdminNotification,
    getAdminNotifications,
    markAllAdminNotificationsAsRead,
    deleteAdminNotification,
    NOTIFICATION_TYPES      ,
    
};