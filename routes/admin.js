const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Middleware kiểm tra role admin
const checkAdminRole = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Không có quyền truy cập' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Không có quyền admin' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
};


// Thêm route mới cho dashboard stats
router.get('/dashboard/stats', checkAdminRole, async (req, res) => {
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


router.get('/users', checkAdminRole, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    // Debug log
    console.log('Query params:', { page, limit, search });

    // Tạo query tìm kiếm
    const searchQuery = {};
    if (search) {
      searchQuery.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { sdt: { $regex: search, $options: 'i' } }
      ];
    }

    // Debug log
    console.log('Search query:', searchQuery);

    // Đếm tổng số users thỏa mãn điều kiện
    const total = await User.countDocuments(searchQuery);
    
    // Debug log
    console.log('Total users:', total);

    // Lấy danh sách users có phân trang
    const users = await User.find(searchQuery)
      .select('-password') // Loại bỏ trường password
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 }); // Sắp xếp theo thời gian tạo mới nhất

    // Debug log
    console.log('Found users:', users.length);

    // Luôn trả về một response object, ngay cả khi không có users
    res.status(200).json({
      success: true,
      message: users.length ? 'Lấy danh sách người dùng thành công' : 'Không có người dùng',
      data: {
        users: users || [],
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Lỗi lấy danh sách users:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server khi lấy danh sách người dùng',
      error: error.message 
    });
  }
});

// API đăng nhập cho admin
router.post('/login', async (req, res) => {
  try {
    console.log('Login request body:', req.body); // Debug log

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
module.exports = router;