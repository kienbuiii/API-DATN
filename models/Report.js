const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedItem: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'itemType',
    required: true
  },
  itemType: {
    type: String,
    required: true,
    enum: ['User', 'Post', 'TravelPost', 'Comment']
  },
  reason: {
    type: String,
    required: true,
    enum: [
      'spam',
      'harassment',
      'inappropriate_content',
      'violence',
      'hate_speech',
      'false_information',
      'other'
    ]
  },
  description: {
    type: String,
    required: true,
    minlength: 10,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved', 'rejected'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Thêm index để tối ưu query
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ status: 1 });

// Middleware để tự động cập nhật updatedAt
reportSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual populate để lấy thông tin chi tiết của reporter
reportSchema.virtual('reporterDetails', {
  ref: 'User',
  localField: 'reporter',
  foreignField: '_id',
  justOne: true
});

module.exports = mongoose.model('Report', reportSchema);