const jwt = require('jsonwebtoken');
const User = require('../models/User');

const checkAdminRole = async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      console.log('Received token:', token);
  
      if (!token) {
        return res.status(401).json({ 
          success: false,
          message: 'Không có token' 
        });
      }
  
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Decoded token:', decoded);
  
      const user = await User.findById(decoded.id);
      console.log('Found user:', user);
  
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ 
          success: false,
          message: 'Không có quyền admin' 
        });
      }
  
      req.user = user;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(401).json({ 
        success: false,
        message: 'Token không hợp lệ',
        error: error.message 
      });
    }
};

// Middleware kiểm tra token
const checkToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Không có token xác thực'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Người dùng không tồn tại'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({
            success: false,
            message: 'Token không hợp lệ',
            error: error.message
        });
    }
};

module.exports = { 
    checkAdminRole,
    checkToken 
};