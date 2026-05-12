const express = require('express');
const db = require('../db');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const router = express.Router();

// List all users (admin only)
router.get('/', isAuthenticated, isAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, email, name, avatar, is_admin, approved, created_at FROM users'
  ).all();
  res.json(users);
});

// Approve user
router.patch('/:id/approve', isAuthenticated, isAdmin, (req, res) => {
  const { id } = req.params;
  const { approved } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  db.prepare('UPDATE users SET approved = ? WHERE id = ?').run(approved ? 1 : 0, id);
  res.json({ ok: true });
});

// Update admin role
router.patch('/:id', isAuthenticated, isAdmin, (req, res) => {
  const { id } = req.params;
  const { is_admin } = req.body;
  if (id === req.user.id) return res.status(400).json({ error: 'No puedes modificar tu propio rol' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(is_admin ? 1 : 0, id);
  res.json({ ok: true });
});

// Delete user
router.delete('/:id', isAuthenticated, isAdmin, (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
