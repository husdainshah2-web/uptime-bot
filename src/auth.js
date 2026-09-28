const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { queries } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';

function login(username, password) {
  const user = queries.getUserByUsername.get(username);
  if (!user) return null;

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return null;

  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { token, user: { id: user.id, username: user.username } };
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { login, authMiddleware };
