
const mongoose = require('mongoose');

const soThichSchema = new mongoose.Schema({
 Ten:String
});

module.exports = mongoose.model('soThich', soThichSchema);



