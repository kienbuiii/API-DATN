const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function(req, res, next) {
    try {
        const authHeader = req.header('Authorization');
       // console.log('Received Authorization header:', authHeader);

        if (!authHeader) {
            return res.status(401).json({ 
                success: false,
                message: 'Không có token, xác thực thất bại' 
            });
        }

        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                message: 'Token không đúng định dạng' 
            });
        }

        const token = authHeader.slice(7);
       // console.log('Extracted token:', token);

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
           // console.log('Decoded token:', decoded);

            const userId = decoded.id || decoded._id;
            
            if (!userId) {
                return res.status(401).json({ 
                    success: false,
                    message: 'Token không hợp lệ: không tìm thấy ID người dùng',
                    decodedToken: decoded
                });
            }

            const user = await User.findById(userId);
           // console.log('Found user:', user ? user._id : 'No user found');

            if (!user) {
                return res.status(401).json({ 
                    success: false,
                    message: 'Không tìm thấy người dùng với ID trong token' 
                });
            }

            req.user = user;
            req.token = token;

            next();
        } catch (jwtError) {
            console.error('JWT verification error:', jwtError);
            return res.status(401).json({ 
                success: false,
                message: 'Token không hợp lệ hoặc đã hết hạn',
                error: jwtError.message 
            });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi xác thực',
            error: error.message 
        });
    }
};