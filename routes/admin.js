const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post'); // Thêm import Post model
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Middleware kiểm tra role admin
// Trong middleware checkAdminRole
const checkAdminRole = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    console.log('Received token:', token);

    if (!token) {
      return res.status(401).json({ message: 'Không có token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded);

    const user = await User.findById(decoded.id);
    console.log('Found user:', user);

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Không có quyền admin' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
};
// Thêm route mới cho dashboard stats
router.post('/dashboard/stats', checkAdminRole, async (req, res) => {
  try {
    // Lấy các thống kê từ database
    const totalUsers = await User.countDocuments();
    const newPosts = await Post.countDocuments({ 
      createdAt: { 
        $gte: new Date(Date.now() - 24*60*60*1000) 
      }
    });
    const newMessages = await Message.countDocuments({
      createdAt: { 
        $gte: new Date(Date.now() - 24*60*60*1000)
      }
    });
    
    // Tính toán tỷ lệ tăng trưởng (có thể tùy chỉnh logic)
    const userGrowth = 15; // Ví dụ: tăng 15%
    const postGrowth = 25;
    const messageGrowth = 10;
    const visitGrowth = 30;

    res.json({
      totalUsers,
      newPosts,
      newMessages,
      totalVisits: 15000, // Ví dụ, có thể lấy từ analytics
      userGrowth,
      postGrowth,
      messageGrowth,
      visitGrowth
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});


router.post('/users', checkAdminRole, async (req, res) => {
  try {
    // Thêm Cache-Control cho route này
    res.setHeader('Cache-Control', 'no-store'); // Hoặc 'public, max-age=3600'
    
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: users,
      message: users.length ? 'Lấy danh sách thành công' : 'Không có người dùng'
    });
  } catch (error) {
    console.error('Lỗi:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
});

// API đăng nhập cho admin
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Vui lòng nhập đầy đủ thông tin' 
      });
    }

    // Find admin user
    const admin = await User.findOne({ email, role: 'admin' });
    console.log('Found admin:', admin ? 'Yes' : 'No'); // Debug log

    if (!admin) {
      return res.status(401).json({ 
        message: 'Email hoặc mật khẩu không đúng' 
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, admin.password);
    console.log('Password valid:', isValidPassword); // Debug log

    if (!isValidPassword) {
      return res.status(401).json({ 
        message: 'Email hoặc mật khẩu không đúng' 
      });
    }

    // Generate token
    const token = jwt.sign(
      { 
        id: admin._id, 
        email: admin.email, 
        role: admin.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Send response
    res.status(200).json({
      message: 'Đăng nhập thành công',
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Lỗi server',
      error: error.message 
    });
  }
});

// Thêm route để xem chi tiết user
router.post('/users/:userId', checkAdminRole, async (req, res) => {
  try {
    const { userId } = req.params;

    // Tìm user và populate các trường liên quan
    const user = await User.findById(userId)
      .select('-password') // Loại bỏ password
      .populate({
        path: 'Post',
        select: 'content images createdAt likes comments', // Chọn các trường cần thiết của Post
        options: { sort: { createdAt: -1 } } // Sắp xếp theo thời gian tạo mới nhất
      })
      .populate('followers', 'username avatar') // Populate followers
      .populate('following', 'username avatar') // Populate following
      .populate('friends', 'username avatar'); // Populate friends

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    // Tính toán thêm một số thống kê
    const userStats = {
      totalPosts: user.Post.length,
      totalFollowers: user.followers.length,
      totalFollowing: user.following.length,
      totalFriends: user.friends.length,
      accountAge: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)) // Số ngày từ khi tạo tài khoản
    };

    res.status(200).json({
      success: true,
      data: {
        ...user.toObject(),
        stats: userStats
      },
      message: 'Lấy thông tin người dùng thành công'
    });

  } catch (error) {
    console.error('Chi tiết user error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message
    });
  }
});

router.post('/users/:userId/posts', checkAdminRole, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.body;

    // Kiểm tra user có tồn tại không
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    // Lấy posts của user với error handling
    const posts = await Post.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'username avatar')
      .lean() // Chuyển sang plain object để tối ưu performance
      .catch(err => {
        console.error('Error fetching posts:', err);
        return [];
      });

    // Đếm tổng số posts
    const total = await Post.countDocuments({ user: userId })
      .catch(err => {
        console.error('Error counting posts:', err);
        return 0;
      });

    // Trả về response với đầy đủ thông tin
    res.status(200).json({
      success: true,
      data: {
        posts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalPosts: total,
          limit: parseInt(limit)
        },
        user: {
          _id: user._id,
          username: user.username,
          avatar: user.avatar
        }
      },
      message: posts.length ? 'Lấy danh sách bài viết thành công' : 'Người dùng chưa có bài viết'
    });

  } catch (error) {
    console.error('User posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy bài viết',
      error: error.message
    });
  }
});

// API cập nhật trạng thái người dùng
router.patch('/users/:userId/status', checkAdminRole, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { status },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    res.json({ message: 'Cập nhật trạng thái thành công', user });
  } catch (error) {
    console.error('Lỗi cập nhật trạng thái:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// API xóa người dùng
router.delete('/users/:userId', checkAdminRole, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    res.json({ message: 'Xóa người dùng thành công' });
  } catch (error) {
    console.error('Lỗi xóa người dùng:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});
// routes/admin.js

// API thống kê chi tiết
router.post('/stats/detailed', checkAdminRole, async (req, res) => {
  try {
    const timeRange = req.query.range || '7d'; // 7d, 30d, 90d
    
    const stats = await generateDetailedStats(timeRange);
    res.json(stats);
    
  } catch (error) {
    console.error('Detailed stats error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// API quản lý báo cáo
router.post('/reports', checkAdminRole, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('reporter', 'username email')
      .populate('reportedUser', 'username email')
      .sort({ createdAt: -1 });
      
    res.json(reports);
  } catch (error) {
    console.error('Reports error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});
module.exports = router;