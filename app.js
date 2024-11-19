require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');
const { chatHandler } = require('./socketHandlers/chatHandlers');
const admin = require('./config/firebase'); // Thêm import Firebase Admin

// Import routes
const userRoutes = require('./routes/user');
const postRoutes = require('./routes/posts');
const scanRoutes = require('./routes/scan');
const travelPostRoutes = require('./routes/TravelPost');
const notificationRoutes = require('./routes/notification');
const chatRoutes = require('./routes/chatRouter');
const soThich = require('./models/soThich');

const app = express();
const server = http.createServer(app);

// Cấu hình CORS cho Express
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(cors({
  origin: ['http://localhost:3001', 'https://lobster-upward-sunbeam.ngrok-free.app'],
  credentials: true
}));

// Cấu hình Socket.IO với CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization"],
    credentials: true
  }
});

// Lưu io instance vào app để sử dụng trong routes
app.set('io', io);

// Kết nối database
connectDB();

// Middleware
app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/uploads', express.static('uploads'));
app.use('/api/posts', postRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/travel-posts', travelPostRoutes);
app.use('/api/soThich', soThich);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Socket.IO connection handler (chỉ cho chat)
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Khởi tạo chat handler
  chatHandler(io, socket);

  // Xử lý authentication cho socket (nếu cần)
  socket.use((packet, next) => {
    // Kiểm tra token hoặc session ở đây nếu cần
    // const token = socket.handshake.auth.token;
    // if (!token) return next(new Error('Authentication error'));
    next();
  });

  // Xử lý lỗi socket
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  // Xử lý disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Middleware để thêm Firebase Admin vào req
app.use((req, res, next) => {
  req.firebaseAdmin = admin;
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something broke!', error: err.message });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server URL: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Performing graceful shutdown...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Unhandled rejection handler
process.on('unhandledRejection', (err) => {
  console.log('Unhandled Rejection:', err);
});

// Firebase Admin Cleanup on shutdown
process.on('SIGINT', async () => {
  try {
    await admin.app().delete();
    console.log('Firebase Admin SDK cleaned up.');
    process.exit(0);
  } catch (error) {
    console.error('Error cleaning up Firebase Admin:', error);
    process.exit(1);
  }
});