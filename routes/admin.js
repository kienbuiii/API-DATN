const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post'); // Thêm import Post model
const TravelPost = require('../models/TravelPost'); // Thêm import TravelPost model
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Message = require('../models/Message'); // Thêm import Message model
const mongoose = require('mongoose');
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


router.post('/users/search', checkAdminRole, async (req, res) => {
  try {
    const {
      keyword = '',
      status,
      role,
      dateRange,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.body;

    // Xây dựng query tìm kiếm
    const searchQuery = {};
    
    // Thêm điều kiện tìm kiếm theo keyword
    if (keyword) {
      searchQuery.$or = [
        { username: { $regex: keyword, $options: 'i' } },
        { email: { $regex: keyword, $options: 'i' } }
      ];
    }

    // Thêm điều kiện tìm kiếm theo status nếu có
    if (status) {
      searchQuery.status = status;
    }

    // Thêm điều kiện tìm kiếm theo role nếu có
    if (role) {
      searchQuery.role = role;
    }

    // Thêm điều kiện tìm kiếm theo khoảng thời gian nếu có
    if (dateRange) {
      const { startDate, endDate } = dateRange;
      if (startDate && endDate) {
        searchQuery.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }
    }

    // Tính toán skip cho phân trang
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Xây dựng sort options
    const sortOptions = {};
    sortOptions[sortBy] = order === 'asc' ? 1 : -1;

    // Thực hiện tìm kiếm với phân trang
    const users = await User.find(searchQuery)
      .select('-password')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Đếm tổng số kết quả
    const total = await User.countDocuments(searchQuery);

    // Thêm thông tin thống kê cho mỗi user
    const enhancedUsers = await Promise.all(users.map(async (user) => {
      const postsCount = await Post.countDocuments({ user: user._id });
      const followersCount = user.followers ? user.followers.length : 0;
      const followingCount = user.following ? user.following.length : 0;
      const accountAge = Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24));

      return {
        ...user,
        stats: {
          postsCount,
          followersCount,
          followingCount,
          accountAge // số ngày từ khi tạo tài khoản
        }
      };
    }));

    res.status(200).json({
      success: true,
      data: {
        users: enhancedUsers,
        pagination: {
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      },
      message: enhancedUsers.length ? 'Tìm kiếm thành công' : 'Không tìm thấy kết quả'
    });

  } catch (error) {
    console.error('Lỗi tìm kiếm người dùng:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi tìm kiếm người dùng',
      error: error.message
    });
  }
});

// Route chi tiết user (đặt SAU route search)
router.post('/users/detail/:userId', checkAdminRole, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password')
      .populate({
        path: 'Post',
        select: 'content images createdAt likes comments',
        options: { sort: { createdAt: -1 } }
      })
      .populate('followers', 'username avatar')
      .populate('following', 'username avatar')
      .populate('friends', 'username avatar');

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

// API xóa người dùng và tất cả dữ liệu liên quan
router.delete('/users/:userId', checkAdminRole, async (req, res) => {
  try {
    const { userId } = req.params;

    // Tìm người dùng cần xóa
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // 1. Cập nhật followersCount và followingCount cho người theo dõi và người được theo dõi
    await User.updateMany(
      { _id: { $in: user.followers } },
      { $pull: { following: userId }, $inc: { followingCount: -1 } }
    );

    await User.updateMany(
      { _id: { $in: user.following } },
      { $pull: { followers: userId }, $inc: { followersCount: -1 } }
    );

    // 2. Lấy tất cả các bài viết mà người dùng đã like
    const userPosts = await Post.find({});

    // 3. Xóa tất cả các bình luận của người dùng trên các bài viết
    await Post.updateMany(
      {},
      { $pull: { comments: { user: userId } } } // Xóa tất cả bình luận của người dùng
    );

    // 4. Cập nhật commentsCount cho các bài viết
    await Post.updateMany(
      {},
      { $inc: { commentsCount: -1 } } // Giảm commentsCount cho mỗi bài viết
    );

    // 5. Xóa tất cả các like của người dùng trên các bài viết
    await Post.updateMany(
      {},
      { $pull: { likes: userId } } // Xóa tất cả like của người dùng
    );

    // 6. Cập nhật likesCount cho các bài viết
    await Post.updateMany(
      {},
      { $inc: { likesCount: -1 } } // Giảm likesCount cho mỗi bài viết
    );

    // 7. Xóa tất cả các bài viết của người dùng
    await Post.deleteMany({ user: userId });

    // 8. Lấy tất cả các bài đăng du lịch của người dùng
    const userTravelPosts = await TravelPost.find({ author: userId });

    // 9. Xóa tất cả các like từ các bài đăng du lịch của người dùng
    await TravelPost.updateMany(
      {},
      { $pull: { likes: userId } } // Xóa tất cả like của người dùng
    );

    // 10. Xóa tất cả các bài đăng du lịch của người dùng
    await TravelPost.deleteMany({ author: userId });

    // 11. Xóa người dùng
    await User.findByIdAndDelete(userId);

    res.json({ message: 'Xóa người dùng và các dữ liệu liên quan thành công' });
  } catch (error) {
    console.error('Lỗi khi xóa người dùng:', error);
    res.status(500).json({ message: 'Lỗi khi xóa người dùng và dữ liệu liên quan' });
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

// API thống kê tổng quan
router.post('/dashboard-stats', checkAdminRole, async (req, res) => {
  try {
    // Lấy tổng số người dùng (không tính admin)
    const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });
    
    // Lấy tổng số bài viết
    const totalPosts = await Post.countDocuments();
    
    // Lấy số người dùng mới trong 7 ngày qua
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const newUsers = await User.countDocuments({
      createdAt: { $gte: lastWeek },
      role: { $ne: 'admin' }
    });

    // Lấy số bài viết mới trong 7 ngày qua
    const newPosts = await Post.countDocuments({
      createdAt: { $gte: lastWeek }
    });

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalPosts,
        newUsers,
        newPosts,
        lastUpdated: new Date()
      },
      message: 'Lấy thống kê thành công'
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thống kê',
      error: error.message
    });
  }
});
// vô hiệu hóa tài khoản
router.post('/users/:userId/disable', checkAdminRole, async (req, res) => {
  try {
    const { userId } = req.params;
    const { vohieuhoa } = req.body; // Truyền giá trị từ body nếu có, nếu không, mặc định là true

    // Nếu không có giá trị vohieuhoa trong body, set nó mặc định là true
    const disableStatus = vohieuhoa !== undefined ? vohieuhoa : true;

    // Cập nhật trạng thái vô hiệu hóa
    const user = await User.findByIdAndUpdate(
      userId,
      { vohieuhoa: disableStatus },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy người dùng' 
      });
    }

    const message = disableStatus 
      ? 'Tài khoản đã bị vô hiệu hóa' 
      : 'Tài khoản đã được kích hoạt';

    res.status(200).json({
      success: true,
      data: user,
      message
    });
  } catch (error) {
    console.error('Error disabling account:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi vô hiệu hóa tài khoản',
      error: error.message
    });
  }
});


router.post('/users/:userId/enable', checkAdminRole, async (req, res) => {
  try {
    const { userId } = req.params;

    // Tìm người dùng theo userId
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Kiểm tra nếu tài khoản đã bị vô hiệu hóa
    if (!user.vohieuhoa) {
      return res.status(400).json({ message: 'Tài khoản này không bị vô hiệu hóa' });
    }

    // Cập nhật trạng thái tài khoản thành 'active' (kích hoạt lại)
    user.vohieuhoa = false;
    await user.save();

    res.status(200).json({
      message: 'Tài khoản đã được kích hoạt lại thành công',
      user
    });
  } catch (error) {
    console.error('Lỗi kích hoạt lại tài khoản:', error);
    res.status(500).json({ message: 'Lỗi server khi kích hoạt lại tài khoản' });
  }
});

// Route gửi tin nhắn
router.post('/messages', checkAdminRole, async (req, res) => {
  try {
    const { receiverId, text, type } = req.body;

    // Kiểm tra thông tin đầu vào
    if (!receiverId || !text) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin' });
    }

    // Tạo tin nhắn mới
    const message = new Message({
      senderId: req.user.id, // ID của admin
      receiverId,
      text,
      type: type || 'text' // Nếu không có type, mặc định là 'text'
    });

    await message.save();

    // Emit sự kiện cho người nhận
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${receiverId}`).emit('newMessage', message);
    }

    res.status(201).json({ message: 'Tin nhắn đã được gửi thành công', data: message });
  } catch (error) {
    console.error('Lỗi gửi tin nhắn:', error);
    res.status(500).json({ message: 'Lỗi server khi gửi tin nhắn', error: error.message });
  }
});

// Route lấy tất cả người dùng
router.post('/users/all', checkAdminRole, async (req, res) => {
  try {
      const users = await User.find().select('-password').sort({ createdAt: -1 });
      res.status(200).json({
          success: true,
          data: users,
          message: users.length ? 'Lấy danh sách người dùng thành công' : 'Không có người dùng'
      });
  } catch (error) {
      console.error('Lỗi lấy người dùng:', error);
      res.status(500).json({
          success: false,
          message: 'Lỗi server khi lấy người dùng',
          error: error.message
      });
  }
});

// Route lấy lịch sử trò chuyện với người dùng
router.post('/chat-history/:userId', checkAdminRole, async (req, res) => {
  try {
    const { userId } = req.params;

    // Kiểm tra xem userId có phải là ObjectId hợp lệ không
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
    }

    // Lấy tất cả tin nhắn giữa admin và người dùng
    const chatHistory = await Message.find({
      $or: [
        { senderId: req.user.id, receiverId: userId },
        { senderId: userId, receiverId: req.user.id }
      ]
    })
    .populate('senderId', 'username avatar')
    .populate('receiverId', 'username avatar')
    .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: chatHistory });
  } catch (error) {
    console.error('Lỗi lấy lịch sử trò chuyện:', error);
    res.status(500).json({ message: 'Lỗi server khi lấy lịch sử trò chuyện', error: error.message });
  }
});

module.exports = router;