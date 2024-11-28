const express = require('express');
const router = express.Router();
const TravelPost = require('../models/TravelPost');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { upload } = require('../config/cloudinaryConfig');
const mongoose = require('mongoose'); // 
const { createNotification } = require('../config/notificationHelper');

// Create a travel post
router.post('/create', auth, upload.array('image', 5), async (req, res) => {
  try {
    const {
      title,
      startDate,
      endDate,
      currentLocationLat,
      currentLocationLng,
      destinationLat,
      destinationLng,
      interests
    } = req.body;

    // Basic validation
    if (!title?.trim()) {
      return res.status(400).json({ message: 'Tiêu đề không được để trống' });
    }

    // Date validation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const proposedStartDate = new Date(startDate);
    const proposedEndDate = new Date(endDate);

    // Validate date formats
    if (isNaN(proposedStartDate.getTime()) || isNaN(proposedEndDate.getTime())) {
      return res.status(400).json({ message: 'Định dạng ngày không hợp lệ' });
    }

    // Check if start date is in the past
    if (proposedStartDate < today) {
      return res.status(400).json({ message: 'Ngày bắt đầu không thể là trong quá khứ' });
    }

    // Validate start date is before end date
    if (proposedStartDate >= proposedEndDate) {
      return res.status(400).json({ message: 'Ngày bắt đầu phải nhỏ hơn ngày kết thúc' });
    }

    // Get user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Process images
    const imageUrls = req.files ? req.files.map(file => file.path) : [];
    if (imageUrls.length === 0) {
      return res.status(400).json({ message: 'Cần ít nhất một hình ảnh cho bài viết' });
    }

    // Create new post
    const newPost = new TravelPost({
      author: req.user.id,
      title: title.trim(),
      startDate: proposedStartDate,
      endDate: proposedEndDate,
      images: imageUrls,
      currentLocation: {
        type: 'Point',
        coordinates: [
          parseFloat(currentLocationLng) || 0,
          parseFloat(currentLocationLat) || 0
        ]
      },
      destination: {
        type: 'Point',
        coordinates: [
          parseFloat(destinationLng) || 0,
          parseFloat(destinationLat) || 0
        ]
      },
      interests: interests 
        ? interests.split(',').map(interest => interest.trim()).filter(Boolean)
        : []
    });

    // Save post and update user in parallel
    await Promise.all([
      newPost.save(),
      User.findByIdAndUpdate(user._id, {
        $inc: { postsCount: 1 },
        $push: { Post: newPost._id }
      })
    ]);

    res.status(201).json({ 
      success: true,
      message: 'Tạo bài viết thành công', 
      post: newPost
    });

  } catch (error) {
    console.error('Lỗi khi tạo bài viết:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi khi tạo bài viết', 
      error: error.message 
    });
  }
});

// Get all travel posts
router.get('/', auth, async (req, res) => {
  try {
    // Get current user to check blocked list
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get blocked user IDs
    const blockedUserIds = currentUser.blocked.map(block => block.user.toString());

    // Find posts excluding blocked users and the current user
    const posts = await TravelPost.find({
      author: { $nin: [...blockedUserIds, currentUser._id] } // Exclude posts from blocked users and the current user
    })
      .populate('author', 'name username avatar dob')
      .sort('-createdAt');

    const postsWithAge = posts.map(post => ({
      ...post._doc,
      author: {
        ...post.author._doc,
        age: post.author.dob && typeof post.author.dob.getTime === 'function' 
          ? calculateAge(post.author.dob) 
          : null
      }
    }));

    res.json(postsWithAge);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


// Get travel posts for map view
router.get('/map-posts', auth, async (req, res) => {
  try {
    const posts = await TravelPost.find()
      .select('title currentLocation destination author')
      .populate('author', 'username avatar');

    const mapPosts = posts.map(post => ({
      id: post._id,
      title: post.title,
      currentLocation: post.currentLocation.coordinates,
      destination: post.destination.coordinates,
      author: {
        username: post.author.username,
        avatar: post.author.avatar
      }
    }));

    res.json(mapPosts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching map posts', error: error.message });
  }
});

function calculateAge(birthday) {
  const ageDifMs = Date.now() - birthday.getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}
router.put('/edit/:postId', auth, upload.array('images', 5), async (req, res) => {
  try {
    const { 
      title, 
      startDate, 
      endDate, 
      destinationLat, 
      destinationLng, 
      destinationName, 
      imagesToDelete 
    } = req.body;
    
    const postId = req.params.postId;

    // Kiểm tra bài viết tồn tại
    const travelPost = await TravelPost.findById(postId);
    if (!travelPost) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết du lịch' });
    }

    // Kiểm tra quyền sở hữu
    if (travelPost.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa bài viết này' });
    }

    // Cập nhật thông tin cơ bản
    const updates = {};
    
    if (title) updates.title = title;
    
    // Xử lý ngày tháng an toàn
    if (startDate) {
      try {
        updates.startDate = new Date(startDate);
        if (isNaN(updates.startDate.getTime())) {
          throw new Error('Invalid start date');
        }
      } catch (error) {
        return res.status(400).json({ message: 'Ngày bắt đầu không hợp lệ' });
      }
    }
    
    if (endDate) {
      try {
        updates.endDate = new Date(endDate);
        if (isNaN(updates.endDate.getTime())) {
          throw new Error('Invalid end date');
        }
      } catch (error) {
        return res.status(400).json({ message: 'Ngày kết thúc không hợp lệ' });
      }
    }

    // Cập nhật địa điểm
    if (destinationLat && destinationLng) {
      updates.destination = {
        type: 'Point',
        coordinates: [parseFloat(destinationLng), parseFloat(destinationLat)]
      };
    }
    
    if (destinationName) updates.destinationName = destinationName;

    // Xử lý ảnh mới
    if (req.files && req.files.length > 0) {
      const newImageUrls = req.files.map(file => file.path);
      updates.images = [...(travelPost.images || []), ...newImageUrls];
    }

    // Xử lý xóa ảnh
    if (imagesToDelete) {
      const imagesToDeleteArray = Array.isArray(imagesToDelete) ? imagesToDelete : [imagesToDelete];
      console.log('Images to delete:', imagesToDeleteArray);
      
      // Lọc ra những ảnh không nằm trong danh sách xóa
      const currentImages = updates.images || travelPost.images || [];
      updates.images = currentImages.filter(img => !imagesToDeleteArray.includes(img));
      
      console.log('Updated images:', updates.images);
    }

    // Cập nhật bài viết với những thay đổi mới
    Object.assign(travelPost, updates);
    
    // Lưu thay đổi
    const updatedTravelPost = await travelPost.save();

    res.status(200).json({
      message: 'Bài viết du lịch đã được cập nhật thành công',
      travelPost: updatedTravelPost
    });
    
  } catch (error) {
    console.error('Lỗi khi chỉnh sửa bài viết du lịch:', error);
    res.status(500).json({
      message: 'Lỗi server khi chỉnh sửa bài viết du lịch',
      error: error.message
    });
  }
});
router.delete('/delete/:postId', auth, async (req, res) => {
  try {
    const postId = req.params.postId;

    // Xóa bài viết
    const deletedPost = await TravelPost.findByIdAndDelete(postId);

    if (!deletedPost) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết du lịch' });
    }

    // Cập nhật User để xóa tham chiếu đến bài viết đã xóa
    await User.updateMany(
      { Post: postId },
      { $pull: { Post: postId }, $inc: { postsCount: -1 } }
    );

    res.status(200).json({ message: 'Bài viết du lịch đã được xóa thành công' });
  } catch (error) {
    console.error('Lỗi khi xóa bài viết du lịch:', error);
    res.status(500).json({ 
      message: 'Lỗi server khi xóa bài viết du lịch', 
      error: error.message
    });
  }
});

router.get('/my-posts', auth, async (req, res) => {
  try {
    const userId = req.user.id; // Get the logged-in user's ID from the auth middleware

    const userPosts = await TravelPost.find({ author: userId })
      .populate('author', 'name username avatar')
      .sort('-createdAt');

    res.json(userPosts);
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// chi tiết  travel post
router.get('/:postId', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    
    // Validate postId
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Invalid post ID format' });
    }

    const post = await TravelPost.findById(postId)
      .populate('author', 'username avatar bio email')
      .lean();

    if (!post) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }

    res.json(post);
  } catch (error) {
    console.error('Error in getTravelPostDetail:', error);
    res.status(500).json({ 
      message: 'Lỗi server khi lấy chi tiết bài viết',
      error: error.message 
    });
  }
});

router.post('/:postId/toggle-like', auth, async (req, res) => {
  try {
    const post = await TravelPost.findById(req.params.postId)
      .populate('author', 'username avatar fcmToken');
    
    if (!post) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy bài viết' 
      });
    }

    const userId = req.user.id;
    const likeIndex = post.likes.findIndex(id => id.toString() === userId);
    
    // Lấy thông tin người like
    const likeUser = await User.findById(userId).select('username avatar');
    
    if (likeIndex > -1) {
      // Unlike - remove user from likes array
      post.likes.splice(likeIndex, 1);
    } else {
      // Like - add user to likes array
      post.likes.push(userId);

      // Gửi thông báo khi like (không phải tự like)
      if (post.author._id.toString() !== userId) {
        try {
          console.log('Sending like notification for travel post...'); 
          
          const notificationData = {
            recipientId: post.author._id.toString(),
            senderId: userId,
            type: 'likeTravel',
            postId: post._id.toString(),
            senderName: likeUser.username,
            senderAvatar: likeUser.avatar || null
          };
          
          // console.log('Travel post notification data:', notificationData);
          
          await createNotification(notificationData);
        } catch (notifError) {
          console.error('Error sending travel post notification:', notifError);
        }
      }
    }

    await post.save();

    return res.json({
      success: true,
      likesCount: post.likes.length,
      isLiked: likeIndex === -1,
      message: likeIndex === -1 ? 'Đã thích bài viết' : 'Đã bỏ thích bài viết'
    });

  } catch (error) {
    console.error('Error toggling like for travel post:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Lỗi server',
      error: error.message 
    });
  }
});

router.get('/a/search', async (req, res) => {
  try {
    const { query, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const searchCondition = {
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { destinationName: { $regex: query, $options: 'i' } },
        { interests: { $regex: query, $options: 'i' } }
      ]
    };

    // Thực hiện song song cả hai truy vấn
    const [results, total] = await Promise.all([
      TravelPost.find(searchCondition)
        .populate('author', 'username avatar')
        .sort('-createdAt')
        .skip(skip)
        .limit(parseInt(limit)),
      TravelPost.countDocuments(searchCondition)
    ]);

    res.json({
      success: true,
      posts: results,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        hasMore: skip + results.length < total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error searching travel posts:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi tìm kiếm bài viết du lịch',
      error: error.message
    });
  }
});
// Thêm route để lấy travel posts của một user cụ thể
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const travelPosts = await TravelPost.find({ author: userId })
      .populate('author', 'username avatar')
      .sort('-createdAt');

    // Thêm thông tin likes và format dữ liệu
    const formattedPosts = travelPosts.map(post => ({
      _id: post._id,
      title: post.title,
      images: post.images,
      startDate: post.startDate,
      endDate: post.endDate,
      currentLocation: post.currentLocation,
      destination: post.destination,
      destinationName: post.destinationName,
      likes: post.likes,
      likesCount: post.likes.length,
      isLiked: post.likes.includes(req.user.id),
      author: post.author,
      createdAt: post.createdAt,
      interests: post.interests
    }));

    res.json({
      success: true,
      posts: formattedPosts,
      count: formattedPosts.length
    });

  } catch (error) {
    console.error('Error fetching user travel posts:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi server khi lấy bài viết du lịch của người dùng',
      error: error.message 
    });
  }
});
module.exports = router;