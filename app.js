var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var urlencode = require('urlencode');
var json = require('json-middleware');
var logger = require('morgan');

var passport = require('passport');

var session = require('express-session');
var uuid = require('uuid/v4');

var indexRouter = require('./routes/index');
//var usersRouter = require('./routes/users');
var googleRouter = require('./routes/googlemaps').router;

var app = express();

if (process.env.NODE_ENV == 'production') {
    //todo
} else {
    session = session({
        genid: (req) => {
            console.log('Inside the session middleware')
            console.log(req.sessionID)
            return uuid() // use UUIDs for session IDs
        },
        secret: process.env.SESSIONSECRET,
        resave: false, //no resaving of the session id again and again
        saveUninitialized: true //to do with cookies: it will still save a cookie even if no data to store; false for production (efficiency)
            //store: xxxxx // not assigned: I will be using the one in memory for this project
    });
}

// VIEW ENGINES AND PARSERS SETUPS
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//--- below required???
//https://stackoverflow.com/a/24176322 and see note about adding .middleware() (!!!)
//app.use(json.middleware());
//app.use(urlencode);

app.use(session);
app.use(passport.initialize())


// ROUTERS
app.use('/', indexRouter);
//app.use('/users', usersRouter);
app.use('/googlemaps/', googleRouter); //here I define the route as parameter...

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;