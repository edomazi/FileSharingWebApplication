const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
var mongoose = require('mongoose');
var configDB = require('../config/database.js');
var User = require('../app/models/user');
var FileDescription = require('../app/models/fileInfo');
const { check } = require('express-validator/check');


module.exports = function (app, passport) {

    // show the home page 
    app.get('/', function (req, res) {
        res.render('index.ejs', { message: req.flash('loginMessage') , messages: req.flash('signupMessage') } );
    });

    // logout 
    app.get('/logout', function (req, res) {
        req.logout();
        res.redirect('/');
    });

    // process the login form
    app.post('/login', passport.authenticate('local-login', {
        successRedirect: '/profile',   // redirect to the secure profile section
        failureRedirect: '/',          // redirect back to the signup page if there is an error
        failureFlash: true             // allow flash messages
    }));


    // process the signup form
    app.post('/signup', passport.authenticate('local-signup', {
        successRedirect: '/profile', // redirect to the secure profile section
        failureRedirect: '/',        // redirect back to the signup page if there is an error
        failureFlash: true           // allow flash messages
    }));

    // authorize already logged 
    // locally --------------------------------
    app.get('/connect/local', function (req, res) {
        res.render('connect-local.ejs', { message: req.flash('loginMessage') });
    });
    app.post('/connect/local', passport.authenticate('local-signup', {
        successRedirect: '/profile', // redirect to the secure profile section
        failureRedirect: '/connect/local', // redirect back to the signup page if there is an error
        failureFlash: true // allow flash messages
    }));


    // unlink the email and password ( changing log in credentials ) while still logged in
    app.get('/unlink/local', isLoggedIn, function (req, res) {
        var user = req.user;
        user.local.email = undefined;
        user.local.password = undefined;
        user.save(function (err) {
            res.redirect('/connect/local');
        });
    });
    //get the edit page with user informations
    app.get('/edit', isLoggedIn, function (req, res) {
        User.findById(req.user.id).then(data => {
            res.render('edit', { userData: data })
        })
    });
    //post the modification made 
    app.post('/edit', isLoggedIn,[
        check('editname').trim().escape(),
        check('editjob').trim().escape(),
        check('edituni').trim().escape(),
        check('editphone').trim().escape()
    ], function (req, res) {

        User.findByIdAndUpdate(req.user.id,
            {
                name: req.body.editname,
                job: req.body.editjob,
                university: req.body.edituni,
                phone: req.body.editphone
            }, { new: true }, function (err, user) {
                if (err) return next(err);
            });
        res.redirect('/profile');
    });

    let gfs;

    mongoose.createConnection(configDB.url).once('open', () => {
        // Init stream
        gfs = Grid(mongoose.createConnection(configDB.url).db, mongoose.mongo);
        gfs.collection('uploads');
    });

    // Create storage engine
    const storage = new GridFsStorage({
        url: configDB.url,
        file: (req, file) => {
            return new Promise((resolve, reject) => {
                const filename = file.originalname;
                const fileInfo = {
                    filename: filename,
                    bucketName: 'uploads',
                };
                resolve(fileInfo);
            });
        }

    });

    const upload = multer({ storage });

    // route GET courses
    app.get('/filesPage/:page', function (req, res) {
        var perPage = 5
        var page = req.params.page || 1
        var user = req.user;

        // show al courses that u search for in 1 page, seach after filename !! description !! keywords
        if (req.query.search) {
            const regex = new RegExp(escapeRegex(req.query.search), 'gi');
            FileDescription.find({ $or: [{ title: regex }, { description: regex }, { keyWords: regex }] }).sort({uploadDate: -1}).exec((err, files) => {
                perPage = files.length
                FileDescription.find({ $or: [{ title: regex }, { description: regex }, { keyWords: regex }] }).sort({uploadDate: -1}).skip((perPage * page) - perPage).limit(perPage).exec((err, files) => {
                    if (!files || files.length === 0) {
                        res.render('filesPage', { files: false, current: page, pages: 1, user: user });
                    } else {
                        res.render('filesPage', { files: files, current: page, pages: 1, user: user });
                    }
                });
            })
        } else {
            // show all the course with no search and pagination 
            FileDescription.find().exec(function (err, files) {
                let maxPages = files.length / perPage;
                //console.log(Math.ceil(maxPages));
                FileDescription.find().sort({uploadDate: -1}).skip((perPage * page) - perPage).limit(perPage).exec((err, files) => {
                    if (!files || files.length === 0) {
                        res.render('filesPage', { files: false, current: page, pages: Math.ceil(maxPages), user: user });
                    } else {
                        res.render('filesPage', { files: files, current: page, pages: Math.ceil(maxPages), user: user });
                    }
                });
            });

        }
    })

    app.get('/submit', function (req, res) {
        var message = ""
        res.render('submit', { message: message })
    })

    // Uploads file to DB and update the array in user with the file id
    app.post('/upload', isLoggedIn,[
        check('description').trim().escape(),
        check('keywords').trim().escape()
    ], upload.single('file'), (req, res) => {
        // res.json({ file: req.file });
        if (isLoggedIn && req.file.size > req.user.filesizelimit) {
            var message = "File dimmension too big, try to compress it or divide in parts"
            return res.render('submit', { message: message })
        } else {
            var userid = { '_id': req.user.id };
            var fileid = req.file.id;
            var update = { $push: { fileID: fileid } }
            //console.log(req.file.id);
            //update user array with the file added
            User.findByIdAndUpdate(userid, update, { new: true, upsert: true }, function (err, doc) {
                if (err) return next(err);
            });

            //update user points when he uploads a file.
            User.findByIdAndUpdate(userid, { $inc: { points: 100 } }, function (err, data) {
                if (err) return next(err);
            })

            //create the FileDescription schema and populate with the information that i have
            var newFileDescription = new FileDescription();
            newFileDescription._id = fileid;
            newFileDescription.userName = req.user.name;
            newFileDescription.title = req.file.filename;
            newFileDescription.uploadDate = req.file.uploadDate;
            newFileDescription.description = req.body.description;
            newFileDescription.keyWords = req.body.keywords;

            newFileDescription.save();
            //console.log(newFileDescription);
            res.redirect('/filesPage/1');
        }
    });

    // Delete file by id and delete the id from user's array 
    app.delete('/files/:id', isLoggedIn, (req, res) => {
        console.log(req.params.id);
        User.update({ _id: req.user.id }, { $pull: { fileID: req.params.id } }, { new: true, upsert: true }, function (err, doc) {

        });

        FileDescription.findOneAndRemove({ _id: req.params.id }, function (err, data) {
            if (err) return next(err);
            console.log(data);
        })
        gfs.remove({ _id: req.params.id, root: 'uploads' }, (err, gridStore) => {
            if (err) {
                return res.status(404).json({ err: err });
            }

            res.redirect('/profile');
        });
    });

    app.get('/profile', isLoggedIn, function (req, res) {
        var users = req.user;
        //console.log(users.fileID);

        gfs.files.find({ _id: { $in: users.fileID } }).toArray((err, files) => {
            // Check if files
            //console.log(files);
            if (!files || files.length === 0) {
                res.render('profile.ejs', { files: false, users: users });
            } else {
                res.render('profile.ejs', { files: files, users: users });

            }
        });
    });

    app.get('/alluserslist', isLoggedIn, isAdmin, function (req, res) {
        var users = req.user;
        User.find().exec(function (err, allusers) {
            if (err) return next(err);
            res.render('allUsers', { allusers: allusers, users: users })
        })
    })

    app.post('/deleteUser/:id', isLoggedIn, isAdmin, function (req, res) {

        User.findByIdAndRemove(req.params.id, function (err, data) {
            //console.log(data)
        })
        res.redirect('/alluserslist')
    });

    app.get('/edituserasadmin/:id', isLoggedIn, isAdmin, function (req, res) {
        User.findById(req.params.id, function (err, user) {
            if (err) return next(err);

            console.log(user);
            res.render('edituserasadmin', { user: user })
        })
    })
    app.post('/edituserasadmin/:id', isLoggedIn, isAdmin,[
        check('editname').trim().escape(),
        check('editjob').trim().escape(),
        check('edituni').trim().escape(),
        check('editpoints').trim().escape(),
        check('editphone').trim().escape(),
        check('editfilesize').trim().escape(),
        check('editrole').trim().escape()
    ], function (req, res) {
        User.findByIdAndUpdate(req.params.id,
            {
                name: req.body.editname,
                job: req.body.editjob,
                university: req.body.edituni,
                points: req.body.editpoints,
                phone: req.body.editphone,
                filesizelimit: req.body.editfilesize,
                role: req.body.editrole
            }, { new: true }, function (err, user) {
                if (err) return next(err);
            });
        res.redirect('/alluserslist')
    })


    // Download single file object by name
    app.get('/download/:filename', isLoggedIn, function (req, res) {
        var id = req.query.id;
        //console.log(req.query.id)
        gfs.files.find({ _id: id }, (err, file) => {
            // Check if file
            if (!file || file.length === 0) {
                return res.status(404).json({
                    err: 'No file exists'
                });
            }
            // File exists
            if (req.user.points < 0) {
                var message = "infucidient points to download the file, please fist upload a file or more"
                return res.render('submit.ejs', { message: message })
            }

            res.set('Content-Type', file.contentType);
            res.set('Content-Disposition', 'attachment; filename="' + req.params.filename + '"');
            // streaming from gridfs
            var readstream = gfs.createReadStream({
                _id: req.query.id
            });
            //error handling file does not exist
            readstream.on('error', function (err) {
                console.log('An error occurred!', err);
                throw err;
            });
            readstream.pipe(res);

            //decrese points once you have downloaded the file
            User.findByIdAndUpdate(req.user._id, { $inc: { points: -150 } }, function (err, data) {
                //console.log(data);
            })

            //add the file id to an array, not duplicated 
            var userid = { '_id': req.user._id };
            var downloadedFileID = { $addToSet: { DownloadedFileID: id } }
            User.findByIdAndUpdate(userid, downloadedFileID, { new: true, upsert: true }, function (err, doc) {
                //console.log(doc);  
            });
        });
    });

    app.get('/Filecomments/:id', function (req, res) {
        var user = req.user;
        var message = "";
        let commentID = "";
        let fileID = "";
        FileDescription.find({ _id: req.params.id }).exec(function (err, data) {
            if (err) return next(err);

            //var keys = Object.keys(data);
            //console.log(data);
            
            res.render('comments', { data: data, user: user, message: message, commentID: commentID, fileID: fileID});     //on file pages i have to sent a link here with the file id
        });

    });
 /*   app.get('/Addcomment/:id', isLoggedIn, function (req, res) {
        var id = req.params.id;

        User.find({ 'DownloadedFileID': { $in: [id] } }).exec(function (err, data) {
            if (data.length == 0) {
                var message = "You have to download the file before u can add a comment"
                FileDescription.find({ _id: id }).exec(function (err, data) {
                    res.render('comments', { data: data, user: req.user, message: message });
                })
            } else {
                for (var i = 0; i < data.length; i++) {
                    if (req.user._id.equals(data[i]._id)) {
                        FileDescription.find({ _id: id }).exec(function (err, data) {
                            if (err) return next(err);
                            //console.log(data);
                            res.render('addcomment', { data: data });     //on file pages i have to sent a link here with the file id
                        });
                        break;
                    } else {
                        if (i == data.length - 1) {
                            var message = "You have to download the file before u can add a comment"
                            FileDescription.find({ _id: id }).exec(function (err, data) {
                                res.render('comments', { data: data, user: req.user, message: message });
                            })
                        }

                    }
                }
            }
        })
    })
*/
    app.post('/Addcomment/:id', isLoggedIn, [
        check('comment').trim().escape()
    ], function (req, res) {
        const monthNames = ["January", "February", "March", "April", "May", "June","July", "August", "September", "October", "November", "December"];
        var id = req.params.id;
        var commentID= ""
        var fileID = ""
        
        User.find({ 'DownloadedFileID': { $in: [id] } }).exec(function (err, data) {
            if (data.length == 0) {
                var message = "You have to download the file before u can add a comment"
                FileDescription.find({ _id: id }).exec(function (err, data) {
                    res.render('comments', { data: data, user: req.user, message: message, commentID: commentID, fileID: fileID});
                })
            } else {
                for (var i = 0; i < data.length; i++) {
                    if (req.user._id.equals(data[i]._id)) {
                        FileDescription.find({ _id: id }).exec(function (err, data) {
                            if (err) return next(err);
                            //console.log(data);
                            var today = new Date();
                            var date = {
                                day : today.getDate(),
                                month : monthNames[today.getMonth()],
                                year : today.getFullYear()
                            }
                            var id = req.params.id;
                            var comment = {
                                userId: req.user.id,
                                userName: req.user.name,
                                comment: req.body.comment,
                                dateAdded: date
                            };
                            
                            FileDescription.findByIdAndUpdate(id, { $push: { Filecomments: comment } }, { upsert: true }, function (err, data) {
                                if (err) return next(err);
                                //console.log(data);
                                res.redirect('/Filecomments/' + data._id)
                            })
                        });
                        break;
                    } else {
                        if (i == data.length - 1) {
                            var message = "You have to download the file before u can add a comment"
                            FileDescription.find({ _id: id }).exec(function (err, data) {
                                res.render('comments', {data: data, user: req.user, message: message, commentID: commentID, fileID: fileID});
                            })
                        }

                    }
                }
            }
        })
    });

    app.delete('/Deletecomment/:id', isLoggedIn, function (req, res) {
        var commentID = req.params.id;
        var ids = req.body.id;

        //console.log("id of file: ", ids)
        //console.log("id of comment: ", commentID)
        FileDescription.findByIdAndUpdate(ids, { $pull: { Filecomments: { _id: commentID } } }, { new: true }, function (err, data) {
            if (err) return next(err);
            res.redirect('/Filecomments/' + data._id)
        });


    })
    app.get('/Editcomment/:id', isLoggedIn, function (req, res) {
        var commentID = req.params.id;
        var fileID = req.query.id;
        var message = "";
        var user = req.user;

        FileDescription.find({ _id: fileID }).exec(function (err, data) {
            if (err) return next(err);
            //console.log(data);
 
            res.render('comments', {user: user, message: message, data: data, commentID: commentID, fileID: fileID });     //on file pages i have to sent a link here with the file id
        });

    })

    app.post('/Editcomment/:id', isLoggedIn, [
        check('editcomment').trim().escape()
    ], function (req, res) {
        var fileiD = req.body.id;
        var commentID = req.params.id
        var comment = req.body.editcomment;
        FileDescription.update({ _id: fileiD, "Filecomments._id": commentID }, { $set: { "Filecomments.$.comment": comment } }, function (err, data) {
            //console.log(data);
        })
        FileDescription.find({ _id: fileiD }).exec(function (err, data) {
            if (err) return next(err);
            res.redirect('/Filecomments/' + data[Object.keys(data)]._id)
        });
    })
    app.get('/*', function(req, res) {
        res.send('404 page not found')
      });
};

//regular expression for search field 
function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

// route middleware to ensure user is logged in
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated())
        return next();
    res.redirect('/')
}
function isAdmin(req, res, next) {
    if (req.user.role === "admin")
        return next();
    res.redirect('/')
}
