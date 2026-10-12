'use client';

// کارت‌های دسترسی سریع به بخش‌های مختلف پنل ادمین (هر بخش یک کارت جدا)
const SECTIONS = [
  {
    title: 'ارزیابی داوران',
    items: [
      { href: '/admin/presentation-results', label: 'نتایج ارزیابی سخنرانی توسط داوران', hint: 'نمرات هر داور، میانگین و رتبه‌بندی سخنرانی‌ها', tone: 'navy' },
    ],
  },
  {
    title: 'نظرسنجی حاضرین در جلسات',
    items: [
      { href: '/admin/survey', label: 'ساختار کنگره و QR', hint: 'ثبت پنل و سخنران، ساخت و دانلود QR، زمان‌بندی', tone: 'gold' },
      { href: '/admin/survey/results', label: 'نتایج نظرسنجی و رتبه‌بندی پنل‌ها', hint: 'رقابت پنل‌ها، گزارش PDF و Excel', tone: 'gold' },
    ],
  },
];

const css = `
.hub{margin:6px 0 22px;display:grid;gap:14px}
.hub-sec{background:#fff;border:1px solid #dde3ee;border-radius:14px;padding:14px 14px 12px;box-shadow:0 1px 2px rgba(20,30,50,.05)}
.hub-sec h3{margin:0 0 10px;font-size:13px;color:#5b6472;font-weight:700}
.hub-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
.hub-card{display:block;text-decoration:none;color:inherit;border-radius:12px;padding:12px 14px;border:1px solid #e4e8f0;
  border-inline-start:5px solid var(--c);background:#fbfcfe;transition:transform .12s, box-shadow .12s}
.hub-card:hover{transform:translateY(-1px);box-shadow:0 3px 10px rgba(20,30,50,.12)}
.hub-card b{display:block;font-size:14px;color:#1f3864;line-height:1.7}
.hub-card span{display:block;font-size:12px;color:#6b7280;line-height:1.7;margin-top:2px}
.hub-card.navy{--c:#1f3864}
.hub-card.gold{--c:#C8922B}
.hub-title{font-size:13px;font-weight:700;color:#5b6472;margin:0 0 6px}
`;

export default function AdminHub() {
  return (
    <div className="hub" dir="rtl">
      <style>{css}</style>
      {SECTIONS.map(sec => (
        <section className="hub-sec" key={sec.title}>
          <h3>{sec.title}</h3>
          <div className="hub-grid">
            {sec.items.map(it => (
              <a className={'hub-card ' + it.tone} href={it.href} key={it.href}>
                <b>{it.label}</b>
                <span>{it.hint}</span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
