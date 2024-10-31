const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth')
const User = require('../models/User');
const { upload } = require('../config/cloudinaryConfig');

// Hàm helper để lấy URL Cloudinary
const getCloudinaryUrl = (path) => {
  return path; // Cloudinary đã trả về URL đầy đủ, không cần thêm gì
};

router.post('/create-post', auth, upload.array('image', 5), async (req, res) => {
  try {
    const { title, latitude, longitude } = req.body;

    if (!title || !latitude || !longitude) {
      return res.status(400).json({ message: 'Vui lòng nhập đủ tiêu đề, vị trí!' });
    }

    const imageUrls = req.files ? req.files.map(file => file.path) : [];

    const post = new Post({
      title,
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      },
      images: imageUrls,
      user: req.user.id
    });

    const savedPost = await post.save();
    res.status(201).json(savedPost);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi lưu bài viết!', error: err.message });
  }
});
router.put('/edit-post/:postId', auth, upload.array('newImages', 5), async (req, res) => {
  try {
    console.log('Received edit post request:', req.body);
    console.log('Files:', req.files);

    const { title, existingImages } = req.body;
    const postId = req.params.postId;

    // Check if the post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Update title
    post.title = title;

    // Handle existing images
    const existingImageUrls = Array.isArray(existingImages) ? existingImages : [existingImages].filter(Boolean);
    
    // Handle new images
    const newImageUrls = req.files ? req.files.map(file => file.path) : [];

    // Combine existing and new image URLs
    post.images = [...existingImageUrls, ...newImageUrls];

    console.log('Updated post images:', post.images);

    const updatedPost = await post.save();
    res.status(200).json(updatedPost);
  } catch (err) {
    console.error('Error editing post:', err);
    res.status(500).json({ message: 'Error editing post', error: err.message });
  }
});
router.delete('/delete-post/:postId', auth, async (req, res) => {
  try {
    const postId = req.params.postId;

    // Kiểm tra xem bài viết có tồn tại không
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }

    // Kiểm tra quyền sở hữu bài viết (nếu cần)
    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa bài viết này' });
    }

    // Xóa bài viết
    await Post.findByIdAndDelete(postId);
    res.status(200).json({ message: 'Bài viết đã được xóa thành công' });
  } catch (err) {
    console.error('Lỗi khi xóa bài viết:', err);
    res.status(500).json({ message: 'Lỗi khi xóa bài viết', error: err.message });
  }
});
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Tìm tất cả bài đăng của người dùng
    const posts = await Post.find({ user: userId })
      .sort({ createdAt: -1 }) // Sắp xếp theo thời gian tạo, mới nhất trước
      .populate('user', 'username avatar') // Populate thông tin người dùng
      .select('-comments'); // Không lấy comments để giảm kích thước response

    res.json(posts);
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({ message: 'Lỗi server khi lấy bài đăng của người dùng' });
  }
});

router.get('/my-posts', auth, async (req, res) => {
  try {
    const posts = await Post.find({ user: req.user.id }).sort({ createdAt: -1 });
    
    const postsWithFullImageUrls = posts.map(post => ({
      ...post.toObject(),
      images: post.images.map(getCloudinaryUrl)
    }));

    res.status(200).json(postsWithFullImageUrls);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách bài viết của bạn', error: err.message });
  }
});
// Route để hiển thị một bài viết cụ thể
// Route để hiển thị một bài viết cụ thể
router.get('/post/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate('user', 'username avatar');
    if (!post) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }

    // Tạo URL đầy đủ cho hình ảnh và avatar
    const postWithFullInfo = {
      ...post.toObject(),
      images: post.images.map(getCloudinaryUrl),
      user: post.user ? {
        _id: post.user._id,
        username: post.user.username,
        avatar: post.user.avatar ? getCloudinaryUrl(post.user.avatar) : null
      } : null
    };

    res.status(200).json(postWithFullInfo);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi lấy thông tin bài viết', error: err.message });
  }
});

// Route để hiển thị tất cả bài viết kèm thông tin người đăng
router.get('/all-posts', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('user', 'username avatar') // Populate thông tin người dùng
      .sort({ createdAt: -1 }); // Sắp xếp theo thời gian tạo mới nhất

    const postsWithFullInfo = posts.map(post => {
      const postObject = post.toObject();
      return {
        ...postObject,
        images: postObject.images.map(getCloudinaryUrl),
        user: postObject.user ? {
          ...postObject.user,
          avatar: postObject.user.avatar ? getCloudinaryUrl(postObject.user.avatar) : null
        } : null
      };
    });

    res.status(200).json(postsWithFullInfo);
  } catch (err) {
    console.error('Lỗi khi lấy danh sách bài viết:', err);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách bài viết', error: err.message });
  }
});
router.post('/:postId/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId)
      .populate('user', 'username'); // Thêm populate để lấy thông tin người đăng bài

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const userId = req.user.id;
    const currentUser = await User.findById(userId);

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const likeIndex = post.likes.indexOf(userId);
    if (likeIndex !== -1) {
      // Unlike
      post.likes.splice(likeIndex, 1);
      post.likesCount = Math.max(0, post.likesCount - 1);
    } else {
      // Like và gửi thông báo
      post.likes.push(userId);
      post.likesCount += 1;

      // Chỉ gửi thông báo khi like (không gửi khi unlike)
      if (post.user._id.toString() !== userId) { // Không gửi thông báo nếu user like bài viết của chính mình
        const sendNotification = req.app.get('sendNotification');
        await sendNotification({
          recipient: post.user._id,
          sender: userId,
          type: 'like',
          post: post._id,
          content: `${currentUser.username} đã thích bài viết của bạn`
        });
      }
    }

    await post.save();

    res.json({ 
      message: likeIndex !== -1 ? 'Post unliked successfully' : 'Post liked successfully', 
      likesCount: post.likesCount,
      likes: post.likes
    });
  } catch (error) {
    console.error('Error processing like:', error);
    res.status(500).json({ message: 'Error processing like', error: error.message });
  }
});
router.get('/map-posts', auth, async (req, res) => {
  try {
    const posts = await Post.find()
      .select('title location images user')
      .populate('user', 'username')
      .sort({ createdAt: -1 });

    const mapPosts = posts.map(post => {
      const postObject = post.toObject();
      return {
        id: postObject._id,
        title: postObject.title,
        location: postObject.location,
        thumbnail: postObject.images.length > 0 ? postObject.images[0] : null,
        username: postObject.user.username
      };
    });

    res.status(200).json(mapPosts);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách bài viết cho bản đồ', error: err.message });
  }
});
// Thêm route này vào cuối file posts.js

router.get('/feed', auth, async (req, res) => {
  try {
    // Lấy ID của người dùng hiện tại
    const currentUserId = req.user.id;

    // Tìm thông tin người dùng hiện tại, bao gồm danh sách người họ đang theo dõi
    const currentUser = await User.findById(currentUserId).select('following');

    // Tạo một mảng ID bao gồm người dùng hiện tại và những người họ đang theo dõi
    const userIds = [currentUserId, ...currentUser.following];

    // Tìm các bài đăng từ người dùng hiện tại và những người họ đang theo dõi
    const posts = await Post.find({ user: { $in: userIds } })
      .populate('user', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(20); // Giới hạn 20 bài đăng mới nhất, bạn có thể điều chỉnh số này

    // Xử lý URL đầy đủ cho hình ảnh và avatar
    const postsWithFullInfo = posts.map(post => {
      const postObject = post.toObject();
      return {
        ...postObject,
        images: postObject.images.map(getCloudinaryUrl),
        user: postObject.user ? {
          ...postObject.user,
          avatar: postObject.user.avatar ? getCloudinaryUrl(postObject.user.avatar) : null
        } : null
      };
    });

    res.status(200).json(postsWithFullInfo);
  } catch (err) {
    console.error('Lỗi khi lấy feed:', err);
    res.status(500).json({ message: 'Lỗi khi lấy feed', error: err.message });
  }
});
// ... (giữ nguyên code hiện tại)

// Thêm comment vào bài viết
router.post('/:postId/comments', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const postId = req.params.postId;
    const userId = req.user.id;

    if (!content) {
      return res.status(400).json({ message: 'Nội dung comment không được để trống' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }

    const newComment = {
      user: userId,
      content: content,
      createdAt: new Date()
    };

    post.comments.push(newComment);
    post.commentsCount = post.comments.length;
    await post.save();

    // Populate thông tin user cho comment mới
    const populatedPost = await Post.findById(postId)
      .populate({
        path: 'comments.user',
        select: 'username avatar'
      });

    const addedComment = populatedPost.comments[populatedPost.comments.length - 1];

    // Tạo URL đầy đủ cho avatar
    const commentWithFullInfo = {
      ...addedComment.toObject(),
      user: addedComment.user ? {
        ...addedComment.user.toObject(),
        avatar: addedComment.user.avatar ? `${req.protocol}://${req.get('host')}${addedComment.user.avatar}` : null
      } : null
    };

    res.status(201).json({
      message: 'Comment đã được thêm thành công',
      comment: commentWithFullInfo
    });
  } catch (error) {
    console.error('Lỗi khi thêm comment:', error);
    res.status(500).json({ message: 'Lỗi server khi thêm comment', error: error.message });
  }
});
// Lấy danh sách comments của một bài viết
router.get('/:postId/comments', async (req, res) => {
  try {
    const postId = req.params.postId;
    const post = await Post.findById(postId)
      .populate({
        path: 'comments.user',
        select: 'username avatar'
      })
      .select('comments');

    if (!post) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }

    // Tạo URL đầy đủ cho avatar của mỗi comment
    const commentsWithFullInfo = post.comments.map(comment => ({
      ...comment.toObject(),
      user: comment.user ? {
        ...comment.user.toObject(),
        avatar: comment.user.avatar ? `${req.protocol}://${req.get('host')}${comment.user.avatar}` : null
      } : null
    }));

    res.status(200).json({
      message: 'Lấy danh sách comments thành công',
      comments: commentsWithFullInfo
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách comments:', error);
    res.status(500).json({ message: 'Lỗi server khi lấy danh sách comments', error: error.message });
  }
});

module.exports = router;
