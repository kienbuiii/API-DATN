require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');
const { chatHandler } = require('./socketHandlers/chatHandlers');
const { adminChatHandler } = require('./socketHandlers/adminChatHandlers');
const admin = require('./config/firebase');

// Import routes
const userRoutes = require('./routes/user');
const postRoutes = require('./routes/posts');
const adminRouter = require('./routes/admin');
const reportRouter = require('./routes/reportRouter');

const scanRoutes = require('./routes/scan');
const travelPostRoutes = require('./routes/TravelPost');
const notificationRoutes = require('./routes/notification');
const chatRoutes = require('./routes/chatRouter');



const app = express();
const server = http.createServer(app);

// Cấu hình CORS cho Express
app.use(cors({
  origin: [
    'https://www.adminftravel.xyz',
    'http://localhost:3001',
    'https://adminftravel.xyz',
    'http://192.168.137.1:3001',
    'https://lobster-upward-sunbeam.ngrok-free.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Cấu hình Socket.IO với CORS và tối ưu hóa
const io = socketIo(server, {
  cors: {
    origin: [
      'https://www.adminftravel.xyz',
      'http://localhost:3001',
      'https://adminftravel.xyz',
      'http://192.168.137.1:3001',
      'https://lobster-upward-sunbeam.ngrok-free.app'
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  path: '/socket.io/',
  connectTimeout: 45000,
  maxHttpBufferSize: 1e6
});

// Middleware cho Socket.IO
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication token is required'));
    }
    
    // Verify token here if needed
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // socket.user = decoded;
    
    next();
  } catch (error) {
    next(new Error('Invalid authentication token'));
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
app.use('/api/reports', reportRouter);

app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRouter);

// Cấu hình phục vụ tệp tĩnh
app.use(express.static('public'));

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Xử lý chat thông thường
  chatHandler(io, socket);
  
  // Xử lý chat cho admin
  adminChatHandler(io, socket);

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

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
  console.log(`Server URL: https://20.2.67.63:${PORT}`);
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


