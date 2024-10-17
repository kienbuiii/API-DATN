const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
    // Lấy token từ header Authorization
    const authHeader = req.header('Authorization');

    // Kiểm tra xem có header Authorization không
    if (!authHeader) {
        return res.status(401).json({ msg: 'Không có token, xác thực thất bại' });
    }

    // Kiểm tra xem header có bắt đầu bằng "Bearer " không
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ msg: 'Token không đúng định dạng' });
    }

    // Lấy token (bỏ qua "Bearer " ở đầu)
    const token = authHeader.slice(7);

    try {
        // Xác minh token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Thêm user từ payload
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token không hợp lệ' });
    }
};