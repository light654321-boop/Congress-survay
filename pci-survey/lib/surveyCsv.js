// ساخت و دانلود CSV سازگار با اکسل (UTF-8 با BOM تا فارسی درست نمایش داده شود)
function cell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  // جلوگیری از اجرای فرمول در اکسل (نظرات را رأی‌دهندگان می‌نویسند)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function downloadCsv(filename, rows) {
  const text = '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
