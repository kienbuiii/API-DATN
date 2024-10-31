const mongoose = require('mongoose');

const TravelPostSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  images: [{
    type: String
  }],
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  destination: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  interests: [{
    type: String
  }],
  // Thêm trường likes
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Thêm virtual field để đếm số lượng likes
  likeCount: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true }, // Để có thể sử dụng virtual fields
  toObject: { virtuals: true }
});

// Thêm virtual field để tính số lượng likes
TravelPostSchema.virtual('likesCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Thêm index cho likes để tối ưu performance
TravelPostSchema.index({ likes: 1 });

module.exports = mongoose.model('TravelPost', TravelPostSchema);