require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors'); // Thêm cors
const connectDB = require('./config/db');
const soThich = require('./models/soThich');
const userRoutes = require('./routes/user');
const postRoutes = require('./routes/posts');
const scanRoutes = require('./routes/scan');
const travelPostRoutes = require('./routes/TravelPost');
const notificationRoutes = require('./routes/notification');
const chatRoutes = require('./routes/chatRouter');
const { handleSocket } = require('./socketHandlers');

const app = express();
const server = http.createServer(app);

// Cấu hình CORS cho Express
app.use(cors({
  origin: '*', // Hoặc specify domain cụ thể
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Cấu hình Socket.IO với CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization"],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true
});

connectDB();

app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/uploads', express.static('uploads'));
app.use('/api/posts', postRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/travel-posts', travelPostRoutes);
app.use('/api/soThich', soThich);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);

// Thêm route kiểm tra health
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Initialize socket handlers
handleSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server URL: http://your-ip:${PORT}`);
});

// Error handling
process.on('unhandledRejection', (err) => {
  console.log('Unhandled Rejection:', err);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Performing graceful shutdown...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});