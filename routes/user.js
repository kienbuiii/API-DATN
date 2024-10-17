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
    const { email, password, username } = req.body;

    try {
        // Kiểm tra xem email đã tồn tại chưa
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'Email đã tồn tại' });
        }

        // Tạo người dùng mới chỉ với email và mật khẩu, các trường khác dùng giá trị mặc định
        user = new User({
            email,
            password,  // Mật khẩu sẽ được mã hóa tự động nhờ pre-save middleware
            name: '',
            username,
            avatar: '',
            bio: '',
            sdt: '',
            cccd: '',
            ngaysinh: '',
            gioitinh: '',
            thanhpho: '',
            tinhtranghonnhan:'',
        });

        // Lưu người dùng mới
        await user.save();

        // Tạo JWT token
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // Trả về token và thông tin người dùng
        res.status(201).json({ token, user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi máy chủ' });
    }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for email:', email);

    if (!email || !password) {
      return res.status(400).json({ message: 'Email và mật khẩu là bắt buộc' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found for email:', email);
      return res.status(400).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    console.log('Stored hashed password:', user.password);
    console.log('Entered password:', password);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Password mismatch for user:', email);
      return res.status(400).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('Login successful for user:', email);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        sdt: user.sdt,
        xacMinhDanhTinh: user.xacMinhDanhTinh
      }
    });
  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
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
      isFollowing: isFollowing
    };

    
    res.json(userProfile);
  } catch (error) {
    console.error('Lỗi khi lấy thông tin profile:', error);
    res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
  }
});

router.post('/follow/:userId', auth, async (req, res) => {
  try {
    const userToFollow = await User.findById(req.params.userId);
    const currentUser = await User.findById(req.user.id);

    if (!userToFollow || !currentUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    if (currentUser.following.includes(userToFollow._id)) {
      return res.status(400).json({ message: 'Bạn đã theo dõi người dùng này rồi' });
    }

    currentUser.following.push(userToFollow._id);
    currentUser.followingCount += 1;

    userToFollow.followers.push(currentUser._id);
    userToFollow.followersCount += 1;

    await currentUser.save();
    await userToFollow.save();

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
module.exports = router;