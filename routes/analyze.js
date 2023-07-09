const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('analyze', {
    title: 'Analyze PDFs', 
    customRoute: 'analyze'
  });
});

module.exports = router;