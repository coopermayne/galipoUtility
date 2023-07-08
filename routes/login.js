const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('login');
});

router.post('/', (req, res) => {
  const password = req.body.password;
  if (password === '3232') {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.redirect('/login');
  }
});

module.exports = router;
