const Notification = require('../models/Notification');
const { admin, db } = require('./firebase');

// Thay đổi cấu trúc ref để userID đứng trước
const getNotificationsRef = (userId) => db.ref(`notifications/${userId}`);

const createNotification = async (data) => {
    try {
        console.log('Creating notification:', data);

        // Lưu vào MongoDB
        const notificationData = {
            recipient: data.recipientId,
            sender: data.senderId,
            type: data.type,
            content: data.content,
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
            content: data.content,
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

module.exports = { 
    createNotification,
    markNotificationAsRead,
    deleteNotification
};