const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const Post = require('../models/Post');
const { cloudinary, upload } = require('../config/cloudinaryConfig');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const Notification = require('../models/Notification');
const { createNotification } = require('../config/notificationHelper');
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng với email này' });
    }

    // Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    user.resetPasswordOtp = otp;
    user.resetPasswordExpires = Date.now() + 3600000; // OTP expires after 1 hour
    await user.save();

    // Send email with OTP
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    let mailOptions = {
      from: process.env.EMAIL_USERNAME,
      to: user.email,
      subject: 'Đặt lại mật khẩu',
      text: `Mã OTP của bạn là: ${otp}. Mã này sẽ hết hạn sau 1 giờ.`
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: 'OTP đã được gửi đến email của bạn' });
  } catch (error) {
    console.error('Lỗi khi gửi OTP:', error);
    res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
  }
});

// New route to reset password with OTP
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin: email, OTP và mật khẩu mới' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng với email này' });
    }

    if (!user.verifyResetPasswordOtp(otp)) {
      return res.status(400).json({ message: 'OTP không hợp lệ hoặc đã hết hạn' });
    }

    user.password = newPassword;
    user.clearResetPasswordFields();
    await user.save();

    res.json({ message: 'Mật khẩu đã được đặt lại thành công' });
  } catch (error) {
    console.error('Lỗi khi đặt lại mật khẩu:', error);
    res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
  }
});
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Kiểm tra email đã tồn tại
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email đã được sử dụng' });
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // Tạo user mới với role mặc định là 'user'
    const user = new User({
      username,
      email,
      password: hashedPassword,
      role: 'user', // mặc định là user
      avatar: 'https://res.cloudinary.com/dqwxfqpxl/image/upload/v1700143744/default-avatar_xqg1rp.jpg',
      followersCount: 0,
      followingCount: 0,
      xacMinhDanhTinh: false
    });

    await user.save();

    // Tạo token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Đăng ký thành công',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        xacMinhDanhTinh: user.xacMinhDanhTinh
      }
    });
  } catch (error) {
    console.error('Lỗi khi đăng ký:', error);
    res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        xacMinhDanhTinh: user.xacMinhDanhTinh
      }
    });
  } catch (error) {
    console.error('Lỗi khi đăng nhập:', error);
    res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
  }
});
router.get('/thong-tin-ca-nhan', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }

        const thongTinNguoiDung = {
            id: user._id,
            ten: user.name,
            username: user.username,
            bio: user.bio,
            anh_dai_dien: user.avatar,
            email: user.email,
            sdt: user.sdt,
            diachi: user.diachi,
            tinhtranghonnhan:user.tinhtranghonnhan,
            sex: user.sex,
            thong_ke: {
                nguoi_theo_doi: user.followersCount,
                dang_theo_doi: user.followingCount,
                bai_viet: user.postsCount
            },
            xac_minh_danh_tinh: user.xacMinhDanhTinh
        };

        res.json(thongTinNguoiDung);
    } catch (error) {
        console.error('Lỗi server:', error);
        res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
    }
});

// Route cập nhật avatar
router.post('/update-avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ message: 'No file uploaded' });
    }

    // Cloudinary đã tự động upload file, chúng ta chỉ cần lấy URL
    const avatarUrl = req.file.path;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: avatarUrl },
      { new: true }
    );

    if (!user) {
      return res.status(404).send({ message: 'User not found' });
    }

    res.send({ avatar: user.avatar });
  } catch (error) {
    console.error('Error updating avatar:', error);
    res.status(500).send({ message: 'Server error' });
  }
});

router.put('/update-profile', auth, async (req, res) => {
    try {
        const { username, bio, sdt, diachi, sex,tinhtranghonnhan } = req.body;

        // Tìm user theo ID (được cung cấp bởi middleware auth)
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }

        // Cập nhật thông tin
        if (username) user.username = username;
        if (bio) user.bio = bio;
        if (sdt) user.sdt = sdt;
        if (diachi) user.diachi = diachi;
        if (sex) user.sex = sex;
        if (tinhtranghonnhan) user.tinhtranghonnhan = tinhtranghonnhan;

        // Lưu các thay đổi
        await user.save();

        // Trả về thông tin đã cập nhật
        res.json({
            message: 'Cập nhật thông tin thành công',
            user: {
                id: user._id,
                username: user.username,
               
                bio: user.bio,
                sdt: user.sdt,
                diachi: user.diachi,
                sex: user.sex,
                email: user.email,
                avatar: user.avatar,
                tinhtranghonnhan:user.tinhtranghonnhan
            }
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật thông tin:', error);
        res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
    }
});
router.get('/users', auth, async (req, res) => {
    try {
        // Lấy tất cả người dùng trừ bản thân và chỉ lấy các trường _id, anhdaidien, trangthai
        const users = await User.find({ _id: { $ne: req.user.id } })
            .select('_id anhdaidien trangthai username');

        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi máy chủ' });
    }
});
router.get('/profile/:userId', auth, async (req, res) => {
  try {
    console.log('Accessing profile route');
    const userId = req.params.userId;
    const currentUserId = req.user.id;
    

    const user = await User.findById(userId);
    if (!user) {
      console.log('User not found');
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    console.log('User found:', user);

    // Kiểm tra xem người dùng hiện tại có đang theo dõi người dùng này không
    const isFollowing = user.followers.includes(currentUserId);

    const userProfile = {
      id: user._id,
      username: user.username,
      name: user.name,
      bio: user.bio,
      anh_dai_dien: user.avatar,
      thong_ke: {
        nguoi_theo_doi: user.followers.length,
        dang_theo_doi: user.following.length,
        bai_viet: user.posts ? user.posts.length : 0 // Giả sử có trường posts
      },
      email: user.email,
      sdt: user.sdt,
      diachi: user.diachi,
      tinhtranghonnhan:user.tinhtranghonnhan,
      sex: user.sex,
      isFollowing: isFollowing,
      xac_minh_danh_tinh: user.xacMinhDanhTinh
    };

    
    res.json(userProfile);
  } catch (error) {
    console.error('Lỗi khi lấy thông tin profile:', error);
    res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
  }
});

router.post('/follow/:userId', auth, async (req, res) => {
  try {
    const userToFollow = await User.findById(req.params.userId)
      .select('username avatar followers followersCount');
    const currentUser = await User.findById(req.user.id)
      .select('username avatar following followingCount');

    if (!userToFollow || !currentUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    if (currentUser.following.includes(userToFollow._id)) {
      return res.status(400).json({ message: 'Bạn đã theo dõi người dùng này rồi' });
    }

    // Thêm vào danh sách following/followers
    currentUser.following.push(userToFollow._id);
    currentUser.followingCount += 1;

    userToFollow.followers.push(currentUser._id);
    userToFollow.followersCount += 1;

    // Tạo thông báo cho người được follow
    try {
      await createNotification({
        recipientId: userToFollow._id.toString(),
        senderId: currentUser._id.toString(),
        type: 'follow',
        content: `${currentUser.username} đã bắt đầu theo dõi bạn`,
        senderName: currentUser.username,
        senderAvatar: currentUser.avatar
      });
    } catch (notifError) {
      console.error('Error creating follow notification:', notifError);
      // Không throw error ở đây để vẫn tiếp tục xử lý follow
    }

    await Promise.all([
      currentUser.save(),
      userToFollow.save()
    ]);

    res.json({ 
      message: 'Đã theo dõi thành công',
      followersCount: userToFollow.followersCount,
      followingCount: currentUser.followingCount
    });
  } catch (error) {
    console.error('Lỗi khi theo dõi người dùng:', error);
    res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
  }
});

router.post('/unfollow/:userId', auth, async (req, res) => {
  try {
    const userToUnfollow = await User.findById(req.params.userId);
    const currentUser = await User.findById(req.user.id);

    if (!userToUnfollow || !currentUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    if (!currentUser.following.includes(userToUnfollow._id)) {
      return res.status(400).json({ message: 'Bạn chưa theo dõi người dùng này' });
    }

    currentUser.following = currentUser.following.filter(id => !id.equals(userToUnfollow._id));
    currentUser.followingCount = Math.max(0, currentUser.followingCount - 1);

    userToUnfollow.followers = userToUnfollow.followers.filter(id => !id.equals(currentUser._id));
    userToUnfollow.followersCount = Math.max(0, userToUnfollow.followersCount - 1);

    await currentUser.save();
    await userToUnfollow.save();

    res.json({ 
      message: 'Đã hủy theo dõi thành công',
      followersCount: userToUnfollow.followersCount,
      followingCount: currentUser.followingCount
    });
  } catch (error) {
    console.error('Lỗi khi hủy theo dõi người dùng:', error);
    res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
  }
});
router.get('/followers', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('followers', 'username avatar');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const followers = user.followers.map(follower => ({
      id: follower._id,
      username: follower.username,
      avatar: follower.avatar
    }));

    res.json(followers);
  } catch (error) {
    console.error('Error fetching followers:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/following', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('following', 'username avatar');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const following = user.following.map(followedUser => ({
      id: followedUser._id,
      username: followedUser.username,
      avatar: followedUser.avatar
    }));

    res.json(following);
  } catch (error) {
    console.error('Error fetching following users:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    console.log('Change password request for user:', req.user.id);

    const user = await User.findById(req.user.id);
    if (!user) {
      console.log('User not found:', req.user.id);
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      console.log('Current password mismatch for user:', user.email);
      return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    console.log('Password changed successfully for user:', user.email);
    console.log('New hashed password:', hashedPassword);

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    console.error('Lỗi khi đổi mật khẩu:', error);
    res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
  }
});
router.post('/block/:userId', auth, async (req, res) => {
  try {
    const userToBlock = await User.findById(req.params.userId);
    const currentUser = await User.findById(req.user.id);

    if (!userToBlock) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Kiểm tra xem đã block chưa
    const alreadyBlocked = currentUser.blocked.some(
      block => block.user.toString() === req.params.userId
    );

    if (alreadyBlocked) {
      return res.status(400).json({ message: 'Người dùng này đã bị chặn' });
    }

    // Thêm vào danh sách blocked
    currentUser.blocked.push({ user: req.params.userId });
    userToBlock.blockedBy.push({ user: req.user.id });

    // Xóa follow nếu đang follow
    if (currentUser.following.includes(userToBlock._id)) {
      currentUser.following = currentUser.following.filter(
        id => id.toString() !== req.params.userId
      );
      currentUser.followingCount = Math.max(0, currentUser.followingCount - 1);

      userToBlock.followers = userToBlock.followers.filter(
        id => id.toString() !== req.user.id
      );
      userToBlock.followersCount = Math.max(0, userToBlock.followersCount - 1);
    }

    // Xóa follow ngược lại nếu người bị block đang follow mình
    if (userToBlock.following.includes(currentUser._id)) {
      userToBlock.following = userToBlock.following.filter(
        id => id.toString() !== req.user.id
      );
      userToBlock.followingCount = Math.max(0, userToBlock.followingCount - 1);

      currentUser.followers = currentUser.followers.filter(
        id => id.toString() !== req.params.userId
      );
      currentUser.followersCount = Math.max(0, currentUser.followersCount - 1);
    }

    await Promise.all([
      currentUser.save(),
      userToBlock.save()
    ]);

    res.json({ 
      message: 'Đã chặn người dùng thành công',
      currentUserStats: {
        followingCount: currentUser.followingCount,
        followersCount: currentUser.followersCount
      },
      blockedUserStats: {
        followingCount: userToBlock.followingCount,
        followersCount: userToBlock.followersCount
      }
    });

  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ 
      message: 'Lỗi server',
      error: error.message 
    });
  }
});

// Cập nhật middleware kiểm tra block status
const checkBlockStatus = async (req, res, next) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const targetUser = await User.findById(req.params.userId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    const isBlocked = currentUser.blocked.some(
      block => block.user.toString() === req.params.userId
    );
    const isBlockedBy = targetUser.blocked.some(
      block => block.user.toString() === req.user.id
    );

    if (isBlocked || isBlockedBy) {
      return res.status(403).json({
        message: 'Không thể thực hiện hành động này do đã chặn hoặc bị chặn',
        isBlocked,
        isBlockedBy
      });
    }

    req.currentUser = currentUser;
    req.targetUser = targetUser;
    next();
  } catch (error) {
    console.error('Error checking block status:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};
// Tương tự cho route unblock
router.post('/unblock/:userId', auth, async (req, res) => {
  try {
    const userToUnblock = await User.findById(req.params.userId);
    const currentUser = await User.findById(req.user.id);  // Thay đổi _id thành id

    if (!userToUnblock) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Remove from blocked list
    currentUser.blocked = currentUser.blocked.filter(
      block => block.user.toString() !== req.params.userId
    );
    
    // Remove from blockedBy list
    userToUnblock.blockedBy = userToUnblock.blockedBy.filter(
      block => block.user.toString() !== req.user.id.toString()  // Thay đổi _id thành id
    );

    await Promise.all([currentUser.save(), userToUnblock.save()]);

    res.json({ message: 'Đã bỏ chặn người dùng thành công' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});
router.get('/blocked-users', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id)
      .populate({
        path: 'blocked.user',
        select: 'username avatar email'  // Chọn các trường muốn lấy
      });

    if (!currentUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Format lại dữ liệu trước khi gửi về client
    const blockedUsers = currentUser.blocked.map(block => ({
      id: block.user._id,
      username: block.user.username,
      avatar: block.user.avatar,
      email: block.user.email,
      blockedAt: block.timestamp
    }));

    res.json(blockedUsers);
  } catch (error) {
    console.error('Error getting blocked users:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});
router.get('/check-block-status/:userId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const targetUser = await User.findById(req.params.userId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Kiểm tra block status
    const isBlocked = currentUser.blocked.some(
      block => block.user.toString() === req.params.userId
    );
    const isBlockedBy = targetUser.blocked.some(
      block => block.user.toString() === req.user.id
    );

    // Kiểm tra thời gian block nếu có
    let blockInfo = null;
    if (isBlocked) {
      const blockRecord = currentUser.blocked.find(
        block => block.user.toString() === req.params.userId
      );
      blockInfo = {
        timestamp: blockRecord.timestamp,
        duration: Date.now() - new Date(blockRecord.timestamp).getTime()
      };
    }

    res.json({
      isBlocked,
      isBlockedBy,
      blockInfo,
      canInteract: !isBlocked && !isBlockedBy
    });

  } catch (error) {
    console.error('Error checking block status:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});
router.get('/travel-posts/:userId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const targetUser = await User.findById(req.params.userId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Kiểm tra block status
    const isBlocked = currentUser.blocked.some(
      block => block.user.toString() === req.params.userId
    );
    const isBlockedBy = targetUser.blocked.some(
      block => block.user.toString() === req.user.id
    );

    if (isBlocked || isBlockedBy) {
      return res.json({
        isBlocked,
        isBlockedBy,
        restricted: true,
        message: isBlockedBy ? 
          'Bạn đã bị người dùng này chặn' : 
          'Bạn đã chặn người dùng này',
        posts: []  // Trả về mảng rỗng khi bị chặn
      });
    }

    // Nếu không bị chặn, lấy travel posts
    const travelPosts = await TravelPost.find({ user: req.params.userId })
      .populate('user', 'username avatar')
      .sort({ createdAt: -1 });

    res.json({
      isBlocked,
      isBlockedBy,
      restricted: false,
      posts: travelPosts
    });

  } catch (error) {
    console.error('Error getting travel posts:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Cập nhật FCM token
router.post('/update-fcm-token', auth, async (req, res) => {
    try {
        const { fcmToken } = req.body;
        
        if (!fcmToken) {
            return res.status(400).json({ message: 'FCM token is required' });
        }

        await User.findByIdAndUpdate(req.user.id, { fcmToken });
        
        res.json({ message: 'FCM token updated successfully' });
    } catch (error) {
        console.error('Update FCM token error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});
module.exports = router;