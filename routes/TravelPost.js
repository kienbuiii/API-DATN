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

// Helper function to calculate age
function calculateAge(birthday) {
  const ageDifMs = Date.now() - birthday.getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

module.exports = router;