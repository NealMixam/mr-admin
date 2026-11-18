import { Router } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import { HttpError, readId, listRows } from './http.js';

const fields = 'id, title, description, status, created_at, updated_at';
const schema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).default(''),
  status: z.enum(['draft', 'active', 'archived']),
});
export const records = Router();

records.get('/', async (req, res) => {
  res.json(await listRows(req, db, 'records', fields, '(title ILIKE $1 OR description ILIKE $1)'));
});

records.get('/:id', async (req, res) => {
  const { rows } = await db.query(`SELECT ${fields} FROM records WHERE id = $1`, [readId(req)]);
  if (!rows.length) throw new HttpError(404, 'Запись не найдена');
  res.json(rows[0]);
});

records.post('/', async (req, res) => {
  const { title, description, status } = schema.parse(req.body);
  const { rows } = await db.query(
    `INSERT INTO records (title, description, status) VALUES ($1, $2, $3) RETURNING ${fields}`,
    [title, description, status],
  );
  res.status(201).json(rows[0]);
});

records.put('/:id', async (req, res) => {
  const { title, description, status } = schema.parse(req.body);
  const { rows } = await db.query(
    `UPDATE records SET title = $2, description = $3, status = $4, updated_at = now()
     WHERE id = $1 RETURNING ${fields}`,
    [readId(req), title, description, status],
  );
  if (!rows.length) throw new HttpError(404, 'Запись не найдена');
  res.json(rows[0]);
});

records.delete('/:id', async (req, res) => {
  const result = await db.query('DELETE FROM records WHERE id = $1', [readId(req)]);
  if (!result.rowCount) throw new HttpError(404, 'Запись не найдена');
  res.sendStatus(204);
});
