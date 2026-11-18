import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from './db.js';
import { emailRule, passwordRule, hashPassword, setSession } from './security.js';
import { HttpError, readId, listRows } from './http.js';

export const userFields = 'id, name, email, role, created_at';
const userSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailRule,
  role: z.enum(['admin', 'editor']),
  password: passwordRule,
});
const updateSchema = userSchema.extend({ password: passwordRule.optional() });
export const users = Router();

users.get('/', async (req, res) => {
  res.json(await listRows(req, db, 'users', userFields, '(name ILIKE $1 OR email ILIKE $1)'));
});

users.get('/:id', async (req, res) => {
  const { rows } = await db.query(`SELECT ${userFields} FROM users WHERE id = $1`, [readId(req)]);
  if (!rows.length) throw new HttpError(404, 'Пользователь не найден');
  res.json(rows[0]);
});

users.post('/', async (req, res) => {
  const { name, email, role, password } = userSchema.parse(req.body);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING ${userFields}`,
    [name, email, role, await hashPassword(password)],
  );
  res.status(201).json(rows[0]);
});

async function lockUser(client, id) {
  await client.query('SELECT pg_advisory_xact_lock(70010)');
  const { rows } = await client.query('SELECT role FROM users WHERE id = $1', [id]);
  if (!rows.length) throw new HttpError(404, 'Пользователь не найден');
  return rows[0];
}

async function protectLastAdmin(client, user) {
  if (user.role !== 'admin') return;
  const result = await client.query("SELECT count(*)::int AS count FROM users WHERE role = 'admin'");
  if (result.rows[0].count === 1) throw new HttpError(409, 'Должен остаться хотя бы один администратор');
}

users.put('/:id', async (req, res) => {
  const id = readId(req);
  const { name, email, role, password } = updateSchema.parse(req.body);
  const hash = password ? await hashPassword(password) : null;
  const user = await transaction(async (client) => {
    const previous = await lockUser(client, id);
    if (role !== 'admin') await protectLastAdmin(client, previous);
    const { rows } = await client.query(
      `UPDATE users SET name = $2, email = $3, role = $4,
        password_hash = COALESCE($5, password_hash),
        auth_version = auth_version + CASE WHEN $5 IS NULL THEN 0 ELSE 1 END
        WHERE id = $1 RETURNING ${userFields}, auth_version`,
      [id, name, email, role, hash],
    );
    return rows[0];
  });
  if (hash && id === req.user.id) setSession(res, user);
  const { auth_version, ...profile } = user;
  res.json(profile);
});

users.delete('/:id', async (req, res) => {
  const id = readId(req);
  if (id === req.user.id) throw new HttpError(409, 'Нельзя удалить свою учётную запись');
  await transaction(async (client) => {
    const user = await lockUser(client, id);
    await protectLastAdmin(client, user);
    await client.query('DELETE FROM users WHERE id = $1', [id]);
  });
  res.sendStatus(204);
});
