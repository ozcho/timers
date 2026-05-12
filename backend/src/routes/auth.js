const express = require('express');
const passport = require('passport');
const router = express.Router();

const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  && process.env.GOOGLE_CLIENT_ID !== 'your-google-client-id');

router.get('/google', (req, res, next) => {
  if (!googleConfigured) {
    return res.status(501).json({ error: 'Google OAuth no está configurado.' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

const devFrontend = process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : '';

router.get('/google/callback', (req, res, next) => {
  if (!googleConfigured) {
    return res.redirect(devFrontend + '/?error=auth_not_configured');
  }
  passport.authenticate('google', { failureRedirect: devFrontend + '/?error=auth_failed' })(req, res, () => {
    if (!req.user.approved) {
      return res.redirect(devFrontend + '/?pending=1');
    }
    res.redirect(devFrontend + '/');
  });
});

router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    const { id, email, name, avatar, is_admin, approved } = req.user;
    res.json({ id, email, name, avatar, is_admin: !!is_admin, approved: !!approved });
  } else {
    res.json(null);
  }
});

router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Error al cerrar sesión' });
    res.json({ ok: true });
  });
});

module.exports = router;
