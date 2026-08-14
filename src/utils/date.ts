export function formatDateDDMMYYYY(value?: string | number | Date | null) {
  if (!value) return '';
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) return raw;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

export function formatDateTimeDDMMYYYY(value?: string | number | Date | null) {
  const dateText = formatDateDDMMYYYY(value);
  if (!dateText) return '';
  const date = value instanceof Date ? value : new Date(value || '');
  if (Number.isNaN(date.getTime())) return dateText;
  return `${dateText} ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

export function parseDDMMYYYYToISO(value: string) {
  const match = String(value || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function isValidDDMMYYYY(value: string) {
  const iso = parseDDMMYYYYToISO(value);
  if (!iso) return false;
  const date = new Date(`${iso}T00:00:00`);
  return !Number.isNaN(date.getTime()) && iso === `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
