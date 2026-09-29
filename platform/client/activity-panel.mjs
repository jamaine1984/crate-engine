import { esc } from './ui.mjs';

/** Real visitor, editor, sign-up and play numbers for the Owner Portal overview (UTC days). */
export function activityPanel(a) {
  if (!a) return '';
  const n = v => Number(v || 0).toLocaleString();
  const cards = [
    ['Visitors today', a.today.visitors], ['Visitors, last 7 days', a.last7.visitors],
    ['Editor opens today', a.today.editorOpens], ['Editor opens, last 7 days', a.last7.editorOpens],
    ['Sign-ups today', a.today.signups], ['Sign-ups, last 7 days', a.last7.signups], ['Sign-ups, all time', a.totals.signups],
    ['Game plays today', a.today.plays], ['Game plays, last 7 days', a.last7.plays], ['Game plays, all time', a.totals.plays],
  ];
  const top = Math.max(1, ...a.series.map(d => d.visitors));
  const rows = [...a.series].reverse().map(d => `<tr><td>${esc(d.day)}</td><td class="bar-cell"><span class="bar" style="width:${Math.round(d.visitors / top * 100)}%"></span><b>${n(d.visitors)}</b></td><td>${n(d.pageViews)}</td><td>${n(d.editorOpens)}</td><td>${n(d.signups)}</td><td>${n(d.plays)}</td></tr>`).join('');
  const since = a.since ? ` Visitor counting started ${esc(a.since)}.` : ' No visits have been counted yet.';
  return `<section class="panel section"><h2>Traffic and activity</h2>`
    + `<div class="stat-grid">${cards.map(([label, value]) => `<div class="stat-card"><small>${label}</small><strong>${n(value)}</strong></div>`).join('')}</div>`
    + `<div class="activity-wrap"><table class="activity-table"><thead><tr><th>Day (UTC)</th><th>Visitors</th><th>Page views</th><th>Editor opens</th><th>Sign-ups</th><th>Plays</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + `<p class="muted">Visitors are counted without cookies or stored IP addresses, so a person who comes back on another day counts again. Sign-ups and plays come straight from the database.${since}</p></section>`;
}
