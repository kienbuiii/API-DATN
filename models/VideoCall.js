const mongoose = require('mongoose');

const videoCallSchema = new mongoose.Schema({
    channelName: {
        type: String,
        required: true,
        unique: true
    },
    caller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'ended', 'missed', 'rejected'],
        default: 'pending'
    },
    startTime: {
        type: Date,
        required: true,
        default: Date.now
    },
    acceptTime: {
        type: Date
    },
    endTime: {
        type: Date
    },
    duration: {
        type: Number, // Duration in seconds
        default: 0
    },
    callType: {
        type: String,
        enum: ['video', 'audio'],
        default: 'video'
    },
    quality: {
        type: String,
        enum: ['HD', 'SD', 'LOW'],
        default: 'HD'
    },
    endedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reason: {
        type: String,
        enum: ['completed', 'canceled', 'timeout', 'error', 'rejected'],
    },
    metadata: {
        deviceInfo: {
            type: String
        },
        networkType: {
            type: String
        },
        browserInfo: {
            type: String
        }
    }
}, {
    timestamps: true
});

// Tính toán thời lượng cuộc gọi trước khi lưu
videoCallSchema.pre('save', function(next) {
    if (this.endTime && this.acceptTime) {
        this.duration = Math.floor((this.endTime - this.acceptTime) / 1000); // Convert to seconds
    }
    next();
});

// Phương thức instance để kết thúc cuộc gọi
videoCallSchema.methods.endCall = async function(userId, reason = 'completed') {
    this.status = 'ended';
    this.endTime = new Date();
    this.endedBy = userId;
    this.reason = reason;
    
    if (this.acceptTime) {
        this.duration = Math.floor((this.endTime - this.acceptTime) / 1000);
    }
    
    return this.save();
};

// Phương thức instance để chấp nhận cuộc gọi
videoCallSchema.methods.acceptCall = async function() {
    this.status = 'active';
    this.acceptTime = new Date();
    return this.save();
};

// Phương thức instance để từ chối cuộc gọi
videoCallSchema.methods.rejectCall = async function(userId) {
    this.status = 'rejected';
    this.endTime = new Date();
    this.endedBy = userId;
    this.reason = 'rejected';
    return this.save();
};

// Phương thức static để tìm cuộc gọi đang hoạt động của người dùng
videoCallSchema.statics.findActiveCall = async function(userId) {
    return this.findOne({
        $or: [
            { caller: userId },
            { receiver: userId }
        ],
        status: 'active'
    }).populate('caller receiver', 'username avatar');
};

// Phương thức static để kiểm tra xem người dùng có đang trong cuộc gọi không
videoCallSchema.statics.isUserInCall = async function(userId) {
    const activeCall = await this.findOne({
        $or: [
            { caller: userId, status: { $in: ['pending', 'active'] } },
            { receiver: userId, status: { $in: ['pending', 'active'] } }
        ]
    });
    return !!activeCall;
};

// Index để tối ưu hiệu suất truy vấn
videoCallSchema.index({ caller: 1, status: 1 });
videoCallSchema.index({ receiver: 1, status: 1 });
videoCallSchema.index({ channelName: 1 });
videoCallSchema.index({ startTime: -1 });

const VideoCall = mongoose.model('VideoCall', videoCallSchema);

module.exports = VideoCall; 