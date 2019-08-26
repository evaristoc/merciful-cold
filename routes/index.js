var express = require('express');
var router = express.Router();


/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: 'Sketch for Simple Cooperative Platform' });
});

module.exports = router;