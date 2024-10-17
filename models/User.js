const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    facebookId: { type: String },
    googleId: { type: String },
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
    dob: { type: String },
    chieucao: { type: Number },
    resetPasswordOtp: String,
    resetPasswordExpires: Date
}, {
    timestamps: true
});

userSchema.pre('save', async function(next) {
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
    
    // Giả định dob có định dạng "YYYY-MM-DD"
    const [day, month, year] = this.dob.split('-').map(Number);
    
    const birthDate = new Date(year, month - 1, day); // month - 1 vì tháng trong JS bắt đầu từ 0
    const today = new Date();
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDifference = today.getMonth() - birthDate.getMonth();
    
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
return age;
  };

module.exports = mongoose.model('User', userSchema);