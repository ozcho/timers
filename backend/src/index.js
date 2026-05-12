require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const passport = require('./auth');
const { setupSocket } = require('./socket');

const app = express();
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : false,
    credentials: true
  }
});

const sessionMiddleware = session({
  store: new SQLiteStore({
    dir: process.env.DB_PATH
      ? path.dirname(process.env.DB_PATH)
      : path.join(__dirname, '..', 'data'),
    db: 'sessions.db'
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  proxy: process.env.TRUST_PROXY === 'true',
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
});

app.use(express.json());

if (process.env.NODE_ENV === 'development') {
  const cors = require('cors');
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
}

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

app.set('io', io);

app.use('/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/boards', require('./routes/boards'));

// Serve frontend in production
const publicPath = path.join(__dirname, '..', 'public');
const fs = require('fs');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/auth') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(publicPath, 'index.html'));
    }
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

setupSocket(io, sessionMiddleware);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Timers running on port ${PORT}`);
});
