const express = require('express');
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const router = express.Router();

function isOwnerOrAdmin(board, user) {
  return user && (user.is_admin || board.owner_id === user.id);
}

function hashControlPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyControlPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const attempt = crypto.scryptSync(password, salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

// Strip the password hash and add has_control_password flag
function sanitizeBoard(board) {
  const { control_password, ...rest } = board;
  return { ...rest, has_control_password: !!control_password };
}

// Get board by access token (public - guests can view)
router.get('/by-token/:token', (req, res) => {
  const board = db.prepare('SELECT * FROM boards WHERE access_token = ?').get(req.params.token);
  if (!board) return res.status(404).json({ error: 'Board no encontrado' });
  const timers = db.prepare('SELECT * FROM timers WHERE board_id = ? ORDER BY order_index ASC').all(board.id);
  res.json({ ...sanitizeBoard(board), timers });
});

// List all boards publicly (no auth required, read-only info)
router.get('/public', (req, res) => {
  const boards = db.prepare(`
    SELECT b.id, b.name, b.access_token, b.running, b.current_index, u.name as owner_name
    FROM boards b JOIN users u ON b.owner_id = u.id
    ORDER BY b.running DESC, b.created_at DESC
  `).all();
  const result = boards.map(b => ({
    ...b,
    timers: db.prepare('SELECT id, label, duration_seconds, order_index FROM timers WHERE board_id = ? ORDER BY order_index ASC').all(b.id)
  }));
  res.json(result);
});

// List boards for authenticated user
router.get('/', isAuthenticated, (req, res) => {
  const user = req.user;
  const boards = db.prepare(`
      SELECT b.*, u.name as owner_name
      FROM boards b JOIN users u ON b.owner_id = u.id
      ORDER BY b.created_at DESC
    `).all();

  const result = boards.map(b => ({
    ...sanitizeBoard(b),
    timers: db.prepare('SELECT * FROM timers WHERE board_id = ? ORDER BY order_index ASC').all(b.id)
  }));
  res.json(result);
});

// Verify board control password (no auth required)
router.post('/:id/verify-password', (req, res) => {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board no encontrado' });
  if (!board.control_password) return res.status(400).json({ error: 'Este board no tiene contraseña de control' });

  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Contraseña requerida' });

  if (!verifyControlPassword(password, board.control_password)) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  // Grant control for this board in the session
  if (!req.session.controlledBoards) req.session.controlledBoards = [];
  if (!req.session.controlledBoards.includes(board.id)) {
    req.session.controlledBoards.push(board.id);
  }
  res.json({ ok: true });
});

// Get single board by id (auth required, owner or admin)
router.get('/:id', isAuthenticated, (req, res) => {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board no encontrado' });
  if (!isOwnerOrAdmin(board, req.user)) return res.status(403).json({ error: 'No autorizado' });
  const timers = db.prepare('SELECT * FROM timers WHERE board_id = ? ORDER BY order_index ASC').all(board.id);
  res.json({ ...sanitizeBoard(board), timers });
});

// Create board
router.post('/', isAuthenticated, (req, res) => {
  const { name, timers, control_password } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const id = uuidv4();
  const access_token = uuidv4();
  db.prepare(`
    INSERT INTO boards (id, name, owner_id, access_token)
    VALUES (?, ?, ?, ?)
  `).run(id, name.trim(), req.user.id, access_token);

  if (typeof control_password === 'string' && control_password.trim()) {
    db.prepare('UPDATE boards SET control_password = ? WHERE id = ?')
      .run(hashControlPassword(control_password.trim()), id);
  }

  if (Array.isArray(timers) && timers.length > 0) {
    const insertTimer = db.prepare(
      'INSERT INTO timers (id, board_id, label, duration_seconds, order_index) VALUES (?, ?, ?, ?, ?)'
    );
    timers.forEach((t, i) => {
      insertTimer.run(uuidv4(), id, t.label || '', Math.max(1, parseInt(t.duration_seconds) || 60), i);
    });
  }

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
  const savedTimers = db.prepare('SELECT * FROM timers WHERE board_id = ? ORDER BY order_index ASC').all(id);
  res.status(201).json({ ...sanitizeBoard(board), timers: savedTimers });
});

// Update board (name and timers list)
router.put('/:id', isAuthenticated, (req, res) => {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board no encontrado' });
  if (!isOwnerOrAdmin(board, req.user)) return res.status(403).json({ error: 'No autorizado' });

  const { name, timers, control_password } = req.body;
  if (name?.trim()) {
    db.prepare('UPDATE boards SET name = ? WHERE id = ?').run(name.trim(), board.id);
  }

  // control_password: string value = set/update, empty string = remove, undefined = leave unchanged
  if (typeof control_password === 'string') {
    const hashed = control_password.trim() ? hashControlPassword(control_password.trim()) : null;
    db.prepare('UPDATE boards SET control_password = ? WHERE id = ?').run(hashed, board.id);
  }

  if (Array.isArray(timers)) {
    db.prepare('DELETE FROM timers WHERE board_id = ?').run(board.id);
    const insertTimer = db.prepare(
      'INSERT INTO timers (id, board_id, label, duration_seconds, order_index) VALUES (?, ?, ?, ?, ?)'
    );
    timers.forEach((t, i) => {
      insertTimer.run(uuidv4(), board.id, t.label || '', Math.max(1, parseInt(t.duration_seconds) || 60), i);
    });

    // Reset board state when timers change
    db.prepare(`
      UPDATE boards SET running=0, current_index=0, started_at=NULL, paused=0, paused_remaining=0
      WHERE id = ?
    `).run(board.id);
  }

  const updated = db.prepare('SELECT * FROM boards WHERE id = ?').get(board.id);
  const updatedTimers = db.prepare('SELECT * FROM timers WHERE board_id = ? ORDER BY order_index ASC').all(board.id);

  const io = req.app.get('io');
  io.to(board.id).emit('board-updated', { ...sanitizeBoard(updated), timers: updatedTimers });

  res.json({ ...sanitizeBoard(updated), timers: updatedTimers });
});

// Delete board
router.delete('/:id', isAuthenticated, (req, res) => {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!board) return res.status(404).json({ error: 'Board no encontrado' });
  if (!isOwnerOrAdmin(board, req.user)) return res.status(403).json({ error: 'No autorizado' });
  db.prepare('DELETE FROM boards WHERE id = ?').run(board.id);
  const io = req.app.get('io');
  io.to(board.id).emit('board-deleted');
  res.json({ ok: true });
});

module.exports = router;
