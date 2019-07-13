// load the things we need
var mongoose = require('mongoose');
const Schema = mongoose.Schema;

var fileSchema = mongoose.Schema({
    _id: {
        type: Schema.Types.ObjectId
        },
    userName: String,
    title: String,
    description: String,
    keyWords: String,
    uploadDate: Date,
    Filecomments: [{
        userId: {
            type: Schema.Types.ObjectId
        },
        userName: String,
        comment: String,
        dateAdded: {
            day: Number,
            month: String,
            year: Number
        }
    }]
});


// create the model for file info and export it 
module.exports = mongoose.model('FileInfo', fileSchema);
