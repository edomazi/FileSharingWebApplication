// load the things we need
var mongoose = require('mongoose');
var bcrypt   = require('bcrypt-nodejs');
const Schema = mongoose.Schema;
// define the schema for our user model         //pun conditii de min si max lenght si aici in modele.
var userSchema = mongoose.Schema({
    name         : String,
    phone        : Number,
    university   : String,
    job          : String,
    filesizelimit: Number,
    points       : Number,
    role         : String,
    local            : {
        email        : String,
        password     : String,
    },
    fileID: [{
        type: Schema.Types.ObjectId,
        ref: "uploads.files"
    }],
    DownloadedFileID: [{
        type: Schema.Types.ObjectId,
        ref: "uploads.files"
    }]
});

// generating a hash
userSchema.methods.generateHash = function(password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};

// checking if password is valid
userSchema.methods.validPassword = function(password) {
    return bcrypt.compareSync(password, this.local.password);
};
// create the model for users and expose it to our app
module.exports = mongoose.model('User', userSchema);
