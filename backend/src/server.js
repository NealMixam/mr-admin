import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, initialize } from './db.js';
import { HttpError } from './http.js';
import { users, userFields } from './users.js';
import { records } from './records.js';
import {
  cookieName, cookieOptions, emailRule, readSession, setSession, validateSecret, verifyPassword,
} from './security.js';

const app = express();
const api = express.Router();
const staticDir = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
app.use(helmet({ contentSecurityPolicy: { directives: {
  upgradeInsecureRequests: cookieOptions.secure ? [] : null,
} } }));
app.use('/api', api);
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // Browsers cannot send this header cross-origin without a successful preflight.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-mr-admin') !== '1') {
    throw new HttpError(403, 'Запрос отклонён');
  }
  next();
});
api.use(express.json({ limit: '32kb' }));

api.get('/health', async (_req, res) => {
  await db.query('SELECT 1');
  res.json({ status: 'ok' });
});

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  skipSuccessfulRequests: true, message: { error: 'Слишком много попыток. Попробуйте позже' },
});
const loginSchema = z.object({ email: emailRule, password: z.string().min(1).max(128) });

api.post('/auth/login', loginLimit, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { rows: [user] } = await db.query(
    `SELECT ${userFields}, password_hash, auth_version FROM users WHERE email = $1`, [email],
  );
  if (!(await verifyPassword(password, user?.password_hash))) throw new HttpError(401, 'Неверный email или пароль');
  setSession(res, user);
  const { password_hash, auth_version, ...profile } = user;
  res.json(profile);
});

api.post('/auth/logout', (_req, res) => res.clearCookie(cookieName, cookieOptions).sendStatus(204));

api.use(async (req, _res, next) => {
  const session = readSession(req);
  if (!session) throw new HttpError(401, 'Войдите в систему');
  const { rows } = await db.query(
    `SELECT ${userFields} FROM users WHERE id = $1 AND auth_version = $2`,
    [session.sub, session.version],
  );
  if (!rows.length) throw new HttpError(401, 'Сессия завершена');
  req.user = rows[0];
  next();
});

function admin(req, _res, next) {
  if (req.user.role !== 'admin') throw new HttpError(403, 'Требуются права администратора');
  next();
}

api.get('/auth/me', (req, res) => res.json(req.user));
api.use('/users', admin, users);
api.use('/records', records);
api.get('/overview', async (req, res) => {
  const { rows } = await db.query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE status = 'active')::int AS active,
    count(*) FILTER (WHERE status = 'draft')::int AS draft FROM records`);
  const { rows: recent } = await db.query('SELECT id, title, status, updated_at FROM records ORDER BY updated_at DESC, id DESC LIMIT 5');
  const metrics = rows[0];
  if (req.user.role === 'admin') {
    const result = await db.query('SELECT count(*)::int AS total FROM users');
    metrics.users = result.rows[0].total;
  }
  res.json({ metrics, recent });
});
api.get('/settings', async (_req, res) => {
  const { rows } = await db.query('SELECT app_name, description, contact_email FROM settings WHERE id = 1');
  res.json(rows[0]);
});
api.put('/settings', admin, async (req, res) => {
  const { app_name, description, contact_email } = z.object({
    app_name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500),
    contact_email: z.union([emailRule, z.literal('')]),
  }).parse(req.body);
  const { rows } = await db.query(
    `UPDATE settings SET app_name = $1, description = $2, contact_email = $3
     WHERE id = 1 RETURNING app_name, description, contact_email`,
    [app_name, description, contact_email],
  );
  res.json(rows[0]);
});
api.use((_req, _res, next) => next(new HttpError(404, 'Маршрут не найден')));

if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: staticDir }));
}

app.use((error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Проверьте введённые данные',
      fields: Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message])),
    });
  }
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.code === '23505') return res.status(409).json({ error: 'Этот email уже используется' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный JSON' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Запрос слишком большой' });
  console.error(error);
  res.status(500).json({ error: 'Ошибка сервера' });
});

try {
  validateSecret();
  await initialize();
  const port = Number(process.env.PORT ?? 3000);
  const server = app.listen(port, () => console.log('MR Admin is listening on port', port));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => void db.end()));
  }
} catch (error) {
  console.error('Startup failed:', error instanceof ZodError
    ? 'Set a valid ADMIN_EMAIL and ADMIN_PASSWORD (12–128 characters) to create the first administrator.'
    : error.message);
  await db.end();
  process.exitCode = 1;
}
