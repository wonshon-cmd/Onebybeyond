'use strict';
// "마음 나눔" — comments that require Google sign-in.
// Talks to Supabase Auth + REST directly (no SDK). Each post is either
// public (everyone sees it) or private (only the author and the admins
// listed in the `admins` table can see it — enforced by RLS in the database).
(function () {
  const cfg = window.OTB_CONFIG || {};
  const URL_ = (cfg.supabaseUrl || '').replace(/\/$/, '');
  const KEY = cfg.supabaseAnonKey || '';
  const enabled = !!(URL_ && KEY);
  const SESSION_KEY = 'otb-session-v1';
  const RETURN_KEY = 'otb-return-to-community';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = {
    letterId: null, loadedFor: null, loading: false, error: '',
    posts: [], filter: 'all', session: null, user: null, isAdmin: false,
    draft: { name: '', body: '', kind: 'sharing', visibility: 'public' }, sending: false, formError: '',
  };

  // ---------- session ----------
  function readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
  function writeSession(s) { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch {} }

  // Supabase returns tokens in the URL fragment after Google sign-in.
  function takeTokensFromUrl() {
    const h = location.hash;
    if (!h.includes('access_token=') && !h.includes('error_description=')) return;
    const p = new URLSearchParams(h.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    if (p.get('error_description')) { st.error = '로그인하지 못했어요: ' + p.get('error_description'); return; }
    writeSession({
      access_token: p.get('access_token'),
      refresh_token: p.get('refresh_token'),
      expires_at: Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600),
    });
  }

  async function validSession() {
    let s = readSession();
    if (!s) return null;
    if (s.expires_at - 60 > Date.now() / 1000) return s;
    try {
      const r = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      if (!r.ok) throw Error();
      const d = await r.json();
      s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600) };
      writeSession(s);
      return s;
    } catch { writeSession(null); return null; }
  }

  async function api(path, opts = {}) {
    const s = await validSession();
    const headers = { apikey: KEY, Authorization: 'Bearer ' + (s ? s.access_token : KEY), 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const r = await fetch(URL_ + path, { ...opts, headers });
    if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch {} throw Error(m || ('HTTP ' + r.status)); }
    return r.status === 204 ? null : r.json();
  }

  async function loadUser() {
    const s = await validSession();
    st.session = s;
    if (!s) { st.user = null; st.isAdmin = false; return; }
    try {
      const u = await api('/auth/v1/user');
      const m = u.user_metadata || {};
      st.user = { id: u.id, email: u.email, name: m.full_name || m.name || (u.email || '').split('@')[0] };
      if (!st.draft.name) st.draft.name = st.user.name.slice(0, 30);
      try { st.isAdmin = !!(await api('/rest/v1/rpc/is_admin', { method: 'POST', body: '{}' })); } catch { st.isAdmin = false; }
    } catch { writeSession(null); st.session = null; st.user = null; st.isAdmin = false; }
  }

  async function loadPosts() {
    if (!st.letterId) return;
    st.loading = true; st.error = ''; paint();
    try {
      st.posts = await api(`/rest/v1/posts?select=id,user_id,name,body,kind,visibility,created_at&letter_id=eq.${encodeURIComponent(st.letterId)}&order=created_at.desc&limit=200`);
      st.loadedFor = st.letterId;
    } catch { st.error = '나눔을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'; }
    st.loading = false; paint();
  }

  function signIn() {
    try { sessionStorage.setItem(RETURN_KEY, '1'); } catch {}
    const back = location.origin + location.pathname;
    location.href = `${URL_}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
  }
  async function signOut() {
    const s = readSession();
    if (s) fetch(`${URL_}/auth/v1/logout`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + s.access_token } }).catch(() => {});
    writeSession(null); st.session = null; st.user = null; st.isAdmin = false;
    await loadPosts();
  }

  async function submit() {
    const d = st.draft, name = d.name.trim(), body = d.body.trim();
    if (!name) { st.formError = '이름을 적어 주세요.'; return paint(); }
    if (body.length < 2) { st.formError = '두 글자 이상 적어 주세요.'; return paint(); }
    st.sending = true; st.formError = ''; paint();
    try {
      const [row] = await api('/rest/v1/posts', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name, body, kind: d.kind, visibility: d.visibility, letter_id: st.letterId }),
      });
      st.posts.unshift(row);
      st.draft.body = '';
      toast(d.visibility === 'private' ? '비공개로 남겼어요. 선교사 가정에게만 보여요.' : '마음을 나눠 주셔서 감사해요.');
    } catch (e) { st.formError = '저장하지 못했어요. 다시 시도해 주세요.' + (e.message ? ` (${e.message})` : ''); }
    st.sending = false; paint();
  }

  async function remove(id) {
    if (!confirm('이 나눔을 삭제할까요?')) return;
    try { await api(`/rest/v1/posts?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }); st.posts = st.posts.filter(p => p.id !== id); paint(); toast('삭제했어요.'); }
    catch { toast('삭제하지 못했어요. 다시 시도해 주세요.'); }
  }

  function toast(t) {
    const root = document.getElementById('toast-root'); if (!root) return;
    root.innerHTML = '<div class="toast" role="status">' + esc(t) + '</div>';
    clearTimeout(toast.t); toast.t = setTimeout(() => root.innerHTML = '', 4000);
  }

  // ---------- view ----------
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('ko-KR'); } catch { return ''; } }

  function view() {
    const head = `<div class="section-head"><div><div class="eyebrow">TOGETHER IN FAITH</div><h2>우리의 마음이 만나는 곳</h2><p class="community-intro">안부도, 감사도, 함께 기도할 제목도 좋아요.</p></div></div>`;
    if (!enabled) return head + `<div class="empty">마음 나눔 공간을 준비하고 있어요.<br><small>곧 Google 계정으로 안부를 남길 수 있어요.</small></div>`;

    const d = st.draft;
    const account = st.user
      ? `<div class="login-callout"><p><strong>${esc(st.user.name)}</strong> 님, 오늘의 마음을 나눠 주세요.${st.isAdmin ? ' <span class="tag">관리자</span>' : ''}<br><small class="help">${esc(st.user.email || '')} 로 로그인됨</small></p><button class="btn secondary compact" data-c="signout">로그아웃</button></div>
<form class="c-form" data-c="form" novalidate>
<label class="form-label" for="c-name">이름 · 나눔에 표시돼요</label><input id="c-name" data-f="name" maxlength="30" value="${esc(d.name)}" required>
<label class="form-label" for="c-kind">나눔 종류</label><select id="c-kind" data-f="kind"><option value="sharing" ${d.kind === 'sharing' ? 'selected' : ''}>안부·나눔</option><option value="prayer" ${d.kind === 'prayer' ? 'selected' : ''}>함께 기도할 제목</option></select>
<label class="form-label" for="c-body">나누고 싶은 마음</label><textarea id="c-body" data-f="body" rows="4" maxlength="1200" placeholder="짧은 한마디도 큰 힘이 됩니다.">${esc(d.body)}</textarea>
<fieldset class="c-visibility"><legend class="form-label">누구에게 보일까요?</legend>
<label class="c-choice"><input type="radio" name="c-vis" data-f="visibility" value="public" ${d.visibility === 'public' ? 'checked' : ''}><span><b>공개</b><small>방문하는 모든 분이 볼 수 있어요</small></span></label>
<label class="c-choice"><input type="radio" name="c-vis" data-f="visibility" value="private" ${d.visibility === 'private' ? 'checked' : ''}><span><b>비공개</b><small>선교사 가정과 나만 볼 수 있어요</small></span></label></fieldset>
<div class="form-error" role="alert">${esc(st.formError)}</div>
<button class="btn" type="submit" ${st.sending ? 'disabled' : ''}>${st.sending ? '남기는 중…' : '마음 남기기 ↗'}</button></form>`
      : `<div class="login-callout"><p>Google 계정으로 로그인하면 이름과 함께 마음을 남길 수 있어요.<br><small class="help">공개 또는 비공개(선교사 가정에게만)로 남길 수 있어요.</small></p><button class="btn google-btn compact" data-c="signin"><span class="google-logo">G</span> Google로 로그인</button></div>`;

    const posts = st.posts, shown = posts.filter(p => st.filter === 'all' || p.kind === st.filter);
    const tabs = `<div class="tabs" role="group" aria-label="나눔 종류">${[['all', '전체'], ['sharing', '안부·나눔'], ['prayer', '기도제목']].map(([k, v]) => `<button data-c="filter" data-id="${k}" class="${st.filter === k ? 'active' : ''}" aria-pressed="${st.filter === k}">${v} ${k === 'all' ? posts.length : posts.filter(p => p.kind === k).length}</button>`).join('')}</div>`;
    let list;
    if (st.loading && !posts.length) list = '<div class="empty">불러오는 중…</div>';
    else if (st.error) list = `<div class="empty">${esc(st.error)}<br><button class="btn secondary compact" style="margin-top:18px" data-c="retry">다시 시도</button></div>`;
    else if (!shown.length) list = '<div class="empty">첫 번째 안부를 기다리고 있어요.<br><small>“기도하고 있어요” 한마디가 큰 힘이 됩니다.</small></div>';
    else list = shown.map(p => {
      const mine = st.user && p.user_id === st.user.id;
      return `<article class="post"><div class="avatar" aria-hidden="true">${esc(p.name.slice(0, 1))}</div><div class="post-content"><div class="post-meta"><strong>${esc(p.name)}</strong><span class="tag">${p.kind === 'prayer' ? '기도제목' : '안부·나눔'}</span>${p.visibility === 'private' ? '<span class="tag c-private">비공개</span>' : ''}<time>${esc(fmtDate(p.created_at))}</time></div><p class="c-body">${esc(p.body)}</p>${mine || st.isAdmin ? `<div class="post-actions"><button class="reaction" data-c="delete" data-id="${esc(p.id)}">삭제</button></div>` : ''}</div></article>`;
    }).join('');
    return head + account + tabs + list;
  }

  function paint() {
    const root = document.getElementById('community-root');
    if (!root) return;
    const focusId = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : null;
    root.innerHTML = view();
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-c]');
    if (!b || b.tagName === 'FORM') return;
    const act = b.dataset.c;
    if (act === 'signin') signIn();
    else if (act === 'signout') signOut();
    else if (act === 'filter') { st.filter = b.dataset.id; paint(); }
    else if (act === 'retry') loadPosts();
    else if (act === 'delete') remove(b.dataset.id);
  });
  document.addEventListener('input', e => { const f = e.target.dataset?.f; if (f && f !== 'visibility') st.draft[f] = e.target.value; });
  document.addEventListener('change', e => { const f = e.target.dataset?.f; if (f) st.draft[f] = e.target.value; });
  document.addEventListener('submit', e => { if (e.target.dataset?.c === 'form') { e.preventDefault(); e.stopPropagation(); submit(); } }, true);

  // ---------- public hooks used by app.js ----------
  if (enabled) takeTokensFromUrl(); else if (location.hash.includes('access_token=')) history.replaceState(null, '', location.pathname);
  const ready = enabled ? loadUser() : Promise.resolve();

  window.OTBCommunity = {
    mount(letterId) {
      st.letterId = letterId;
      paint();
      if (enabled && st.loadedFor !== letterId && st.pendingFor !== letterId) { st.pendingFor = letterId; ready.then(loadPosts).finally(() => { st.pendingFor = null; }); }
    },
    afterFirstRender() {
      let back = false;
      try { back = sessionStorage.getItem(RETURN_KEY) === '1'; sessionStorage.removeItem(RETURN_KEY); } catch {}
      ready.then(() => { paint(); if (back) document.getElementById('community')?.scrollIntoView(); });
    },
  };
})();
