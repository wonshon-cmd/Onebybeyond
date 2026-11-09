'use strict';
// ONE TO BEYOND — public letter page.
// Letters come from Supabase (published versions only) when site/config.js is
// filled in; otherwise from content.json. Hearts/Amen are remembered per
// visitor in this browser. Comments live in community.js.

const KEY = 'onetobeyond-public-v1';
const SITE_URL = 'https://onetobeyond.org/';
const R = window.OTBRender;
const sb = window.OTBSupabase('otb-public-unused');

let DATA = null; // { letters:[...], order:[ids], featured:id }
let state = { current: null, likes: {}, amens: {}, size: 18 };
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
state.current = null;
let toastTimer, lastFocus, subscribeState = { sent: false, sending: false, error: '' };

const $ = s => document.querySelector(s);
const esc = R.esc;
const letters = () => DATA.letters;
const letter = () => letters().find(l => l.id === state.current) || letters().find(l => l.id === DATA.featured) || letters()[0];

function save() { try { localStorage.setItem(KEY, JSON.stringify({ likes: state.likes, amens: state.amens, size: state.size })); } catch {} }
function toast(t) { clearTimeout(toastTimer); $('#toast-root').innerHTML = '<div class="toast" role="status">' + esc(t) + '</div>'; toastTimer = setTimeout(() => $('#toast-root').innerHTML = '', 4000); }

function reactBtn(type, id, label) {
  const active = !!state[type][id];
  const icon = type === 'likes' ? (active ? '♥' : '♡') : (active ? '✓' : '✧');
  const text = active && type === 'amens' ? '함께 기도했어요' : label;
  if (!label) return `<button class="reaction heart-only ${active ? 'active' : ''}" data-action="react" data-type="${type}" data-id="${esc(id)}" aria-pressed="${active}" aria-label="하트">${icon}</button>`;
  return `<button class="reaction ${active ? 'active' : ''}" data-action="react" data-type="${type}" data-id="${esc(id)}" aria-pressed="${active}">${icon} ${esc(text)} <span>${active ? 1 : 0}</span></button>`;
}
const shareBtn = () => `<button class="reaction" data-action="share">↗ 공유</button>`;
const ctx = { react: reactBtn, share: shareBtn };

function subscribeHTML() {
  if (!sb.enabled) return '';
  const s = subscribeState;
  return `<section class="section subscribe" id="subscribe"><div class="section-head"><div><div class="eyebrow">STAY CONNECTED</div><h2>새 소식 받아보기</h2><p class="community-intro">새 기도편지가 나오면 이메일로 알려 드릴게요.</p></div></div>${s.sent ? '<div class="empty">신청해 주셔서 감사해요.<br><small>새 소식이 나오면 이메일로 보내 드릴게요.</small></div>' : `<form class="c-form subscribe-form" data-form="subscribe" novalidate><label class="form-label" for="sub-name">이름</label><input id="sub-name" name="name" maxlength="40" autocomplete="name" required><label class="form-label" for="sub-email">이메일</label><input id="sub-email" name="email" type="email" maxlength="200" autocomplete="email" required><div class="form-error" role="alert">${esc(s.error)}</div><button class="btn" type="submit" ${s.sending ? 'disabled' : ''}>${s.sending ? '신청하는 중…' : '소식 받기'}</button></form>`}</section>`;
}

function render() {
  const l = letter(), a = esc;
  document.documentElement.style.setProperty('--size', state.size + 'px');
  document.title = `${String(l.title).replace(/\n/g, ' ')} · One to Beyond`;
  const ordered = DATA.order.map(id => letters().find(x => x.id === id)).filter(Boolean).concat(letters().filter(x => !DATA.order.includes(x.id)));
  $('#app').innerHTML = `
<header class="site-header"><div class="header-inner"><a class="brand" href="#top" data-action="top"><span class="mark" aria-hidden="true"><i></i><i></i><i></i></span><span>ONE TO BEYOND<small>코트디부아르에서 온 편지</small></span></a><nav><a href="#letter">기도편지</a><a href="#prayers">함께 기도</a><a href="#community">마음 나눔</a></nav></div></header>
<div class="wrap" id="top"><div class="edition-tools"><label for="edition">기도편지 모아보기<select id="edition">${ordered.map(e => `<option value="${a(e.id)}" ${e.id === l.id ? 'selected' : ''}>No. ${a(e.issue)} · ${a(e.date)} · ${a(String(e.title).replace(/\n/g, ' '))}</option>`).join('')}</select></label><div class="size-controls"><span>글자 크기</span><button data-action="size" data-step="-1" aria-label="글자 작게" ${state.size <= 16 ? 'disabled' : ''}>A−</button><button data-action="size" data-step="1" aria-label="글자 크게" ${state.size >= 24 ? 'disabled' : ''}>A+</button></div></div>
${R.letterHTML(l, ctx)}</div>
${R.prayersHTML(l, ctx)}
<div class="wrap"><section class="section" id="community"><div id="community-root"></div></section>${subscribeHTML()}<footer><span>CÔTE D’IVOIRE · 함께 쓰는 기도편지<br>Since 2026, One to Beyond</span><a href="#top" data-action="top">맨 위로 ↑</a></footer></div>`;
  window.OTBCommunity?.mount(l.id);
}

function modal(html, label) {
  lastFocus = document.activeElement;
  $('#modal-root').innerHTML = `<div class="modal-shell" data-action="backdrop"><section class="modal wide" role="dialog" aria-modal="true" aria-label="${esc(label)}"><button class="close" data-action="close" aria-label="닫기">×</button>${html}</section></div>`;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('.modal .close')?.focus(), 0);
}
function close() { $('#modal-root').innerHTML = ''; document.body.style.overflow = ''; lastFocus?.focus(); }

const letterUrl = () => SITE_URL + '?letter=' + encodeURIComponent(letter().id);
function shareText() { const l = letter(); return `코트디부아르 기도편지 No. ${l.issue}\n${String(l.title).replace(/\n/g, ' ')}\n\n${String(l.subtitle || '').replace(/\n/g, ' ')}`; }
async function copyText(text) {
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(text);
    else { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); if (!ok) throw Error(); }
    toast('링크와 내용을 복사했어요.');
  } catch { toast('복사가 지원되지 않아요. 주소창의 링크를 직접 복사해 주세요.'); }
}
async function share() {
  const text = shareText();
  if (navigator.share) {
    try { await navigator.share({ title: String(letter().title).replace(/\n/g, ' '), text, url: letterUrl() }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  await copyText(text + '\n\n' + letterUrl());
}

async function subscribe(form) {
  const d = new FormData(form), name = String(d.get('name') || '').trim(), email = String(d.get('email') || '').trim();
  if (!name) { subscribeState.error = '이름을 적어 주세요.'; return render(); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { subscribeState.error = '이메일 주소를 확인해 주세요.'; return render(); }
  subscribeState = { sending: true, sent: false, error: '' }; render();
  try { await sb.api('/rest/v1/rpc/subscribe', { method: 'POST', body: JSON.stringify({ p_name: name, p_email: email }) }); subscribeState = { sent: true, sending: false, error: '' }; }
  catch { subscribeState = { sent: false, sending: false, error: '신청하지 못했어요. 잠시 후 다시 시도해 주세요.' }; }
  render();
  $('#subscribe')?.scrollIntoView({ block: 'center' });
}

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-action]');
  if (!b) return;
  const act = b.dataset.action, id = b.dataset.id;
  if (act === 'backdrop') { if (ev.target === b) close(); return; }
  ev.preventDefault();
  if (act === 'close') close();
  else if (act === 'to-letter') $('#letter').scrollIntoView({ behavior: 'smooth' });
  else if (act === 'top') scrollTo({ top: 0, behavior: 'smooth' });
  else if (act === 'react') { const t = b.dataset.type; state[t][id] = !state[t][id]; save(); render(); document.querySelector(`[data-action="react"][data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); }
  else if (act === 'size') { state.size = Math.max(16, Math.min(24, state.size + Number(b.dataset.step))); save(); render(); }
  else if (act === 'share') await share();
  else if (act === 'photo') modal(`<img src="${esc(b.dataset.src)}" alt="${esc(b.dataset.caption)}">${b.dataset.caption ? `<p class="help">${esc(b.dataset.caption)}</p>` : ''}`, '사진 크게 보기');
});
document.addEventListener('change', ev => { if (ev.target.id === 'edition') { state.current = ev.target.value; history.replaceState(null, '', '?letter=' + encodeURIComponent(state.current)); render(); scrollTo({ top: 0 }); } });
document.addEventListener('submit', ev => { if (ev.target.dataset?.form === 'subscribe') { ev.preventDefault(); subscribe(ev.target); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('.modal')) close();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.action === 'to-letter') { e.preventDefault(); e.target.click(); }
});

async function loadData() {
  if (sb.enabled) {
    try {
      const [rows, settings] = await Promise.all([
        sb.api('/rest/v1/letters_published?select=id,data'),
        sb.api('/rest/v1/site_settings?select=key,value'),
      ]);
      if (rows && rows.length) {
        const s = Object.fromEntries((settings || []).map(r => [r.key, r.value]));
        return { letters: rows.map(r => ({ ...r.data, id: r.id })), order: Array.isArray(s.order) ? s.order : [], featured: s.featured || null };
      }
    } catch {}
  }
  const r = await fetch('/content.json', { cache: 'no-cache' });
  if (!r.ok) throw Error(r.status);
  const d = await r.json();
  return { letters: d.letters, order: d.settings?.order || [], featured: d.settings?.featured || null };
}

loadData()
  .then(d => {
    DATA = d;
    if (!DATA.letters.length) throw Error('empty');
    const want = new URLSearchParams(location.search).get('letter');
    state.current = DATA.letters.some(l => l.id === want) ? want : null;
    render();
    try { if (location.hash) document.querySelector(location.hash)?.scrollIntoView(); } catch {}
    window.OTBCommunity?.afterFirstRender();
  })
  .catch(() => { $('#app').innerHTML = '<p class="noscript">편지를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>'; });
