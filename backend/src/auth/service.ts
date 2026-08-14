import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { config } from '../config';
import { AppError } from '../utils/http';
import type { AuthUser } from '../types';

const SALT_ROUNDS = 12;

export async function registerUser(
  email: string,
  password: string,
): Promise<AuthUser> {
  const normalized = email.trim().toLowerCase();
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [
    normalized,
  ]);
  if (existing.rowCount) throw new AppError(409, 'An account with this email already exists');

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const { rows } = await pool.query<{ id: string; email: string }>(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [normalized, hash],
  );
  return { id: rows[0].id, email: rows[0].email };
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthUser> {
  const { rows } = await pool.query<{ id: string; email: string; password_hash: string }>(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email.trim().toLowerCase()],
  );
  const row = rows[0];
  if (!row) throw new AppError(401, 'Invalid email or password');
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) throw new AppError(401, 'Invalid email or password');
  return { id: row.id, email: row.email };
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): AuthUser {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      sub: string;
      email: string;
    };
    return { id: decoded.sub, email: decoded.email };
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }
}
