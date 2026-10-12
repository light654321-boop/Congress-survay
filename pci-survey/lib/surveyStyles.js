// استایل مشترک صفحات ادمین نظرسنجی (بدون وابستگی به فایل خارجی)
export const adminCss = `
.ad{--navy:#0E2A3B;--gold:#C8922B;--paper:#F7F4EE;--ink:#182226;--muted:#66767D;--line:#DDD6C7;--ok:#2E6E52;--bad:#B3402C;
  min-height:100vh;background:var(--paper);color:var(--ink);font-family:inherit;direction:rtl}
.ad *{box-sizing:border-box}
.ad-top{background:var(--navy);color:#fff;padding:20px 22px;border-bottom:3px solid var(--gold)}
.ad-top h1{margin:0;font-size:19px;line-height:1.6}
.ad-top p{margin:4px 0 0;font-size:13px;color:#C7D4DA}
.ad-nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.ad-nav a{color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:4px;padding:6px 12px;font-size:13px;text-decoration:none}
.ad-nav a.on{background:var(--gold);border-color:var(--gold);color:#0E2A3B;font-weight:700}
.ad-wrap{max-width:1100px;margin:0 auto;padding:22px 16px 80px}
.ad-panel{background:#fff;border:1px solid var(--line);border-radius:4px;padding:18px;margin-bottom:18px}
.ad-panel h2{font-size:16px;margin:0 0 12px}
.ad-note{font-size:12.5px;color:var(--muted);line-height:1.9;margin:6px 0}
.ad textarea,.ad input[type=text]{width:100%;border:1px solid var(--line);border-radius:4px;padding:10px;font-family:inherit;font-size:14px;background:#fbfaf7}
.ad textarea{min-height:130px;resize:vertical;direction:rtl}
.ad-btn{background:var(--navy);color:#fff;border:none;border-radius:4px;padding:10px 16px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer}
.ad-btn:disabled{opacity:.5;cursor:default}
.ad-btn.alt{background:#fff;color:var(--navy);border:1px solid var(--navy)}
.ad-btn.sm{padding:6px 10px;font-size:12px;font-weight:600}
.ad-btn.danger{background:#fff;color:var(--bad);border:1px solid var(--bad)}
.ad-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.ad-msg{margin-top:10px;font-size:13px;padding:10px 12px;border-radius:4px}
.ad-msg.ok{background:#E6F2EC;color:#1d5a40}
.ad-msg.err{background:#FBEAE6;color:#8A2E1D}
.ad-scroll{overflow-x:auto}
.ad table{border-collapse:collapse;width:100%;font-size:13px}
.ad th,.ad td{border-bottom:1px solid var(--line);padding:8px 8px;text-align:right;vertical-align:top}
.ad th{background:#F2EEE4;font-weight:700;white-space:nowrap}
.ad td.num,.ad th.num{text-align:center;white-space:nowrap}
.ad-badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;background:#EEE;color:#444}
.ad-badge.open{background:#E6F2EC;color:#1d5a40}
.ad-badge.closed{background:#FBEAE6;color:#8A2E1D}
.ad-medal{display:inline-flex;width:26px;height:26px;border-radius:50%;align-items:center;justify-content:center;font-weight:800;font-size:13px;background:#EEE}
.ad-medal.r1{background:#E8B85A;color:#3a2800}
.ad-medal.r2{background:#C9CED2}
.ad-medal.r3{background:#D9A877}
.ad-pgroup{border:1px solid var(--line);border-radius:4px;margin-bottom:14px;background:#fff}
.ad-pgroup>header{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;background:#F2EEE4;border-bottom:1px solid var(--line)}
.ad-pgroup>header h3{margin:0;font-size:15px}
.ad-srow{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--line)}
.ad-srow:last-child{border-bottom:none}
.ad-sinfo{flex:1;min-width:200px}
.ad-sinfo b{display:block;font-size:14px;line-height:1.7}
.ad-sinfo span{font-size:12px;color:var(--muted)}
.ad-qr{width:100%;padding:8px 0 4px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.ad-qr img{width:260px;height:auto;border:1px solid var(--line);background:#fff}
.ad-qr code{font-size:11px;direction:ltr;display:block;word-break:break-all;color:var(--muted)}
.ad-bar{height:8px;background:#E7E2D6;border-radius:4px;overflow:hidden;min-width:90px}
.ad-bar>i{display:block;height:100%;background:var(--navy)}
.ad-state{text-align:center;padding:80px 24px;color:var(--muted)}

/* گزارش قابل چاپ / ذخیره PDF */
.rp{max-width:800px;margin:0 auto;padding:18px 16px 60px;background:#fff;color:#111;direction:rtl;font-family:inherit}
.rp h1{font-size:21px;margin:0 0 4px}
.rp h2{font-size:15px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #0E2A3B}
.rp .sub{color:#555;font-size:13px;margin:0 0 4px;line-height:1.8}
.rp table{border-collapse:collapse;width:100%;font-size:12.5px}
.rp th,.rp td{border:1px solid #bbb;padding:6px 7px;text-align:right;vertical-align:top}
.rp th{background:#EFEFEF}
.rp .num{text-align:center;white-space:nowrap}
.rp .kpis{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}
.rp .kpi{border:1px solid #bbb;padding:8px 14px;min-width:120px;text-align:center}
.rp .kpi b{display:block;font-size:20px}
.rp .kpi span{font-size:12px;color:#555}
.rp .cmt{border-bottom:1px solid #ddd;padding:6px 0;font-size:13px;line-height:1.9;break-inside:avoid}
.rp .cmt small{color:#777;display:block}
.rp-actions{max-width:800px;margin:0 auto;padding:14px 16px 0;display:flex;gap:8px;flex-wrap:wrap;direction:rtl}
/* گزارش انگلیسی: چپ‌به‌راست */
.rp.en{direction:ltr}
.rp.en th,.rp.en td{text-align:left}
.rp.en th.num,.rp.en td.num{text-align:center}
.rp-actions.en{direction:ltr}
@page{size:A4;margin:14mm}
@media print{
  body{background:#fff !important}
  .no-print{display:none !important}
  .rp{padding:0;max-width:none}
  .ad{background:#fff}
}
`;
