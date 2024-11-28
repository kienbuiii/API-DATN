const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post'); // Thêm import Post model
const TravelPost = require('../models/TravelPost'); // Thêm import TravelPost model
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Message = require('../models/Message'); // Thêm import Message model
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
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
      searchTerm = '', // Tìm kiếm theo username, email hoặc fullName
      filters = {
        status: '',    // active, inactive, banned
        role: '',      // user, admin
        vohieuhoa: '', // true, false
        verified: '',  // true, false
        gender: ''     // male, female, other
      },
      dateRange = {
        startDate: '',
        endDate: ''
      },
      sortOptions = {
        field: 'createdAt', // createdAt, username, email, lastActive
        order: 'desc'       // asc, desc
      },
      pagination = {
        page: 1,
        limit: 10
      }
    } = req.body;

    // Xây dựng query tìm kiếm
    let searchQuery = {};

    // Tìm kiếm theo nhiều trường
    if (searchTerm) {
      searchQuery.$or = [
        { username: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { fullName: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Áp dụng các bộ lọc
    Object.keys(filters).forEach(key => {
      if (filters[key] !== '') {
        if (key === 'vohieuhoa' || key === 'verified') {
          searchQuery[key] = filters[key] === 'true';
        } else {
          searchQuery[key] = filters[key];
        }
      }
    });

    // Lọc theo khoảng thời gian
    if (dateRange.startDate && dateRange.endDate) {
      searchQuery.createdAt = {
        $gte: new Date(dateRange.startDate),
        $lte: new Date(dateRange.endDate)
      };
    }

    // Tính toán phân trang
    const page = parseInt(pagination.page);
    const limit = parseInt(pagination.limit);
    const skip = (page - 1) * limit;

    // Xây dựng sort options
    const sortCriteria = {};
    sortCriteria[sortOptions.field] = sortOptions.order === 'asc' ? 1 : -1;

    // Thực hiện truy vấn với aggregate pipeline
    const aggregatePipeline = [
      { $match: searchQuery },
      {
        $lookup: {
          from: 'posts',
          localField: '_id',
          foreignField: 'user',
          as: 'posts'
        }
      },
      {
        $addFields: {
          postsCount: { $size: '$posts' },
          followersCount: { $size: { $ifNull: ['$followers', []] } },
          followingCount: { $size: { $ifNull: ['$following', []] } },
          accountAge: {
            $divide: [
              { $subtract: [new Date(), '$createdAt'] },
              1000 * 60 * 60 * 24 // Chuyển đổi thành số ngày
            ]
          }
        }
      },
      {
        $project: {
          password: 0,
          posts: 0, // Loại bỏ mảng posts sau khi đã đếm
          __v: 0
        }
      }
    ];

    // Thêm sorting và pagination vào pipeline
    aggregatePipeline.push(
      { $sort: sortCriteria },
      { $skip: skip },
      { $limit: limit }
    );

    // Thực hiện truy vấn
    const [users, totalCount] = await Promise.all([
      User.aggregate(aggregatePipeline),
      User.countDocuments(searchQuery)
    ]);

    // Thêm thông tin hoạt động gần đây
    const enhancedUsers = await Promise.all(users.map(async (user) => {
      // Lấy bài viết gần nhất
      const latestPost = await Post.findOne({ user: user._id })
        .sort({ createdAt: -1 })
        .select('createdAt');

      // Lấy comment gần nhất
      const latestComment = await Post.findOne(
        { 'comments.user': user._id },
        { 'comments.$': 1 }
      ).sort({ 'comments.createdAt': -1 });

      return {
        ...user,
        recentActivity: {
          lastPost: latestPost?.createdAt || null,
          lastComment: latestComment?.comments[0]?.createdAt || null,
          lastLogin: user.lastLogin || null
        }
      };
    }));

    // Tính toán thống kê tổng quan
    const statistics = {
      totalUsers: totalCount,
      activeUsers: await User.countDocuments({ ...searchQuery, status: 'active' }),
      verifiedUsers: await User.countDocuments({ ...searchQuery, verified: true }),
      bannedUsers: await User.countDocuments({ ...searchQuery, status: 'banned' })
    };

    res.status(200).json({
      success: true,
      data: {
        users: enhancedUsers,
        pagination: {
          total: totalCount,
          page,
          totalPages: Math.ceil(totalCount / limit),
          limit
        },
        statistics,
        filters: {
          applied: Object.entries(filters)
            .filter(([_, value]) => value !== '')
            .length,
          available: {
            status: ['active', 'inactive', 'banned'],
            role: ['user', 'admin'],
            gender: ['male', 'female', 'other']
          }
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

    // 8. Ly tất cả các bài đăng du lịch của người dùng
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
    
    // Lấy tổng số bài feed
    const totalFeeds = await Post.countDocuments();

    // Lấy tổng số bài travel post
    const totalTravelPosts = await TravelPost.countDocuments();
    
    // Lấy số người dùng mới trong 7 ngày qua
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const newUsers = await User.countDocuments({
      createdAt: { $gte: lastWeek },
      role: { $ne: 'admin' }
    });

    // Lấy số bài feed mới trong 7 ngày qua
    const newFeeds = await Post.countDocuments({
      createdAt: { $gte: lastWeek }
    });

    // Lấy số bài travel post mới trong 7 ngày qua
    const newTravelPosts = await TravelPost.countDocuments({
      createdAt: { $gte: lastWeek }
    });

    // Tính tổng số bài viết (feed + travel post)
    const totalPosts = totalFeeds + totalTravelPosts;
    const newTotalPosts = newFeeds + newTravelPosts;

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          new: newUsers
        },
        posts: {
          total: totalPosts,
          new: newTotalPosts,
          feeds: {
            total: totalFeeds,
            new: newFeeds
          },
          travelPosts: {
            total: totalTravelPosts,
            new: newTravelPosts
          }
        },
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

// API lấy lịch sử chat với một user
router.post('/chat/:userId', checkAdminRole, async (req, res) => {
    try {
        const { userId } = req.params;
        const adminId = req.user._id;

        if (!ObjectId.isValid(userId) || !ObjectId.isValid(adminId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format'
            });
        }

        const messages = await Message.find({
            $or: [
                { sender: adminId, receiver: userId },
                { sender: userId, receiver: adminId }
            ]
        })
        .sort({ createdAt: 1 })
        .populate('sender', 'username avatar')
        .populate('receiver', 'username avatar');

        res.json({
            success: true,
            data: messages
        });

    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy lịch sử chat',
            error: error.message
        });
    }
});

// API gửi tin nhắn từ admin
router.post('/chat/send/:userId', checkAdminRole, async (req, res) => {
    try {
        const { userId } = req.params;
        const { content, type = 'text' } = req.body;
        const adminId = req.user._id;

        if (!ObjectId.isValid(userId) || !ObjectId.isValid(adminId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid ID format'
            });
        }

        const newMessage = new Message({
            sender: adminId,
            receiver: userId,
            content,
            type,
            isAdminMessage: true
        });

        await newMessage.save();

        const populatedMessage = await Message.findById(newMessage._id)
            .populate('sender', 'username avatar')
            .populate('receiver', 'username avatar');

        // Emit socket event nếu có socket.io
        if (req.app.get('io')) {
            const io = req.app.get('io');
            const userSocket = await User.findById(userId).select('socketId');
            if (userSocket?.socketId) {
                io.to(userSocket.socketId).emit('newMessage', {
                    message: populatedMessage
                });
            }
        }

        res.json({
            success: true,
            data: populatedMessage,
            message: 'Gửi tin nhắn thành công'
        });

    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi gửi tin nhắn',
            error: error.message
        });
    }
});

// Thay đổi từ router.patch sang router.post
router.post('/chat/mark-read/:userId', checkAdminRole, async (req, res) => {
  try {
      const { userId } = req.params;
      const adminId = req.user._id;

      if (!ObjectId.isValid(userId) || !ObjectId.isValid(adminId)) {
          return res.status(400).json({
              success: false,
              message: 'Invalid ID format'
          });
      }

      await Message.updateMany(
          {
              sender: userId,
              receiver: adminId,
              read: false
          },
          { read: true }
      );

      res.json({
          success: true,
          message: 'Đánh dấu tin nhắn đã đọc thành công'
      });

  } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(500).json({
          success: false,
          message: 'Lỗi server khi đánh dấu tin nhắn đã đọc',
          error: error.message
      });
  }
});
// API lấy danh sách cuộc trò chuyện của admin
router.post('/conversations', checkAdminRole, async (req, res) => {
    try {
        const adminId = req.user._id;

        if (!ObjectId.isValid(adminId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid admin ID format'
            });
        }

        const conversations = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { sender: new ObjectId(adminId) },
                        { receiver: new ObjectId(adminId) }
                    ]
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: {
                            if: { $eq: ['$sender', new ObjectId(adminId)] },
                            then: '$receiver',
                            else: '$sender'
                        }
                    },
                    lastMessage: { $first: '$$ROOT' },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                { 
                                    $and: [
                                        { $eq: ['$receiver', new ObjectId(adminId)] },
                                        { $eq: ['$read', false] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            {
                $unwind: '$userInfo'
            },
            {
                $project: {
                    _id: 1,
                    lastMessage: 1,
                    unreadCount: 1,
                    user: {
                        _id: '$userInfo._id',
                        username: '$userInfo.username',
                        avatar: '$userInfo.avatar',
                        isOnline: '$userInfo.isOnline',
                        lastActive: '$userInfo.lastActive'
                    }
                }
            },
            {
                $sort: { 'lastMessage.createdAt': -1 }
            }
        ]);

        res.json({
            success: true,
            data: conversations
        });

    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy danh sách cuộc trò chuyện',
            error: error.message
        });
    }
});

// API lấy số tin nhắn chưa đọc cho admin
router.post('/unread-count', checkAdminRole, async (req, res) => {
    try {
        const adminId = req.user._id;

        if (!ObjectId.isValid(adminId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid admin ID format'
            });
        }

        const unreadCount = await Message.countDocuments({
            receiver: adminId,
            read: false
        });

        res.json({
            success: true,
            data: { unreadCount }
        });

    } catch (error) {
        console.error('Error getting unread count:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy số tin nhắn chưa đọc',
            error: error.message
        });
    }
});
router.post('/users/all', checkAdminRole, async (req, res) => {
  try {
      const {
          page = 1,
          limit = 10,
          search = '',
          sortBy = 'createdAt',
          sortOrder = -1,
          filters = {}
      } = req.body;

      // Xây dựng query filters
      const query = {};
      
      // Tìm kiếm theo username hoặc email
      if (search) {
          query.$or = [
              { username: { $regex: search, $options: 'i' } },
              { email: { $regex: search, $options: 'i' } }
          ];
      }

      // Thêm các điều kiện lọc
      if (filters.role) {
          query.role = filters.role;
      }
      if (filters.vohieuhoa !== undefined) {
          query.vohieuhoa = filters.vohieuhoa;
      }
      if (filters.verified !== undefined) {
          query.verified = filters.verified;
      }
      if (filters.gender) {
          query.gender = filters.gender;
      }
      if (filters.isOnline !== undefined) {
          query.isOnline = filters.isOnline;
      }

      // Tính toán skip cho pagination
      const skip = (page - 1) * limit;

      // Thực hiện query với mongoose
      const [users, total] = await Promise.all([
          User.find(query)
              .select('username email avatar isOnline lastActive createdAt vohieuhoa role') // Chỉ lấy các trường cần thiết
              .sort({ [sortBy]: sortOrder })
              .skip(skip)
              .limit(limit)
              .lean(), // Chuyển sang plain object để tăng performance
          User.countDocuments(query)
      ]);

      // Thêm thông tin trạng thái cho mỗi user
      const enhancedUsers = users.map(user => ({
          ...user,
          status: user.isOnline ? 'online' : 'offline',
          lastActive: user.lastActive || user.updatedAt
      }));

      // Tính toán thông tin pagination
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      res.json({
          success: true,
          data: {
              users: enhancedUsers,
              pagination: {
                  total,
                  totalPages,
                  currentPage: page,
                  limit,
                  hasNextPage,
                  hasPrevPage
              }
          },
          message: 'Lấy danh sách người dùng thành công'
      });

  } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({
          success: false,
          message: 'Lỗi server khi lấy danh sách người dùng',
          error: error.message
      });
  }
});
module.exports = router;