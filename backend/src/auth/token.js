import jwt from 'jsonwebtoken';

// Access tokens are short-lived; refresh tokens live longer.
const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET env var is not set');
  return s;
}

export function signAccessToken(userId, email) {
  return jwt.sign({ userId, email }, secret(), { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(userId) {
  return jwt.sign({ userId }, secret(), { expiresIn: REFRESH_TTL });
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}
