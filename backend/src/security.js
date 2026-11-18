import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const emailRule = z.string().trim().max(254).email('Введите корректный email').toLowerCase();
export const passwordRule = z.string().min(12, 'Минимум 12 символов').max(128);
export const cookieName = 'mr_admin_session';
const lifetime = 60 * 60 * 8;
const issuer = 'mr-admin';

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.COOKIE_SECURE !== 'false',
  path: '/api',
};

export function validateSecret() {
  if (Buffer.byteLength(process.env.JWT_SECRET ?? '') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes');
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, options);
  return salt + ':' + key.toString('hex');
}

export async function verifyPassword(password, hash) {
  const [salt, key] = (hash ?? '00000000000000000000000000000000:' + '0'.repeat(128)).split(':');
  const actual = await derive(password, salt, 64, options);
  return timingSafeEqual(actual, Buffer.from(key, 'hex')) && Boolean(hash);
}

export function setSession(res, user) {
  const token = jwt.sign({ version: user.auth_version }, process.env.JWT_SECRET, {
    algorithm: 'HS256', issuer, subject: String(user.id), expiresIn: lifetime,
  });
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: lifetime * 1000 });
}

export function readSession(req) {
  const cookies = (req.headers.cookie ?? '').split(';').map((item) => item.trim());
  const token = cookies.find((item) => item.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer });
  } catch {
    return null;
  }
}
