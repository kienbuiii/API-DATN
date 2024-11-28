const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json'); // Tạo file này từ Firebase Console

// Khởi tạo Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://notifycation-9c71a-default-rtdb.firebaseio.com/"
    });
}

const db = admin.database();

module.exports = { admin, db };