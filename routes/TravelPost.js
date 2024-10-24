const express = require('express');
const router = express.Router();
const TravelPost = require('../models/TravelPost');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { upload } = require('../config/cloudinaryConfig');

// Create a travel post
router.post('/create', auth, upload.array('image', 5), async (req, res) => {
  try {
    console.log('Received data:', req.body);
    console.log('Received files:', req.files);

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

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const imageUrls = req.files ? req.files.map(file => file.path) : [];

    const newPost = new TravelPost({
      author: req.user.id,
      title,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      images: imageUrls,
      currentLocation: {
        type: 'Point',
        coordinates: [parseFloat(currentLocationLng) || 0, parseFloat(currentLocationLat) || 0]
      },
      destination: {
        type: 'Point',
        coordinates: [parseFloat(destinationLng) || 0, parseFloat(destinationLat) || 0]
      },
      interests: interests ? interests.split(',').map(interest => interest.trim()) : []
    });

    await newPost.save();

    // Update user's post count and add post reference
    user.postsCount += 1;
    user.Post.push(newPost._id);
    await user.save();

    res.status(201).json({ 
      message: 'Post created successfully', 
      post: newPost
    });
  } catch (error) {
    console.error('Error details:', error);
    res.status(400).json({ message: 'Failed to create post', error: error.message });
  }
});

// Get all travel posts
router.get('/', async (req, res) => {
  try {
    const posts = await TravelPost.find()
      .populate('author', 'name username avatar dob')
      .sort('-createdAt');

    const postsWithAge = posts.map(post => ({
      ...post._doc,
      author: {
        ...post.author._doc,
        age: post.author.dob && typeof post.author.dob.getTime === 'function' ? calculateAge(post.author.dob) : null
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
    const { title, startDate, endDate, destinationLat, destinationLng, destinationName } = req.body;
    const postId = req.params.postId;

    // Kiểm tra xem bài viết có tồn tại không
    const travelPost = await TravelPost.findById(postId);
    if (!travelPost) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết du lịch' });
    }

    // Kiểm tra quyền sở hữu bài viết
    if (travelPost.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa bài viết này' });
    }

    // Cập nhật thông tin
    if (title) travelPost.title = title;
    if (startDate) travelPost.startDate = new Date(startDate);
    if (endDate) travelPost.endDate = new Date(endDate);
    
    // Cập nhật vị trí muốn đến
    if (destinationLat && destinationLng) {
      travelPost.destination = {
        type: 'Point',
        coordinates: [parseFloat(destinationLng), parseFloat(destinationLat)]
      };
    }
    if (destinationName) travelPost.destinationName = destinationName;

    // Xử lý ảnh mới
    if (req.files && req.files.length > 0) {
      const newImageUrls = req.files.map(file => file.path);
      travelPost.images = [...travelPost.images, ...newImageUrls];
    }

    // Xử lý xóa ảnh
    const { imagesToDelete } = req.body;
    if (imagesToDelete) {
      const imagesToDeleteArray = Array.isArray(imagesToDelete) ? imagesToDelete : [imagesToDelete];
      travelPost.images = travelPost.images.filter(img => !imagesToDeleteArray.includes(img));
    }

    // Lưu các thay đổi
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
// ... existing code ...

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
module.exports = router;