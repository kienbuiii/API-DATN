require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
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
const io = socketIo(server);

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

// Initialize socket handlers
handleSocket(io);

const PORT = process.env.PORT;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));