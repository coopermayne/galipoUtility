const http = require('http');
const express = require('express');
const path = require('path');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

// Session
app.use(session({
  secret: 'mySecret',
  resave: false,
  saveUninitialized: false,
}));

// Body parser
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');

// Socket IO
app.set('socketio', io);

// Check auth middleware
app.use((req, res, next) => {
  next();

  
  // if (req.path === '/login' || req.session.authenticated) {
  //   next();
  // } else {
  //   res.redirect('/login');
  // }
});

// Routes
app.use(express.urlencoded({ extended: true }));
app.use('/', require('./routes/index'));
app.use('/login', require('./routes/login'));
app.use('/transcribe', require('./routes/transcribe')(io));
app.use('/analyze', require('./routes/analyze'));
app.use('/learn', require('./routes/learn'));

// Start server
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server started on port ${port}`))