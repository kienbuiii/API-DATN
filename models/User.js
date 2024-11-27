const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const moment = require('moment');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '' },
  sdt: { type: String, default: '' },
  cccd: { type: String, default: '' },
  tuoi: { type: Number },
  gioitinh: { type: String, default: '' },
  thanhpho: { type: String, default: '' },
  tinhtranghonnhan: { type: String, default: '' },
  xacMinhDanhTinh: { type: Boolean, default: false },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  followersCount: { type: Number, default: 0 },
  followingCount: { type: Number, default: 0 },
  postsCount: { type: Number, default: 0 },
  Post: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  sex: { type: String, default: '' },
  nationality: { type: String, default: '' },
  home: { type: String, default: '' },
  diachi: { type: String, default: '' },
  dob: { type: Date },
  chieucao: { type: Number },
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  blocked: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  blockedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  resetPasswordOtp: String,
  resetPasswordExpires: Date,
  role: {
    type: String,
    enum: ['user', 'admin'], // các role có thể có
    default: 'user' // mặc định là user khi đăng ký
  },
  vohieuhoa: {
    type: Boolean,
    default: false
  },
  conversations: [{
    with: { 
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    unreadCount: {
      type: Number,
      default: 0
    }
  }],
  isOnline: { 
    type: Boolean, 
    default: false 
  },
  lastActive: { 
    type: Date,
    default: Date.now 
  },
  socketId: String
}, 

{
  timestamps: true
});

userSchema.pre('save', async function (next) {
  if (this.isModified('password') && !this.password.startsWith('$2a$')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  if (this.isModified('dob')) {
    this.tuoi = this.calculateAge();
  }
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// New method to verify reset password OTP
userSchema.methods.verifyResetPasswordOtp = function (otp) {
  return this.resetPasswordOtp === otp && this.resetPasswordExpires > Date.now();
};

// New method to clear reset password fields
userSchema.methods.clearResetPasswordFields = function () {
  this.resetPasswordOtp = undefined;
  this.resetPasswordExpires = undefined;
};

// Updated method to calculate age
userSchema.methods.calculateAge = function () {
  if (!this.dob) return null;

  // Sử dụng moment để tính tuổi từ Date object
  return moment().diff(moment(this.dob), 'years');
};

// Hook để xóa tất cả dữ liệu liên quan khi người dùng bị xóa
userSchema.pre('remove', async function(next) {
  await Post.deleteMany({ user: this._id });
  await TravelPost.deleteMany({ author: this._id });
  next();
});

module.exports = mongoose.model('User', userSchema);