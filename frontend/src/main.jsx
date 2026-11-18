import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, CircleCheck, FileText, LayoutDashboard, LogOut, Settings, Users, Workflow } from 'lucide-react';
import { api } from './api';
import { Collection } from './collections';
import { Badge, Brand, date, Empty, Feedback, Field, initials, roles } from './ui';
import './styles.css';

const links = [
  { id: 'overview', label: 'Обзор', Icon: LayoutDashboard },
  { id: 'records', label: 'Записи', Icon: FileText },
  { id: 'users', label: 'Пользователи', Icon: Users, admin: true },
  { id: 'settings', label: 'Настройки', Icon: Settings },
];

function useResource(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(path, { signal: controller.signal }).then(setData).catch((failure) => {
      if (!controller.signal.aborted) setError(failure);
    });
    return () => controller.abort();
  }, [path, attempt]);
  return { data, error, retry: () => { setError(null); setAttempt((value) => value + 1); } };
}

function LoadState({ error, retry }) {
  if (!error) return <p className="loading" role="status">Загрузка…</p>;
  return <div className="panel-body"><Feedback error={error} /><button className="button secondary" onClick={retry}>Повторить</button></div>;
}

function Login({ onLogin }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setError(null);
    setBusy(true);
    try {
      onLogin(await api('/auth/login', { method: 'POST', body }));
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return <main className="login">
    <aside className="login-side">
      <Brand />
      <div className="login-intro"><div className="login-art"><Workflow size={82} strokeWidth={1} /></div><h2>Панель управления</h2><p>Записи, пользователи и настройки в одном рабочем пространстве.</p></div>
    </aside>
    <div className="login-content">
      <form className="login-form" onSubmit={submit}>
        <div className="mobile-brand"><Brand /></div>
        <h1>Вход в систему</h1>
        <p className="muted">Войдите под своей учётной записью.</p>
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" name="email" autoComplete="username" maxLength={254} required placeholder="name@example.com" /></div>
        <div className="field"><label htmlFor="password">Пароль</label><input id="password" type="password" name="password" autoComplete="current-password" maxLength={128} required /></div>
        <Feedback error={error} />
        <button className="button primary" disabled={busy}>{busy ? 'Вход…' : 'Войти'}<ArrowRight size={17} /></button>
      </form>
    </div>
  </main>;
}

const metrics = [
  { key: 'total', label: 'Всего записей', Icon: FileText, color: 'blue' },
  { key: 'active', label: 'Активные записи', Icon: CircleCheck, color: 'green' },
  { key: 'draft', label: 'Черновики', Icon: FileText, color: 'amber' },
  { key: 'users', label: 'Пользователи', Icon: Users, color: 'purple' },
];

function Overview() {
  const { data, error, retry } = useResource('/overview');
  return <>
    <section className="page-heading"><div><h1>Обзор</h1><p>Сводка по рабочему пространству и последние изменения.</p></div><a href="#records" className="button primary">К записям<ArrowRight size={17} /></a></section>
    {!data ? <div className="panel"><LoadState error={error} retry={retry} /></div> : <>
      <div className="metrics">{metrics.filter(({ key }) => key in data.metrics).map(({ key, label, Icon, color }) =>
        <article className="panel metric" key={key}><span className={'metric-icon ' + color}><Icon size={20} /></span><div><p>{label}</p><strong>{data.metrics[key].toLocaleString('ru')}</strong></div></article>
      )}</div>
      <section className="panel">
        <div className="toolbar"><div className="section-title"><FileText size={19} /><h2>Последние записи</h2></div><a className="text-link" href="#records">Все записи <ArrowRight size={16} /></a></div>
        {data.recent.length ? <div className="table-wrap"><table>
          <thead><tr><th>Название</th><th>Статус</th><th>Обновлено</th></tr></thead>
          <tbody>{data.recent.map((item) => <tr key={item.id}><td><strong>{item.title}</strong></td><td><Badge value={item.status} /></td><td className="muted">{date(item.updated_at)}</td></tr>)}</tbody>
        </table></div> : <Empty icon={FileText} title="Записей пока нет"><p>Новые и обновлённые записи появятся здесь.</p><a className="button secondary" href="#records">Перейти к записям</a></Empty>}
      </section>
    </>}
  </>;
}

const settingsFields = [
  { key: 'app_name', label: 'Название приложения', required: true, maxLength: 80 },
  { key: 'description', label: 'Описание', type: 'textarea', maxLength: 500 },
  { key: 'contact_email', label: 'Контактный email', type: 'email', maxLength: 254 },
];

function SettingsForm({ initial, editable, onSave }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api('/settings', { method: 'PUT', body: values });
      setValues(updated);
      onSave(updated);
      setSaved(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return <form className="settings-form" onSubmit={submit}>
    {settingsFields.map((field) => <Field key={field.key} field={field} values={values}
      setValues={(next) => { setValues(next); setSaved(false); }} errors={error?.fields} disabled={!editable || busy} />)}
    <Feedback error={error} success={saved && 'Настройки сохранены'} />
    {editable && <button className="button primary" disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить настройки'}</button>}
  </form>;
}

function Preferences({ user, onSave }) {
  const { data, error, retry } = useResource('/settings');
  return <>
    <section className="page-heading"><div><h1>Настройки</h1><p>Основная информация о рабочем пространстве.</p></div></section>
    <section className="panel settings-panel">
      <div className="toolbar"><div className="section-title"><Settings size={19} /><h2>Общие настройки</h2></div></div>
      {data ? <SettingsForm initial={data} editable={user.role === 'admin'} onSave={onSave} /> : <LoadState error={error} retry={retry} />}
    </section>
  </>;
}

function Workspace({ user, setUser }) {
  const [route, setRoute] = useState(() => location.hash.slice(1));
  const [name, setName] = useState('MR Admin');
  const [logoutError, setLogoutError] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const navigation = links.filter((link) => !link.admin || user.role === 'admin');
  const current = navigation.find((link) => link.id === route) ?? navigation[0];

  useEffect(() => {
    function sync() { setRoute(location.hash.slice(1)); }
    window.addEventListener('hashchange', sync);
    const controller = new AbortController();
    api('/settings', { signal: controller.signal }).then((data) => setName(data.app_name)).catch(() => {});
    return () => { controller.abort(); window.removeEventListener('hashchange', sync); };
  }, []);
  useEffect(() => { document.title = current.label + ' · ' + name; }, [current.label, name]);

  async function logout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (failure) {
      setLogoutError(failure);
      setLoggingOut(false);
    }
  }

  return <div className="layout">
    <aside className="sidebar">
      <Brand name={name} />
      <nav aria-label="Разделы">
        {navigation.map(({ id, label, Icon }) => <a href={'#' + id} key={id} aria-current={current.id === id ? 'page' : undefined}><Icon size={19} /><span>{label}</span></a>)}
      </nav>
      <div className="account">
        <span className="avatar">{initials(user.name)}</span>
        <div><strong>{user.name}</strong><small>{roles[user.role]}</small></div>
        <button className="icon-button" aria-label="Выйти" title="Выйти" onClick={logout} disabled={loggingOut}><LogOut size={18} /></button>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span>{name}</span><span className="topbar-divider">/</span><strong>{current.label}</strong></header>
      <main className="content">
        <Feedback error={logoutError} />
        {current.id === 'overview' ? <Overview /> : current.id === 'settings'
          ? <Preferences user={user} onSave={(data) => setName(data.app_name)} />
          : <Collection key={current.id} section={current.id} user={user} onProfile={setUser} />}
      </main>
    </div>
  </div>;
}

function App() {
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ended = () => setUser(null);
    window.addEventListener('session-ended', ended);
    const controller = new AbortController();
    api('/auth/me', { signal: controller.signal }).then(setUser).catch((failure) => {
      if (!controller.signal.aborted && failure.status !== 401) setError(failure);
    });
    return () => { controller.abort(); window.removeEventListener('session-ended', ended); };
  }, [attempt]);
  useEffect(() => { if (!user) document.title = 'MR Admin'; }, [user]);
  if (user === undefined) return <main className="center"><div className="panel"><LoadState error={error} retry={() => { setError(null); setAttempt((value) => value + 1); }} /></div></main>;
  return user ? <Workspace user={user} setUser={setUser} /> : <Login onLogin={setUser} />;
}

createRoot(document.getElementById('root')).render(<App />);
