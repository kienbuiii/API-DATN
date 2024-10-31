const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['like', 'comment', 'follow', 'mention'] // các loại thông báo
    },
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
    },
    read: {
        type: Boolean,
        default: false
    },
    content: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);