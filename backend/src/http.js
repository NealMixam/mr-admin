import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const readId = (req) => z.coerce.number().int().min(1).max(2147483647).parse(req.params.id);

const listQuery = z.object({
  q: z.string().trim().max(160).default(''),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
});

export async function listRows(req, db, table, columns, matches) {
  const { q, page } = listQuery.parse(req.query);
  const size = 15;
  const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  const result = await db.query(
    `SELECT
      (SELECT count(*) FROM ${table} WHERE ${matches})::int AS total,
      COALESCE((
        SELECT json_agg(items ORDER BY id DESC) FROM (
          SELECT ${columns} FROM ${table} WHERE ${matches}
          ORDER BY id DESC LIMIT $2 OFFSET $3
        ) items
      ), '[]'::json) AS items`,
    [pattern, size, (page - 1) * size],
  );
  return { ...result.rows[0], page, size };
}
