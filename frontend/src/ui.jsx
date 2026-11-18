import { useEffect, useRef } from 'react';
import { AlertCircle, Box, X } from 'lucide-react';

export const statuses = { draft: 'Черновик', active: 'Активна', archived: 'В архиве' };
export const roles = { admin: 'Администратор', editor: 'Редактор' };
const dateFormat = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });
export const date = (value) => dateFormat.format(new Date(value));
export const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((word) => [...word][0]).join('').toUpperCase();

export function Brand({ name = 'MR Admin' }) {
  return <div className="brand"><span className="mark"><Box size={22} /></span><strong>{name}</strong></div>;
}

export function Badge({ value }) {
  return <span className={'badge ' + value}><i />{statuses[value] ?? roles[value]}</span>;
}

export function Feedback({ error, success }) {
  if (error) return <p className="feedback error" role="alert"><AlertCircle size={17} />{error.message ?? error}</p>;
  if (success) return <p className="feedback success" role="status">{success}</p>;
  return null;
}

export function Empty({ icon: Icon = Box, title, children }) {
  return <div className="empty"><span className="empty-icon"><Icon size={24} /></span><strong>{title}</strong>{children}</div>;
}

export function Modal({ title, onClose, busy, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} aria-labelledby="modal-title" onCancel={(event) => {
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <header className="modal-header">
      <h2 id="modal-title">{title}</h2>
      <button type="button" className="icon-button" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={20} /></button>
    </header>
    {children}
  </dialog>;
}

export function Field({ field, values, setValues, errors, disabled }) {
  const { key, label, required, type, options, maxLength, minLength } = field;
  const props = {
    id: 'field-' + key,
    value: values[key] ?? '',
    onChange: (event) => setValues({ ...values, [key]: event.target.value }),
    required, disabled, maxLength, minLength,
    'aria-invalid': Boolean(errors?.[key]),
    'aria-describedby': errors?.[key] ? 'error-' + key : undefined,
  };
  return <div className="field">
    <label htmlFor={props.id}>{label}</label>
    {options ? <select {...props}>{Object.entries(options).map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select>
      : type === 'textarea' ? <textarea {...props} rows={4} />
      : <input {...props} type={type ?? 'text'} autoComplete={type === 'password' ? 'new-password' : undefined} />}
    {errors?.[key] && <span className="field-error" id={'error-' + key}>{errors[key]}</span>}
  </div>;
}
