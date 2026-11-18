import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { api } from './api';
import { Badge, date, Empty, Feedback, Field, initials, Modal, roles, statuses } from './ui';

const config = {
  records: {
    icon: FileText, title: 'Записи', subtitle: 'Создавайте записи, обновляйте их и управляйте статусами.',
    create: 'Новая запись', edit: 'Редактировать запись', empty: 'Записей пока нет',
    label: 'Название', name: 'title', state: 'status', defaults: { title: '', description: '', status: 'draft' },
    fields: [
      { key: 'title', label: 'Название', required: true, maxLength: 160 },
      { key: 'description', label: 'Описание', type: 'textarea', maxLength: 5000 },
      { key: 'status', label: 'Статус', options: statuses },
    ],
  },
  users: {
    icon: Users, title: 'Пользователи', subtitle: 'Управляйте учётными записями и правами доступа.',
    create: 'Новый пользователь', edit: 'Редактировать пользователя', empty: 'Пользователей пока нет',
    label: 'Пользователь', name: 'name', state: 'role', defaults: { name: '', email: '', role: 'editor', password: '' },
    fields: [
      { key: 'name', label: 'Имя', required: true, maxLength: 100 },
      { key: 'email', label: 'Email', type: 'email', required: true, maxLength: 254 },
      { key: 'role', label: 'Роль', options: roles },
      { key: 'password', label: 'Пароль', type: 'password', required: true, minLength: 12, maxLength: 128 },
    ],
  },
};

function ItemDialog({ section, action, item, onClose, onSaved }) {
  const meta = config[section];
  const [values, setValues] = useState(() => ({ ...meta.defaults, ...item }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const removing = action === 'delete';

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = Object.fromEntries(meta.fields.map(({ key }) => [key, values[key]]));
    if (action === 'edit' && !body.password) delete body.password;
    try {
      const saved = await api('/' + section + (item ? '/' + item.id : ''), {
        method: removing ? 'DELETE' : item ? 'PUT' : 'POST',
        body: removing ? undefined : body,
      });
      onSaved(saved, action);
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return <Modal busy={busy} onClose={onClose} title={removing ? 'Подтвердите удаление' : meta[action]}>
    <form onSubmit={submit} className="modal-body">
      {removing ? <p>Удалить «{item[meta.name]}»? Действие нельзя отменить.</p>
        : meta.fields.map((field) => <Field key={field.key}
          field={item && field.key === 'password' ? { ...field, label: 'Новый пароль (необязательно)', required: false } : field}
          values={values} setValues={setValues} errors={error?.fields} disabled={busy} />)}
      <Feedback error={error} />
      <footer className="form-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Отмена</button>
        <button className={'button ' + (removing ? 'danger' : 'primary')} disabled={busy}>
          {busy ? 'Подождите…' : removing ? 'Удалить' : 'Сохранить'}
        </button>
      </footer>
    </form>
  </Modal>;
}

export function Collection({ section, user, onProfile }) {
  const meta = config[section];
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const people = section === 'users';
  const Icon = meta.icon;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await api('/' + section + '?' + new URLSearchParams({ q: query, page }), { signal: controller.signal });
        const last = Math.max(1, Math.ceil(data.total / data.size));
        if (page > last) setPage(last);
        else setResult(data);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure);
      }
    }, query ? 200 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [section, query, page, revision]);

  function refresh() {
    setError(null);
    setResult(null);
    setRevision((value) => value + 1);
  }

  function onSaved(saved, action) {
    setDialog(null);
    setNotice({ create: 'Создано', edit: 'Изменения сохранены', delete: 'Удалено' }[action]);
    if (people && saved?.id === user.id) onProfile(saved);
    if (action === 'create') { setQuery(''); setPage(1); }
    refresh();
  }

  return <>
    <section className="page-heading">
      <div><h1>{meta.title}</h1><p>{meta.subtitle}</p></div>
      <button className="button primary" onClick={() => setDialog({ action: 'create' })}><Plus size={18} />{meta.create}</button>
    </section>
    <Feedback success={notice} />
    <section className="panel">
      <div className="toolbar">
        <div className="section-title"><Icon size={19} /><h2>{meta.title}</h2>{result && <span className="counter">{result.total}</span>}</div>
        <label className="search"><Search size={18} /><input aria-label="Поиск" placeholder="Поиск…" maxLength={160}
          value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); setResult(null); setError(null); }} /></label>
      </div>
      {error ? <div className="panel-body"><Feedback error={error} /><button className="button secondary" onClick={refresh}>Повторить</button></div>
        : !result ? <p className="loading" role="status">Загрузка…</p>
        : result.items.length === 0 ? <Empty icon={query.trim() ? Search : Icon} title={query.trim() ? 'Совпадений нет' : meta.empty}>
          <p>{query.trim() ? 'Попробуйте другой запрос.' : 'Создайте первый элемент, чтобы начать работу.'}</p>
          {!query.trim() && <button className="button secondary" onClick={() => setDialog({ action: 'create' })}><Plus size={16} />{meta.create}</button>}
        </Empty> : <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{meta.label}</th><th>{people ? 'Роль' : 'Статус'}</th><th>{people ? 'Дата создания' : 'Обновлено'}</th><th><span className="sr-only">Действия</span></th></tr></thead>
              <tbody>{result.items.map((item) => <tr key={item.id}>
                <td><div className="entity">
                  <span className="entity-icon">{people ? initials(item.name) : <FileText size={16} />}</span>
                  <div><strong>{item[meta.name]}</strong><small>{people ? item.email : item.description}</small></div>
                </div></td>
                <td><Badge value={item[meta.state]} /></td>
                <td className="muted">{date(item.updated_at ?? item.created_at)}</td>
                <td><div className="row-actions">
                  <button className="icon-button" aria-label={'Редактировать ' + item[meta.name]} onClick={() => setDialog({ action: 'edit', item })}><Pencil size={16} /></button>
                  {(!people || item.id !== user.id) && <button className="icon-button delete" aria-label={'Удалить ' + item[meta.name]} onClick={() => setDialog({ action: 'delete', item })}><Trash2 size={16} /></button>}
                </div></td>
              </tr>)}</tbody>
            </table>
          </div>
          <footer className="pagination">
            <span>{(result.page - 1) * result.size + 1}–{(result.page - 1) * result.size + result.items.length} из {result.total}</span>
            <div>
              <button className="icon-button" aria-label="Предыдущая страница" disabled={page <= 1} onClick={() => { setResult(null); setPage(page - 1); }}><ChevronLeft size={18} /></button>
              <button className="icon-button" aria-label="Следующая страница" disabled={page * result.size >= result.total} onClick={() => { setResult(null); setPage(page + 1); }}><ChevronRight size={18} /></button>
            </div>
          </footer>
        </>}
    </section>
    {dialog && <ItemDialog section={section} {...dialog} onClose={() => setDialog(null)} onSaved={onSaved} />}
  </>;
}
