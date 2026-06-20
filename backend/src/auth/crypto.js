import bcrypt from 'bcryptjs';

const DEFAULT_COST = 12;

export async function hashPassword(plaintext, cost = DEFAULT_COST) {
  return bcrypt.hash(plaintext, cost);
}

export async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}
