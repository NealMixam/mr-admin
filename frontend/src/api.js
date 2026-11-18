export async function api(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch('/api' + path, {
    method,
    signal,
    credentials: 'same-origin',
    headers: { 'X-MR-Admin': '1', ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return;
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error ?? 'Ошибка запроса');
    error.status = response.status;
    error.fields = data.fields;
    if (error.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new Event('session-ended'));
    }
    throw error;
  }
  return data;
}
