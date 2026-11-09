'use strict';
// ONE TO BEYOND — public letter page.
// Content comes from content.json. Hearts/Amen are remembered per visitor in this
// browser only (no shared server yet). Login, comments and admin editing need a
// backend and are intentionally not part of this public build.

const KEY = 'onetobeyond-public-v1';
const SITE_URL = 'https://onetobeyond.org/';
const YOUTUBE_ID = 'Ie07qxjnmGI';

let DATA = null;
let state = { current: null, likes: {}, amens: {}, size: 18 };
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
let toastTimer, lastFocus;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const photo = s => DATA.photos[s] || s;
const letters = () => DATA.letters;
const letter = () => letters().find(l => l.id === state.current) || letters()[0];

function save() { try { localStorage.setItem(KEY, JSON.stringify({ current: state.current, likes: state.likes, amens: state.amens, size: state.size })); } catch {} }
function toast(t) { clearTimeout(toastTimer); $('#toast-root').innerHTML = '<div class="toast" role="status">' + esc(t) + '</div>'; toastTimer = setTimeout(() => $('#toast-root').innerHTML = '', 4000); }

function reactBtn(type, id, label) {
  const active = !!state[type][id];
  const icon = type === 'likes' ? (active ? '♥' : '♡') : (active ? '✓' : '✧');
  const text = active && type === 'amens' ? '함께 기도했어요' : label;
  return `<button class="reaction ${active ? 'active' : ''}" data-action="react" data-type="${type}" data-id="${esc(id)}" aria-pressed="${active}">${icon} ${esc(text)} <span>${active ? 1 : 0}</span></button>`;
}
const shareBtn = () => `<button class="reaction" data-action="share">↗ 공유</button>`;

function render() {
  const l = letter(), a = esc;
  document.documentElement.style.setProperty('--size', state.size + 'px');
  document.title = `${l.title.replace(/\n/g, ' ')} · One to Beyond`;
  $('#app').innerHTML = `
<header class="site-header"><div class="header-inner"><a class="brand" href="#top" data-action="top"><span class="mark" aria-hidden="true"><i></i><i></i><i></i></span><span>ONE TO BEYOND<small>코트디부아르에서 온 편지</small></span></a><nav><a href="#letter">기도편지</a><a href="#moments">일상</a><a href="#prayers">함께 기도</a></nav></div></header>
<div class="wrap" id="top"><div class="edition-tools"><label for="edition">기도편지 모아보기<select id="edition">${letters().map(e => `<option value="${a(e.id)}" ${e.id === l.id ? 'selected' : ''}>No. ${a(e.issue)} · ${a(e.date)} · ${a(e.title.replace(/\n/g, ' '))}</option>`).join('')}</select></label><div class="size-controls"><span>글자 크기</span><button data-action="size" data-step="-1" aria-label="글자 작게" ${state.size <= 16 ? 'disabled' : ''}>A−</button><button data-action="size" data-step="1" aria-label="글자 크게" ${state.size >= 24 ? 'disabled' : ''}>A+</button></div></div>
<section class="hero"><div class="hero-copy"><div class="eyebrow">LETTRE DE PRIÈRE · NO. ${a(String(l.issue).padStart(2, '0'))}</div><h1>${a(l.title)}</h1><p class="hero-sub">${a(l.subtitle)}</p><a class="btn" href="#letter">편지 읽기 ↓</a><p class="hero-date">${a(l.date.replaceAll('-', '. '))} &nbsp;·&nbsp; ABIDJAN, CÔTE D’IVOIRE</p></div><figure class="hero-visual" data-action="to-letter" role="link" tabindex="0" aria-label="편지 본문으로"><img src="${photo(l.cover)}" alt="코트디부아르 아비장의 풍경"><span class="place">ABIDJAN</span><figcaption>Bonjour,<br>Côte d’Ivoire.</figcaption></figure></section>
<section id="letter" class="reading"><aside><div class="eyebrow">FROM THE FIELD</div><h2>아비장에서<br>전하는 안부</h2><p>한결같은 마음으로,<br>한 통씩 쌓아가는 이야기.</p><nav class="toc" aria-label="이야기 목차">${l.sections.map((s, i) => `<a href="#story-${i}"><span>${String(i + 1).padStart(2, '0')}</span>${a(s.title)}</a>`).join('')}</nav><img loading="lazy" src="${photo('5')}" alt="기도편지를 전하는 가족"></aside><div class="prose"><span class="greeting">사랑하는 동역자 여러분께,</span>${l.intro.split('\n\n').map(t => '<p>' + a(t) + '</p>').join('')}${l.sections.map((s, i) => `<article class="story" id="story-${i}"><div class="story-head"><span>${String(i + 1).padStart(2, '0')}</span><h3>${a(s.title)}</h3></div>${s.paragraphs.map(t => '<p>' + a(t) + '</p>').join('')}<div class="story-end">${reactBtn('likes', l.id + ':story:' + i, '마음')}</div></article>`).join('')}${l.quote ? '<blockquote>“' + a(l.quote) + '”</blockquote>' : ''}<div class="reading-end">${reactBtn('likes', 'letter:' + l.id, '좋아요')}${shareBtn()}</div></div></section>
<section class="section" id="moments"><div class="section-head"><div><div class="eyebrow">EVERYDAY GRACE</div><h2>일상에 스며든 은혜</h2></div><p>새로운 만남, 낯선 풍경.<br>우리의 일상을 함께 나눠요.</p></div><div class="gallery">${[['5', '새로운 시작, 우리 가족'], ['2', '함께 배우는 일상'], ['4', '이 땅의 교회를 만나다']].map(([n, c]) => `<button data-action="photo" data-id="${n}" data-caption="${c}" aria-label="${c} 크게 보기"><img loading="lazy" src="${photo(n)}" alt="${c}"><span class="caption">${c}<span>↗</span></span></button>`).join('')}</div>
<a class="music video-card" href="https://www.youtube.com/watch?v=${YOUTUBE_ID}" target="_blank" rel="noopener"><span class="video-thumb"><img loading="lazy" src="https://i.ytimg.com/vi/${YOUTUBE_ID}/hqdefault.jpg" alt="찬양 ‘무명’ 영상 미리보기"><span class="play" aria-hidden="true">▶</span></span><div><strong>무명</strong><p>선교가는 가정을 위해 만들어 준 찬양입니다.<br>여러분과 함께 나누고 싶습니다.</p><span class="video-link">YouTube에서 보기 ↗</span></div></a></section></div>
<section class="prayer-section" id="prayers"><div class="prayer-inner"><div class="section-head"><div><div class="eyebrow">PRAY WITH US</div><h2>이 기도에, 함께해 주세요.</h2></div><p>${a(l.date.slice(0, 7).replace('-', '년 '))}월 기도제목<br>‘아멘’으로 마음을 모아주세요.</p></div><div class="prayer-grid">${l.prayers.map((p, i) => `<article class="prayer-card"><span class="prayer-number">${String(i + 1).padStart(2, '0')}</span><h3>${a(p.title)}</h3><p>${a(p.body)}</p>${reactBtn('amens', l.id + ':prayer:' + i, '아멘')}</article>`).join('')}</div><p class="prayer-note">여러분의 기도가 이곳의 하루를 지탱합니다.</p></div></section>
<div class="wrap"><footer><span>CÔTE D’IVOIRE · 함께 쓰는 기도편지<br>Since 2026, One to Beyond</span><a href="#top" data-action="top">맨 위로 ↑</a></footer></div>`;
}

function modal(html, label) {
  lastFocus = document.activeElement;
  $('#modal-root').innerHTML = `<div class="modal-shell" data-action="backdrop"><section class="modal wide" role="dialog" aria-modal="true" aria-label="${esc(label)}"><button class="close" data-action="close" aria-label="닫기">×</button>${html}</section></div>`;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('.modal .close')?.focus(), 0);
}
function close() { $('#modal-root').innerHTML = ''; document.body.style.overflow = ''; lastFocus?.focus(); }

function shareText() { const l = letter(); return `코트디부아르 기도편지 No. ${l.issue}\n${l.title.replace(/\n/g, ' ')}\n\n${l.subtitle.replace(/\n/g, ' ')}`; }
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
    try { await navigator.share({ title: letter().title.replace(/\n/g, ' '), text, url: SITE_URL }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  await copyText(text + '\n\n' + SITE_URL);
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
  else if (act === 'photo') modal(`<img src="${photo(id)}" alt="${esc(b.dataset.caption)}"><p class="help">${esc(b.dataset.caption)}</p>`, '사진 크게 보기');
});
document.addEventListener('change', ev => { if (ev.target.id === 'edition') { state.current = ev.target.value; save(); render(); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('.modal')) close();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.action === 'to-letter') { e.preventDefault(); e.target.click(); }
});

fetch('content.json', { cache: 'no-cache' })
  .then(r => { if (!r.ok) throw Error(r.status); return r.json(); })
  .then(d => {
    DATA = { photos: d.photos, letters: d.letters || [d.letter] };
    DATA.letters.sort((x, y) => Number(y.issue) - Number(x.issue));
    render();
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  })
  .catch(() => { $('#app').innerHTML = '<p class="noscript">편지를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>'; });
