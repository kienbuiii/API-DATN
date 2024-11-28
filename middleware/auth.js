const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function(req, res, next) {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
        return res.status(401).json({ msg: 'Không có token, xác thực thất bại' });
    }

    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ msg: 'Token không đúng định dạng' });
    }

    const token = authHeader.slice(7);

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const user = await User.findById(decoded.user.id);
        if (!user) {
            return res.status(401).json({ msg: 'Token không hợp lệ' });
        }
        
        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token không hợp lệ' });
    }
};