'use strict';
// ONE TO BEYOND — 관리자
// Access-code login = Supabase password sign-in for a dedicated admin account.
// Every write is checked again by the database (RLS: public.is_admin()).
(function () {
  const R = window.OTBRender, esc = R.esc;
  const cfg = window.OTB_CONFIG || {};
  const sb = window.OTBSupabase('otb-admin-session');
  const LOGIN_EMAIL = cfg.adminLoginEmail || 'admin@onetobeyond.org';
  const SITE = 'https://onetobeyond.org';
  const DEFAULT_YT = { url: 'https://www.youtube.com/watch?v=Ie07qxjnmGI', title: '무명', description: '선교가는 가정을 위해 만들어 준 찬양입니다.\n여러분과 함께 나누고 싶습니다.' };
  const COLORS = [['기본', '#343733'], ['웜그레이', '#8b7d6b'], ['회색', '#6f746c'], ['오렌지', '#ff7900'], ['그린', '#009e60']];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = () => $('#adm');
  const clone = v => JSON.parse(JSON.stringify(v));
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fmt = iso => { try { return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  let toastTimer;
  function toast(t, ms = 3500) { clearTimeout(toastTimer); $('#toast-root').innerHTML = '<div class="toast" role="status">' + esc(t) + '</div>'; toastTimer = setTimeout(() => $('#toast-root').innerHTML = '', ms); }
  const errText = e => e && e.message ? e.message : String(e || '');
  const upsert = { Prefer: 'resolution=merge-duplicates,return=representation' };

  // ============================================================ state
  const S = {
    route: '', letters: [], published: {}, settings: { order: [], featured: null },
    contacts: [], groups: [], sends: [], posts: [], admins: [],
    E: null, // editor: { id, data, dirty, serverAt, saving, isNew }
    contactEdit: null, contactQuery: '', contactGroup: '',
    send: null,
  };

  // ============================================================ data
  async function loadLetters() {
    const [drafts, pubs, settings] = await Promise.all([
      sb.api('/rest/v1/letter_drafts?select=id,data,updated_at'),
      sb.api('/rest/v1/letters_published?select=id,data,published_at'),
      sb.api('/rest/v1/site_settings?select=key,value'),
    ]);
    S.letters = drafts || [];
    S.published = Object.fromEntries((pubs || []).map(p => [p.id, p]));
    const s = Object.fromEntries((settings || []).map(r => [r.key, r.value]));
    S.settings = { order: Array.isArray(s.order) ? s.order : [], featured: s.featured || null };
  }
  const orderedLetters = () => {
    const o = S.settings.order;
    return [...S.letters].sort((a, b) => {
      const ia = o.indexOf(a.id), ib = o.indexOf(b.id);
      if (ia < 0 && ib < 0) return Number(b.data.issue) - Number(a.data.issue);
      if (ia < 0) return -1; if (ib < 0) return 1; return ia - ib;
    });
  };
  async function saveSettings(entries) {
    await sb.api('/rest/v1/site_settings', { method: 'POST', headers: upsert, body: JSON.stringify(Object.entries(entries).map(([key, value]) => ({ key, value }))) });
    Object.assign(S.settings, entries);
  }

  // ============================================================ shell
  function shell(inner, tab) {
    const tabs = [['letters', '소식지'], ['contacts', '주소록'], ['send', '알림 발송'], ['posts', '마음 나눔'], ['settings', '설정']];
    return `<header class="adm-header"><div class="row"><a class="brand" href="/" target="_blank" rel="noopener"><span class="mark" aria-hidden="true"><i></i><i></i><i></i></span><span>ONE TO BEYOND<small>관리자</small></span></a><span class="spacer"></span><a class="btn secondary compact" href="/" target="_blank" rel="noopener">사이트 보기 ↗</a></div>
<nav class="adm-tabs" aria-label="관리 메뉴">${tabs.map(([k, v]) => `<a href="#${k}" class="${tab === k ? 'on' : ''}">${v}</a>`).join('')}</nav></header>
<main class="adm adm-wrap">${inner}</main>`;
  }
  function loading(tab) { root().innerHTML = shell('<p class="lead" style="margin-top:30px">불러오는 중…</p>', tab); }
  function failed(tab, e) {
    if (e && (e.status === 401 || e.status === 403)) { sb.clear(); return renderLogin('다시 로그인해 주세요.'); }
    root().innerHTML = shell(`<div class="banner" style="margin-top:30px">불러오지 못했어요: ${esc(errText(e))}<div class="row-actions"><button class="btn small" data-a="reload">다시 시도</button></div></div>`, tab);
  }

  // ============================================================ login
  function renderLogin(msg = '') {
    root().innerHTML = `<div class="login-box adm"><a class="brand" href="/"><span class="mark" aria-hidden="true"><i></i><i></i><i></i></span><span>ONE TO BEYOND<small>코트디부아르에서 온 편지</small></span></a>
<h1>관리자 로그인</h1><p class="lead">접속 코드를 입력해 주세요.</p>
${sb.enabled ? `<form data-f="login" novalidate><label class="form-label" for="code">접속 코드</label><input id="code" name="code" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" required>
<div class="form-error" role="alert">${esc(msg)}</div><button class="btn" type="submit" style="width:100%;margin-top:8px">들어가기</button></form>`
      : `<div class="banner">아직 데이터베이스(Supabase)가 연결되지 않았어요. <code>config.js</code>에 주소와 키를 넣은 뒤 다시 열어 주세요.</div>`}</div>`;
    setTimeout(() => $('#code')?.focus(), 0);
  }
  async function login(form) {
    const code = String(new FormData(form).get('code') || '');
    if (!code) return renderLogin('접속 코드를 입력해 주세요.');
    const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = '확인 중…';
    try { await sb.signInWithPassword(LOGIN_EMAIL, code); route(); }
    catch (e) { renderLogin(e.status === 400 || e.status === 401 ? '코드가 맞지 않아요.' : '로그인하지 못했어요: ' + errText(e)); }
  }

  // ============================================================ letters list
  function statusOf(l) {
    const p = S.published[l.id];
    if (!p) return '<span class="pill">초안</span>';
    return JSON.stringify(p.data) === JSON.stringify(l.data) ? '<span class="pill ok">공개됨</span>' : '<span class="pill warn">공개됨 · 공개 안 된 수정 있음</span>';
  }
  async function renderLetters() {
    loading('letters');
    try { await loadLetters(); } catch (e) { return failed('letters', e); }
    paintLetters();
  }
  function paintLetters() {
    const list = orderedLetters();
    root().innerHTML = shell(`<h1>소식지</h1><p class="lead">순서는 방문자 화면의 ‘기도편지 모아보기’ 목록 순서예요. ‘첫 화면’으로 고른 소식지가 사이트에 처음 보여요.</p>
<button class="btn" data-a="new-letter">＋ 새 소식지 만들기</button>
${list.length ? list.map((l, i) => { const d = l.data; const img = R.safeUrl(d.cover); return `<div class="card"><div class="letter-row">${img ? `<img src="${esc(img)}" alt="">` : '<span class="noimg"></span>'}<div class="t"><b>No. ${esc(d.issue)} · ${esc(String(d.title || '').replace(/\n/g, ' '))}</b><small>${esc(d.date)} · 수정 ${esc(fmt(l.updated_at))}</small><div style="margin-top:6px">${statusOf(l)}${S.settings.featured === l.id ? '<span class="pill ok">첫 화면</span>' : ''}</div></div>
<div class="order-btns"><button data-a="move" data-id="${esc(l.id)}" data-d="-1" aria-label="위로" ${i === 0 ? 'disabled' : ''}>▲</button><button data-a="move" data-id="${esc(l.id)}" data-d="1" aria-label="아래로" ${i === list.length - 1 ? 'disabled' : ''}>▼</button></div></div>
<div class="row-actions"><a class="btn small" href="#edit/${esc(l.id)}">편집</a>${S.published[l.id] && S.settings.featured !== l.id ? `<button class="btn secondary small" data-a="feature" data-id="${esc(l.id)}">첫 화면으로</button>` : ''}${S.published[l.id] ? `<a class="btn secondary small" href="/?letter=${encodeURIComponent(l.id)}" target="_blank" rel="noopener">사이트에서 보기 ↗</a>` : ''}</div></div>`; }).join('') : '<p class="lead" style="margin-top:20px">아직 소식지가 없어요.</p>'}`, 'letters');
  }
  async function moveLetter(id, d) {
    const ids = orderedLetters().map(l => l.id), i = ids.indexOf(id), j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await saveSettings({ order: ids }); paintLetters(); toast('순서를 바꿨어요. 사이트에 바로 반영돼요.'); } catch (e) { toast('순서를 저장하지 못했어요: ' + errText(e)); }
  }
  async function feature(id) {
    try { await saveSettings({ featured: id }); paintLetters(); toast('첫 화면 소식지를 바꿨어요.'); } catch (e) { toast('저장하지 못했어요: ' + errText(e)); }
  }

  // ============================================================ editor
  function blankLetter() {
    const issue = Math.max(0, ...S.letters.map(l => Number(l.data.issue) || 0)) + 1;
    const id = 'letter-' + today().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6);
    return { id, issue, date: today(), title: '새 기도편지', subtitle: '', cover: '', sidePhoto: '', intro: '<p>안녕하세요.</p><p>이달의 안부를 전합니다.</p>', quote: '',
      sections: [{ title: '이달의 이야기', html: '<p>새로운 소식을 적어 주세요.</p>', photos: [] }], prayers: [{ title: '', body: '' }], gallery: [], youtube: clone(DEFAULT_YT) };
  }
  function normalize(d) {
    d.sections = (d.sections || []).map(s => ({ title: s.title || '', html: s.html ?? R.textToHtml((s.paragraphs || []).join('\n\n')), photos: s.photos || [] }));
    d.prayers = d.prayers || []; d.gallery = d.gallery || []; d.youtube = d.youtube || { url: '', title: '', description: '' };
    d.intro = /<p[\s>]/.test(d.intro || '') ? d.intro : R.textToHtml(d.intro);
    return d;
  }
  const localKey = id => 'otb-admin-local-' + id;
  function readLocal(id) { try { return JSON.parse(localStorage.getItem(localKey(id)) || 'null'); } catch { return null; } }
  function writeLocal() { try { localStorage.setItem(localKey(S.E.id), JSON.stringify({ at: Date.now(), data: S.E.data })); } catch {} }
  function clearLocal(id) { try { localStorage.removeItem(localKey(id)); } catch {} }

  async function openEditor(id) {
    loading('letters');
    try { if (!S.letters.length) await loadLetters(); else { await loadLetters(); } } catch (e) { return failed('letters', e); }
    let row = S.letters.find(l => l.id === id), isNew = false, data;
    if (id === 'new') { data = blankLetter(); isNew = true; history.replaceState(null, '', '#edit/' + data.id); }
    else if (!row) { root().innerHTML = shell('<div class="banner" style="margin-top:30px">소식지를 찾을 수 없어요.</div><a class="btn secondary" href="#letters">목록으로</a>', 'letters'); return; }
    else data = clone(row.data);
    normalize(data);
    S.E = { id: data.id, data, dirty: isNew, serverAt: row ? Date.parse(row.updated_at) : 0, isNew, restore: null, lastSaved: row ? row.updated_at : null };
    const local = readLocal(data.id);
    if (local && local.at > S.E.serverAt + 1000 && JSON.stringify(local.data) !== JSON.stringify(data)) S.E.restore = local;
    paintEditor();
  }

  // --- field helpers
  const field = (k, label, v, extra = '') => `<label class="form-label" for="f-${k}">${label}</label><input id="f-${k}" data-k="${k}" value="${esc(v)}" ${extra}>`;
  const area = (k, label, v, rows = 3, extra = '') => `<label class="form-label" for="f-${k}">${label}</label><textarea id="f-${k}" data-k="${k}" rows="${rows}" ${extra}>${esc(v)}</textarea>`;
  function rich(k, label, html) {
    return `<label class="form-label">${label}</label><div class="rt-bar" role="toolbar" aria-label="글 서식">
<button type="button" data-cmd="bold" aria-label="굵게"><b>B</b></button><button type="button" data-cmd="underline" aria-label="밑줄"><u>U</u></button>
<select data-cmd="size" aria-label="글자 크기"><option value="">크기</option><option value="2">작게</option><option value="3">보통</option><option value="5">크게</option><option value="6">아주 크게</option></select>
<span class="sep"></span>${COLORS.map(([n, c]) => `<button type="button" class="sw" data-cmd="color" data-v="${c}" style="background:${c}" aria-label="글자색 ${n}"></button>`).join('')}<span class="sep"></span>
<button type="button" data-cmd="outdent" aria-label="내어쓰기">⇤</button><button type="button" data-cmd="indent" aria-label="들여쓰기">⇥</button>
<button type="button" data-cmd="align" data-v="left" aria-label="왼쪽 정렬">≡←</button><button type="button" data-cmd="align" data-v="center" aria-label="가운데 정렬">≡</button><button type="button" data-cmd="align" data-v="right" aria-label="오른쪽 정렬">→≡</button>
</div><div class="rt prose rich" contenteditable="true" data-rich="${k}" role="textbox" aria-multiline="true" aria-label="${esc(label)}">${R.sanitize(html) || '<p><br></p>'}</div>`;
  }
  function singlePhoto(k, label, url, help) {
    const u = R.safeUrl(url);
    return `<label class="form-label">${label}</label><div class="single-photo">${u ? `<img src="${esc(u)}" alt="">` : '<span class="noimg"></span>'}<div class="row-actions" style="margin:0"><span class="btn secondary small upload-btn">사진 올리기<input type="file" accept="image/*" data-upload="${k}" aria-label="${esc(label)} 올리기"></span>${pickables().length ? `<button type="button" class="btn secondary small" data-a="pick" data-k="${k}">이 소식지 사진에서 고르기</button>` : ''}${u ? `<button type="button" class="btn danger small" data-a="clear-photo" data-k="${k}">빼기</button>` : ''}</div></div>${help ? `<p class="help">${help}</p>` : ''}`;
  }
  function photoGrid(list, base) {
    return `<div class="photo-grid">${list.map((p, j) => `<div class="photo-item"><img src="${esc(R.safeUrl(p.url))}" alt=""><input data-k="${base}.${j}.caption" value="${esc(p.caption)}" placeholder="사진 설명" aria-label="사진 설명"><div class="pbar"><button type="button" data-a="ph-move" data-b="${base}" data-j="${j}" data-d="-1" aria-label="앞으로" ${j === 0 ? 'disabled' : ''}>◀</button><button type="button" class="del" data-a="ph-del" data-b="${base}" data-j="${j}" aria-label="사진 삭제">삭제</button><button type="button" data-a="ph-move" data-b="${base}" data-j="${j}" data-d="1" aria-label="뒤로" ${j === list.length - 1 ? 'disabled' : ''}>▶</button></div></div>`).join('')}</div>
<div class="row-actions"><span class="btn secondary small upload-btn">＋ 사진 여러 장 올리기<input type="file" accept="image/*" multiple data-upload="${base}" aria-label="사진 올리기"></span></div>`;
  }
  function pickables() {
    const d = S.E.data, set = new Set();
    [d.cover, d.sidePhoto, ...d.gallery.map(g => g.url), ...d.sections.flatMap(s => s.photos.map(p => p.url))].forEach(u => R.safeUrl(u) && set.add(u));
    return [...set];
  }

  function paintEditor() {
    const E = S.E, d = E.data, pub = S.published[E.id];
    const yt = R.youtubeId(d.youtube.url);
    const blockHead = (label, kind, i, n) => `<div class="block-head"><strong>${label}</strong><button type="button" data-a="blk-move" data-kind="${kind}" data-i="${i}" data-d="-1" aria-label="위로" ${i === 0 ? 'disabled' : ''}>▲</button><button type="button" data-a="blk-move" data-kind="${kind}" data-i="${i}" data-d="1" aria-label="아래로" ${i === n - 1 ? 'disabled' : ''}>▼</button><button type="button" class="del" data-a="blk-del" data-kind="${kind}" data-i="${i}">삭제</button></div>`;
    root().innerHTML = shell(`
<p style="margin:22px 0 0"><a href="#letters" class="muted" style="font-size:13px">← 소식지 목록</a></p>
<h1>${E.isNew ? '새 소식지' : '소식지 편집'}</h1>
<p class="lead">${pub ? '공개된 소식지예요. ‘임시 저장’은 사이트에 반영되지 않고, ‘공개 반영’을 눌러야 방문자 화면이 바뀌어요.' : '아직 공개 전이에요. ‘공개 반영’을 누르기 전에는 방문자에게 보이지 않아요.'}</p>
${E.restore ? `<div class="banner">이 기기에 저장되지 않은 수정본이 있어요 (${esc(fmt(new Date(E.restore.at).toISOString()))}).<div class="row-actions"><button class="btn small" data-a="restore">수정본 불러오기</button><button class="btn secondary small" data-a="discard-local">버리기</button></div></div>` : ''}
<form id="ed" novalidate onsubmit="return false">
<div class="two"><div>${field('issue', '소식지 번호', d.issue, 'type="number" min="1" inputmode="numeric"')}</div><div>${field('date', '날짜', d.date, 'type="date"')}</div></div>
${area('title', '제목 · 줄바꿈 가능', d.title, 2)}
${area('subtitle', '소제목', d.subtitle, 2)}
${singlePhoto('cover', '대표 사진 (첫 화면)', d.cover)}
${singlePhoto('sidePhoto', '본문 옆 사진', d.sidePhoto, '비워 두면 갤러리 첫 사진이 쓰여요.')}

<div class="ed-section"><h2>인사말</h2>${rich('intro', '인사말', d.intro)}</div>

<div class="ed-section"><h2>이야기 (목차)</h2><p class="help">이야기 순서가 곧 목차 순서예요.</p>
${d.sections.map((s, i) => `<div class="block">${blockHead('이야기 ' + String(i + 1).padStart(2, '0'), 'sections', i, d.sections.length)}
${field(`sections.${i}.title`, '소제목', s.title, 'maxlength="160"')}
${rich(`sections.${i}.html`, '본문', s.html)}
<label class="form-label">이 이야기의 사진</label>${photoGrid(s.photos, `sections.${i}.photos`)}</div>`).join('')}
<button type="button" class="btn secondary small" data-a="blk-add" data-kind="sections">＋ 이야기 추가</button></div>

<div class="ed-section"><h2>강조 문장</h2>${area('quote', '본문 끝에 크게 보일 한 문장 (선택)', d.quote, 2)}</div>

<div class="ed-section"><h2>기도제목</h2><p class="help">방문자는 각 기도제목에 ‘✧ 아멘’을 누를 수 있어요.</p>
${d.prayers.map((p, i) => `<div class="block">${blockHead('기도제목 ' + String(i + 1).padStart(2, '0'), 'prayers', i, d.prayers.length)}${field(`prayers.${i}.title`, '제목', p.title, 'maxlength="160"')}${area(`prayers.${i}.body`, '내용', p.body, 3)}</div>`).join('')}
<button type="button" class="btn secondary small" data-a="blk-add" data-kind="prayers">＋ 기도제목 추가</button></div>

<div class="ed-section"><h2>갤러리 (일상에 스며든 은혜)</h2>${photoGrid(d.gallery, 'gallery')}</div>

<div class="ed-section"><h2>영상</h2>
${field('youtube.url', 'YouTube 링크', d.youtube.url, 'type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=…"')}
<div class="yt-preview" id="yt-prev">${yt ? `<img src="https://i.ytimg.com/vi/${esc(yt)}/hqdefault.jpg" alt="영상 미리보기"><a class="btn secondary small" href="https://www.youtube.com/watch?v=${esc(yt)}" target="_blank" rel="noopener">영상 열기 ↗</a>` : '<p class="help">링크를 넣으면 미리보기가 나와요. 비워 두면 영상 칸이 숨겨져요.</p>'}</div>
${field('youtube.title', '영상 제목', d.youtube.title)}${area('youtube.description', '영상 설명', d.youtube.description, 2)}
<div class="row-actions"><button type="button" class="btn secondary small" data-a="yt-default">기본 영상(무명)으로</button></div></div>

<div class="ed-section"><h2>더보기</h2>
<p class="help">휴대폰에서 ‘임시 저장’하면 컴퓨터의 관리자 화면에서 그대로 이어서 편집할 수 있어요. 인터넷이 불안할 때는 파일로 옮길 수도 있어요.</p>
<div class="row-actions"><button type="button" class="btn secondary small" data-a="export">초안 파일로 내보내기</button><span class="btn secondary small upload-btn">초안 파일 불러오기<input type="file" accept="application/json,.json" data-import="1"></span></div>
${!E.isNew ? `<div class="row-actions">${pub ? '<button type="button" class="btn danger small" data-a="unpublish">공개 내리기</button>' : ''}<button type="button" class="btn danger small" data-a="delete-letter">소식지 삭제</button></div>` : ''}</div>
</form>
<div class="bottom-bar"><div class="in"><span class="status" id="ed-status">${statusLine()}</span><button class="btn secondary" data-a="save">임시 저장</button><button class="btn secondary" data-a="preview">미리보기</button><button class="btn" data-a="publish">공개 반영</button></div></div>`, 'letters');
  }
  function statusLine() {
    const E = S.E;
    if (E.saving) return '저장하는 중…';
    if (E.dirty) return '저장 안 된 수정이 있어요';
    return E.lastSaved ? '임시 저장됨 · ' + fmt(E.lastSaved) : '';
  }
  function setStatus() { const el = $('#ed-status'); if (el) el.textContent = statusLine(); }

  // --- read DOM → data
  function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[/^\d+$/.test(ks[i]) ? Number(ks[i]) : ks[i]]; o[ks.at(-1)] = val; }
  function readForm() {
    const E = S.E; if (!E || !$('#ed')) return;
    $$('#ed [data-k]').forEach(el => setPath(E.data, el.dataset.k, el.dataset.k === 'issue' ? Number(el.value) || 1 : el.value));
    $$('#ed [data-rich]').forEach(el => setPath(E.data, el.dataset.rich, R.sanitize(el.innerHTML)));
  }
  function getList(path) { return path.split('.').reduce((o, k) => o[/^\d+$/.test(k) ? Number(k) : k], S.E.data); }
  function restructure(fn) { readForm(); fn(S.E.data); markDirty(); const y = scrollY; paintEditor(); scrollTo(0, y); }

  // --- dirty / autosave
  let localTimer, serverTimer;
  function markDirty() {
    S.E.dirty = true; setStatus();
    clearTimeout(localTimer); localTimer = setTimeout(() => { readForm(); writeLocal(); }, 800);
    clearTimeout(serverTimer); serverTimer = setTimeout(() => { if (S.E && S.E.dirty && !S.E.saving) saveDraft(true); }, 30000);
  }
  function validate(d) {
    if (!String(d.title).trim()) return '제목을 적어 주세요.';
    if (!(Number(d.issue) >= 1)) return '소식지 번호를 확인해 주세요.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return '날짜를 확인해 주세요.';
    return '';
  }
  async function saveDraft(auto = false) {
    const E = S.E; readForm();
    const v = validate(E.data); if (v) { if (!auto) toast(v); return false; }
    E.saving = true; setStatus();
    try {
      const at = new Date().toISOString();
      const [row] = await sb.api('/rest/v1/letter_drafts', { method: 'POST', headers: upsert, body: JSON.stringify({ id: E.id, data: E.data, updated_at: at, updated_by: auto ? 'autosave' : 'admin' }) });
      E.dirty = false; E.isNew = false; E.lastSaved = row?.updated_at || at; E.serverAt = Date.parse(E.lastSaved);
      const i = S.letters.findIndex(l => l.id === E.id); const rec = { id: E.id, data: clone(E.data), updated_at: E.lastSaved };
      if (i >= 0) S.letters[i] = rec; else S.letters.push(rec);
      clearLocal(E.id);
      if (!auto) toast('임시 저장했어요. 사이트에는 아직 반영되지 않았어요.');
      return true;
    } catch (e) {
      if (e.status === 401 || e.status === 403) { toast('로그인이 풀렸어요. 수정 내용은 이 기기에 보관돼요.'); writeLocal(); }
      else toast((auto ? '자동 저장 실패: ' : '저장하지 못했어요: ') + errText(e) + ' · 수정 내용은 이 기기에 보관돼요.', 6000);
      writeLocal(); return false;
    } finally { E.saving = false; setStatus(); }
  }
  async function publish() {
    readForm();
    const v = validate(S.E.data); if (v) return toast(v);
    if (!confirm('지금 내용으로 방문자 화면을 바꿀까요?')) return;
    if (!(await saveDraft())) return;
    const E = S.E;
    try {
      const [row] = await sb.api('/rest/v1/letters_published', { method: 'POST', headers: upsert, body: JSON.stringify({ id: E.id, data: E.data, published_at: new Date().toISOString() }) });
      S.published[E.id] = row || { id: E.id, data: clone(E.data) };
      const changes = {};
      if (!S.settings.order.includes(E.id)) changes.order = [E.id, ...S.settings.order];
      if (!S.settings.featured || (S.settings.featured !== E.id && confirm('이 소식지를 사이트 첫 화면에 보여줄까요?'))) changes.featured = E.id;
      if (Object.keys(changes).length) await saveSettings(changes);
      toast('사이트에 반영했어요.');
      paintEditor();
    } catch (e) { toast('공개 반영하지 못했어요: ' + errText(e), 6000); }
  }
  async function unpublish() {
    if (!confirm('이 소식지를 방문자 화면에서 내릴까요? 초안은 남아 있어요.')) return;
    try {
      await sb.api(`/rest/v1/letters_published?id=eq.${encodeURIComponent(S.E.id)}`, { method: 'DELETE' });
      delete S.published[S.E.id];
      if (S.settings.featured === S.E.id) await saveSettings({ featured: Object.keys(S.published)[0] || null });
      toast('공개를 내렸어요.'); paintEditor();
    } catch (e) { toast('내리지 못했어요: ' + errText(e)); }
  }
  async function deleteLetter() {
    if (!confirm('이 소식지를 완전히 삭제할까요? 되돌릴 수 없어요.')) return;
    try {
      await sb.api(`/rest/v1/letter_drafts?id=eq.${encodeURIComponent(S.E.id)}`, { method: 'DELETE' });
      const id = S.E.id; clearLocal(id); S.E = null;
      const changes = { order: S.settings.order.filter(x => x !== id) };
      if (S.settings.featured === id) changes.featured = Object.keys(S.published).find(x => x !== id) || null;
      await saveSettings(changes);
      toast('삭제했어요.'); location.hash = '#letters';
    } catch (e) { toast('삭제하지 못했어요: ' + errText(e)); }
  }

  // --- preview
  function preview() {
    readForm();
    const d = S.E.data;
    const fake = { react: (t, id, label) => label ? `<span class="reaction">${t === 'likes' ? '♡' : '✧'} ${esc(label)} <span>0</span></span>` : '<span class="reaction heart-only">♡</span>', share: () => '<span class="reaction">↗ 공유</span>' };
    $('#modal-root').innerHTML = `<div class="preview-shell" role="dialog" aria-modal="true" aria-label="미리보기"><div class="preview-top"><span>미리보기 · 아직 저장·공개되지 않은 내용도 보여요</span><span class="spacer"></span><button data-a="close-preview">닫기</button></div>
<header class="site-header"><div class="header-inner"><span class="brand"><span class="mark" aria-hidden="true"><i></i><i></i><i></i></span><span>ONE TO BEYOND<small>코트디부아르에서 온 편지</small></span></span></div></header>
<div class="wrap">${R.letterHTML(d, fake)}</div>${R.prayersHTML(d, fake)}<div class="wrap"><footer><span>CÔTE D’IVOIRE · 함께 쓰는 기도편지<br>Since 2026, One to Beyond</span></footer></div></div>`;
    document.body.style.overflow = 'hidden';
    $('.preview-shell button').focus();
  }
  function closePreview() { $('#modal-root').innerHTML = ''; document.body.style.overflow = ''; }

  // --- photos
  async function resizeImage(file) {
    if (!/^image\//.test(file.type)) throw Error('이미지 파일만 올릴 수 있어요.');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(Error('사진을 읽지 못했어요. JPG나 PNG로 다시 시도해 주세요.')); i.src = url; });
      const max = 1800, scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      if (scale === 1 && file.size < 1.5e6 && /jpeg|png|webp/.test(file.type)) return file;
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(Error('사진 변환 실패')), 'image/jpeg', 0.85));
    } finally { URL.revokeObjectURL(url); }
  }
  async function uploadFiles(input) {
    const target = input.dataset.upload, files = [...input.files];
    if (!files.length) return;
    readForm();
    const urls = [];
    for (let n = 0; n < files.length; n++) {
      toast(`사진 올리는 중… (${n + 1}/${files.length})`, 60000);
      try {
        const blob = await resizeImage(files[n]);
        const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
        urls.push(await sb.upload('media', `${S.E.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`, blob));
      } catch (e) { toast(`사진을 올리지 못했어요: ${errText(e)}`, 6000); }
    }
    if (!urls.length) return;
    restructure(d => {
      if (target === 'cover' || target === 'sidePhoto') d[target] = urls[0];
      else getList(target).push(...urls.map(url => ({ url, caption: '' })));
    });
    toast(urls.length + '장 올렸어요. 저장을 잊지 마세요.');
  }
  function pickPhoto(k) {
    const list = pickables();
    $('#modal-root').innerHTML = `<div class="modal-shell" data-a="close-modal"><section class="modal wide" role="dialog" aria-modal="true" aria-label="사진 고르기"><button class="close" data-a="close-modal" aria-label="닫기">×</button><h2>사진 고르기</h2><div class="photo-grid">${list.map(u => `<button type="button" class="photo-item" data-a="picked" data-k="${k}" data-u="${esc(u)}" style="padding:0;cursor:pointer"><img src="${esc(u)}" alt=""></button>`).join('')}</div></section></div>`;
  }

  // --- rich-text commands
  let savedRange = null, savedEditor = null;
  document.addEventListener('selectionchange', () => {
    const sel = getSelection(); if (!sel.rangeCount) return;
    const node = sel.anchorNode; const ed = node && (node.nodeType === 1 ? node : node.parentElement)?.closest?.('[data-rich]');
    if (ed) { savedRange = sel.getRangeAt(0).cloneRange(); savedEditor = ed; }
  });
  function editorFor(bar) { return bar.nextElementSibling; }
  function restoreSel(ed) {
    ed.focus({ preventScroll: true });
    if (savedRange && savedEditor === ed) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
  }
  function blocksInSelection(ed) {
    const sel = getSelection(); if (!sel.rangeCount) return [];
    const r = sel.getRangeAt(0);
    if (!ed.querySelector('p')) { ed.innerHTML = '<p>' + (ed.innerHTML || '<br>') + '</p>'; }
    const blocks = [...ed.children].filter(b => r.intersectsNode(b));
    if (!blocks.length) { let n = r.startContainer; while (n && n.parentNode !== ed) n = n.parentNode; if (n && n.nodeType === 1) blocks.push(n); }
    return blocks;
  }
  function runCmd(btn) {
    const bar = btn.closest('.rt-bar'), ed = editorFor(bar), cmd = btn.dataset.cmd, v = btn.dataset.v || btn.value;
    restoreSel(ed);
    try { document.execCommand('styleWithCSS', false, false); } catch {}
    if (cmd === 'bold' || cmd === 'underline') document.execCommand(cmd);
    else if (cmd === 'size') { if (v) document.execCommand('fontSize', false, v); btn.value = ''; }
    else if (cmd === 'color') document.execCommand('foreColor', false, v);
    else if (cmd === 'align') blocksInSelection(ed).forEach(b => { b.style.textAlign = v === 'left' ? '' : v; });
    else if (cmd === 'indent' || cmd === 'outdent') blocksInSelection(ed).forEach(b => { const cur = parseFloat(b.style.marginLeft) || 0; const n = Math.max(0, Math.min(6, cur + (cmd === 'indent' ? 1.5 : -1.5))); b.style.marginLeft = n ? n + 'em' : ''; });
    markDirty();
  }

  // --- export / import
  function exportDraft() {
    readForm();
    const blob = new Blob([JSON.stringify({ kind: 'onetobeyond-letter', exported_at: new Date().toISOString(), data: S.E.data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `onetobeyond-${S.E.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('초안 파일을 내려받았어요. 다른 기기의 관리자 화면에서 ‘초안 파일 불러오기’로 이어서 편집할 수 있어요.', 6000);
  }
  async function importDraft(input) {
    const f = input.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text()); const d = j.data || j;
      if (!d || typeof d !== 'object' || !d.title) throw Error();
      if (!confirm('불러온 파일 내용으로 지금 편집 중인 내용을 바꿀까요? (저장은 ‘임시 저장’을 눌러야 돼요)')) return;
      S.E.data = normalize({ ...d, id: S.E.id }); markDirty(); paintEditor(); toast('불러왔어요. 확인 후 ‘임시 저장’을 눌러 주세요.');
    } catch { toast('초안 파일을 읽지 못했어요.'); }
  }

  // ============================================================ contacts
  async function loadContacts() {
    const [c, g] = await Promise.all([sb.api('/rest/v1/contacts?select=*&order=created_at.desc'), sb.api('/rest/v1/contact_groups?select=name&order=name')]);
    S.contacts = c || []; S.groups = (g || []).map(x => x.name);
  }
  async function renderContacts() { loading('contacts'); try { await loadContacts(); } catch (e) { return failed('contacts', e); } paintContacts(); }
  function contactForm(c) {
    const isNew = !c.id;
    return `<div class="card" id="cform"><h3>${isNew ? '연락처 추가' : '연락처 수정'}</h3><form data-f="contact" novalidate>
<div class="two"><div><label class="form-label" for="c-n">이름</label><input id="c-n" name="name" maxlength="60" value="${esc(c.name)}"></div><div><label class="form-label" for="c-e">이메일</label><input id="c-e" name="email" type="email" inputmode="email" autocapitalize="off" maxlength="200" value="${esc(c.email)}" required></div></div>
<label class="form-label">그룹</label><div class="chips">${S.groups.length ? S.groups.map(g => `<label class="chip ${(c.groups || []).includes(g) ? 'on' : ''}"><input type="checkbox" name="groups" value="${esc(g)}" ${(c.groups || []).includes(g) ? 'checked' : ''} hidden>${esc(g)}</label>`).join('') : '<span class="help">아래에서 그룹을 먼저 만들어 주세요.</span>'}</div>
<label class="form-label" for="c-note">관리자용 노트 (본인에게 보이지 않아요)</label><textarea id="c-note" name="note" rows="3" maxlength="2000">${esc(c.note)}</textarea>
<div class="form-error" role="alert" id="c-err"></div>
<div class="row-actions"><button class="btn small" type="submit">저장</button><button class="btn secondary small" type="button" data-a="contact-cancel">취소</button>${isNew ? '' : '<button class="btn danger small" type="button" data-a="contact-del">삭제</button>'}</div></form></div>`;
  }
  function paintContacts() {
    const q = S.contactQuery.toLowerCase(), g = S.contactGroup;
    const list = S.contacts.filter(c => (!g || (g === '__new' ? c.is_new : (c.groups || []).includes(g))) && (!q || (c.name + ' ' + c.email + ' ' + c.note).toLowerCase().includes(q)));
    const newCount = S.contacts.filter(c => c.is_new).length;
    root().innerHTML = shell(`<h1>주소록</h1><p class="lead">총 ${S.contacts.length}명 · 사이트의 ‘새 소식 받기’로 신청한 분은 <span class="pill new">새 구독자</span>로 표시돼요.</p>
${S.contactEdit ? contactForm(S.contactEdit) : '<button class="btn" data-a="contact-new">＋ 연락처 추가</button>'}
<label class="form-label" for="c-q">검색</label><input id="c-q" data-a-input="contact-q" value="${esc(S.contactQuery)}" placeholder="이름, 이메일, 노트">
<div class="chips"><button class="chip ${!g ? 'on' : ''}" data-a="cgroup" data-g="">전체 ${S.contacts.length}</button>${newCount ? `<button class="chip ${g === '__new' ? 'on' : ''}" data-a="cgroup" data-g="__new">새 구독자 ${newCount}</button>` : ''}${S.groups.map(x => `<button class="chip ${g === x ? 'on' : ''}" data-a="cgroup" data-g="${esc(x)}">${esc(x)} ${S.contacts.filter(c => (c.groups || []).includes(x)).length}</button>`).join('')}</div>
<div>${list.map(c => `<div class="contact"><div class="c-main"><b>${esc(c.name || '(이름 없음)')}</b> ${c.is_new ? '<span class="pill new">새 구독자</span>' : ''}<div class="em">${esc(c.email)}</div><div>${(c.groups || []).map(x => `<span class="pill">${esc(x)}</span>`).join('')}</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}</div><button class="btn secondary small" data-a="contact-edit" data-id="${esc(c.id)}">수정</button></div>`).join('') || '<p class="lead" style="margin-top:16px">해당하는 연락처가 없어요.</p>'}</div>
<h2>그룹 관리</h2><form data-f="group" class="inline-form" novalidate><input name="g" maxlength="40" placeholder="새 그룹 이름 (예: 교회, 가족)" aria-label="새 그룹 이름"><button class="btn small" type="submit">추가</button></form>
<div class="chips" style="margin-top:12px">${S.groups.map(x => `<span class="chip">${esc(x)} <button data-a="group-del" data-g="${esc(x)}" aria-label="${esc(x)} 그룹 삭제" style="background:none;border:0;color:#b54132;padding:0 0 0 6px">×</button></span>`).join('')}</div>`, 'contacts');
  }
  async function saveContact(form) {
    const d = new FormData(form), email = String(d.get('email') || '').trim().toLowerCase();
    const err = m => { $('#c-err').textContent = m; };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('이메일 주소를 확인해 주세요.');
    const body = { name: String(d.get('name') || '').trim(), email, note: String(d.get('note') || ''), groups: d.getAll('groups').map(String), is_new: false };
    try {
      if (S.contactEdit.id) await sb.api(`/rest/v1/contacts?id=eq.${S.contactEdit.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await sb.api('/rest/v1/contacts', { method: 'POST', body: JSON.stringify(body) });
      S.contactEdit = null; await loadContacts(); paintContacts(); toast('저장했어요.');
    } catch (e) { err(/duplicate|unique/i.test(errText(e)) ? '이미 등록된 이메일이에요.' : '저장하지 못했어요: ' + errText(e)); }
  }
  async function deleteContact() {
    if (!confirm('이 연락처를 삭제할까요?')) return;
    try { await sb.api(`/rest/v1/contacts?id=eq.${S.contactEdit.id}`, { method: 'DELETE' }); S.contactEdit = null; await loadContacts(); paintContacts(); toast('삭제했어요.'); }
    catch (e) { toast('삭제하지 못했어요: ' + errText(e)); }
  }
  async function addGroup(form) {
    const name = String(new FormData(form).get('g') || '').trim();
    if (!name) return; if (S.groups.includes(name)) return toast('이미 있는 그룹이에요.');
    try { await sb.api('/rest/v1/contact_groups', { method: 'POST', body: JSON.stringify({ name }) }); S.groups.push(name); S.groups.sort(); paintContacts(); }
    catch (e) { toast('그룹을 만들지 못했어요: ' + errText(e)); }
  }
  async function deleteGroup(name) {
    const members = S.contacts.filter(c => (c.groups || []).includes(name));
    if (!confirm(`‘${name}’ 그룹을 삭제할까요?${members.length ? ` (${members.length}명은 주소록에 그대로 남아요)` : ''}`)) return;
    try {
      for (const c of members) await sb.api(`/rest/v1/contacts?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ groups: c.groups.filter(x => x !== name) }) });
      await sb.api(`/rest/v1/contact_groups?name=eq.${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (S.contactGroup === name) S.contactGroup = '';
      await loadContacts(); paintContacts();
    } catch (e) { toast('삭제하지 못했어요: ' + errText(e)); }
  }

  // ============================================================ send
  async function renderSend() {
    loading('send');
    try { await Promise.all([loadLetters(), loadContacts(), sb.api('/rest/v1/sends?select=*&order=created_at.desc&limit=20').then(r => { S.sends = r || []; })]); }
    catch (e) { return failed('send', e); }
    const pubs = orderedLetters().filter(l => S.published[l.id]);
    const first = pubs.find(l => l.id === S.settings.featured) || pubs[0];
    if (!S.send || !pubs.some(l => l.id === S.send.letterId)) S.send = { letterId: first ? first.id : '', groups: [], excluded: new Set(), subject: '', message: '사랑하는 동역자 여러분,\n새 기도편지를 전합니다. 아래 버튼을 눌러 읽어 주세요.\n함께 기도해 주셔서 감사합니다.' };
    if (!S.send.subject) S.send.subject = defaultSubject();
    paintSend();
  }
  function defaultSubject() { const l = S.published[S.send.letterId]; return l ? `[One to Beyond] 기도편지 No. ${l.data.issue} — ${String(l.data.title).replace(/\n/g, ' ')}` : '[One to Beyond] 새 소식'; }
  const pool = () => S.contacts.filter(c => !S.send.groups.length || S.send.groups.some(g => (c.groups || []).includes(g)));
  const recipients = () => pool().filter(c => !S.send.excluded.has(c.id));
  function paintSend() {
    const s = S.send, pubs = orderedLetters().filter(l => S.published[l.id]), list = pool(), n = recipients().length;
    root().innerHTML = shell(`<h1>알림 발송</h1><p class="lead">공개된 소식지를 이메일로 알려요. 받는 사람은 기본으로 전체가 선택돼 있어요.</p>
${pubs.length ? '' : '<div class="banner">먼저 소식지를 ‘공개 반영’해 주세요.</div>'}
<label class="form-label" for="s-letter">보낼 소식지</label><select id="s-letter" data-a-change="send-letter">${pubs.map(l => `<option value="${esc(l.id)}" ${l.id === s.letterId ? 'selected' : ''}>No. ${esc(l.data.issue)} · ${esc(String(l.data.title).replace(/\n/g, ' '))}</option>`).join('')}</select>
<label class="form-label" for="s-subj">메일 제목</label><input id="s-subj" data-a-input="send-subject" maxlength="200" value="${esc(s.subject)}">
<label class="form-label" for="s-msg">메시지</label><textarea id="s-msg" data-a-input="send-message" rows="5" maxlength="5000">${esc(s.message)}</textarea>
<h2>받는 사람</h2><div class="chips"><button class="chip ${!s.groups.length ? 'on' : ''}" data-a="sgroup" data-g="">전체</button>${S.groups.map(g => `<button class="chip ${s.groups.includes(g) ? 'on' : ''}" data-a="sgroup" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>
<p class="count-line">${n}명에게 보내요${s.excluded.size ? ` <span class="muted" style="font-weight:400">(${[...s.excluded].filter(id => list.some(c => c.id === id)).length}명 제외)</span>` : ''}</p>
<div class="row-actions"><button class="btn secondary small" data-a="sall" data-v="1">모두 선택</button><button class="btn secondary small" data-a="sall" data-v="0">모두 해제</button></div>
<div>${list.map(c => `<label class="contact"><input type="checkbox" data-a-change="sone" data-id="${esc(c.id)}" ${s.excluded.has(c.id) ? '' : 'checked'}><span class="c-main"><b>${esc(c.name || '(이름 없음)')}</b><span class="em" style="display:block">${esc(c.email)}</span></span></label>`).join('') || '<p class="lead">주소록이 비어 있어요.</p>'}</div>
<div class="row-actions" style="margin-top:22px"><button class="btn secondary" data-a="send-preview">미리보기</button><button class="btn" data-a="send-go" ${!n || !s.letterId ? 'disabled' : ''}>이메일 보내기 (${n}명)</button></div>
<h2>카카오톡</h2><p class="lead">아래 버튼을 누르면 휴대폰 공유 창이 열려요. 카카오톡을 골라 친구나 단톡방을 직접 선택해 보내세요. 관리자가 한 번에 자동 발송하는 기능은 카카오 비즈메시지 계약이 필요해서 아직 연결되지 않았어요.</p>
<button class="btn secondary" data-a="kakao" ${s.letterId ? '' : 'disabled'}>카카오톡으로 공유하기</button>
<h2>보낸 기록</h2><div class="history">${S.sends.map(x => `<div><b>${esc(x.subject)}</b><br><span class="muted">${esc(fmt(x.created_at))} · ${x.sent_count}/${x.recipient_count}명 · ${x.status === 'sent' ? '완료' : x.status === 'partial' ? '일부 실패' : '실패'}</span></div>`).join('') || '<p class="muted">아직 보낸 기록이 없어요.</p>'}</div>`, 'send');
  }
  function letterLink() { return `${SITE}/?letter=${encodeURIComponent(S.send.letterId)}`; }
  function sendPreview() {
    const s = S.send, l = S.published[s.letterId]?.data || {}, r = recipients();
    $('#modal-root').innerHTML = `<div class="modal-shell" data-a="close-modal"><section class="modal wide" role="dialog" aria-modal="true" aria-label="발송 미리보기"><button class="close" data-a="close-modal" aria-label="닫기">×</button><h2>발송 미리보기</h2>
<p class="help">받는 사람 ${r.length}명: ${esc(r.slice(0, 8).map(c => c.name || c.email).join(', '))}${r.length > 8 ? ` 외 ${r.length - 8}명` : ''}</p>
<p><b>제목:</b> ${esc(s.subject)}</p><div class="email-preview">${esc('(이름) 님께,\n\n' + s.message)}\n\n<b>${esc(String(l.title || '').replace(/\n/g, ' '))}</b>\n${esc(String(l.subtitle || '').replace(/\n/g, ' '))}\n\n[기도편지 읽기 →] ${esc(letterLink())}</div></section></div>`;
  }
  async function sendGo() {
    const s = S.send, r = recipients();
    if (!r.length) return;
    if (!s.subject.trim()) return toast('메일 제목을 적어 주세요.');
    if (!confirm(`${r.length}명에게 이메일을 보낼까요?`)) return;
    const btn = $('[data-a="send-go"]'); if (btn) { btn.disabled = true; btn.textContent = '보내는 중…'; }
    try {
      const res = await sb.fn('send-newsletter', { letter_id: s.letterId, subject: s.subject, message: s.message, contact_ids: r.map(c => c.id) });
      toast(`${res.sent}/${res.total}명에게 보냈어요.${res.failed ? ' 일부는 실패했어요.' : ''}`, 6000);
      S.send.subject = ''; renderSend();
    } catch (e) {
      const m = errText(e);
      toast(e.status === 404 || /not found/i.test(m) ? '이메일 발송 기능(send-newsletter)이 아직 설치되지 않았어요. README의 ‘이메일 발송 켜기’를 따라 주세요.' : '보내지 못했어요: ' + m, 8000);
      if (btn) { btn.disabled = false; btn.textContent = `이메일 보내기 (${r.length}명)`; }
    }
  }
  async function kakao() {
    const l = S.published[S.send.letterId]?.data || {};
    const text = `${S.send.message}\n\n${String(l.title || '').replace(/\n/g, ' ')}`;
    if (navigator.share) { try { await navigator.share({ title: String(l.title || '').replace(/\n/g, ' '), text, url: letterLink() }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text + '\n' + letterLink()); toast('내용과 링크를 복사했어요. 카카오톡 대화방에 붙여넣어 주세요.'); }
    catch { toast('복사가 지원되지 않아요. 휴대폰에서 다시 시도해 주세요.'); }
  }

  // ============================================================ posts (마음 나눔)
  async function renderPosts() {
    loading('posts');
    try { S.posts = await sb.api('/rest/v1/posts?select=id,name,body,kind,visibility,letter_id,created_at&order=created_at.desc&limit=300') || []; await loadLetters(); }
    catch (e) { return failed('posts', e); }
    const title = id => { const l = S.letters.find(x => x.id === id); return l ? `No. ${l.data.issue}` : id; };
    root().innerHTML = shell(`<h1>마음 나눔</h1><p class="lead">방문자가 Google로 로그인해 남긴 글이에요. <span class="pill">비공개</span> 글은 쓴 사람과 관리자만 볼 수 있어요.</p>
${S.posts.map(p => `<div class="contact"><div class="c-main"><b>${esc(p.name)}</b> <span class="pill">${p.kind === 'prayer' ? '기도제목' : '안부·나눔'}</span>${p.visibility === 'private' ? '<span class="pill warn">비공개</span>' : ''}<div class="em">${esc(title(p.letter_id))} · ${esc(fmt(p.created_at))}</div><div class="note" style="color:var(--ink);font-size:14px">${esc(p.body)}</div></div><button class="btn danger small" data-a="post-del" data-id="${esc(p.id)}">삭제</button></div>`).join('') || '<p class="lead">아직 남겨진 글이 없어요.</p>'}`, 'posts');
  }
  async function deletePost(id) {
    if (!confirm('이 글을 삭제할까요?')) return;
    try { await sb.api(`/rest/v1/posts?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }); renderPosts(); toast('삭제했어요.'); } catch (e) { toast('삭제하지 못했어요: ' + errText(e)); }
  }

  // ============================================================ settings
  async function renderSettings() {
    loading('settings');
    try { S.admins = (await sb.api('/rest/v1/admins?select=email&order=email') || []).map(a => a.email); } catch (e) { return failed('settings', e); }
    root().innerHTML = shell(`<h1>설정</h1>
<h2>관리자 이메일</h2><p class="lead">여기 있는 Google 계정으로 사이트의 ‘마음 나눔’에 로그인하면 비공개 글도 보이고 지울 수 있어요.</p>
${S.admins.map(e => `<div class="contact"><div class="c-main"><b>${esc(e)}</b>${e === LOGIN_EMAIL ? '<div class="em">접속 코드 로그인용 계정 (삭제 불가)</div>' : ''}</div>${e === LOGIN_EMAIL ? '' : `<button class="btn danger small" data-a="admin-del" data-e="${esc(e)}">삭제</button>`}</div>`).join('')}
<form data-f="admin-add" class="inline-form" novalidate style="margin-top:14px"><input name="e" type="email" inputmode="email" autocapitalize="off" placeholder="추가할 Google 이메일" aria-label="추가할 관리자 이메일"><button class="btn small" type="submit">추가</button></form>
<h2>접속 코드 바꾸기</h2><p class="lead">바꾸면 다른 기기에서는 새 코드로 다시 로그인해야 해요. 6자 이상으로 정해 주세요.</p>
<form data-f="code-change" novalidate><input name="c1" type="password" autocomplete="new-password" placeholder="새 접속 코드" aria-label="새 접속 코드"><input name="c2" type="password" autocomplete="new-password" placeholder="한 번 더" aria-label="새 접속 코드 확인" style="margin-top:8px"><div class="form-error" role="alert" id="code-err"></div><button class="btn small" type="submit">코드 바꾸기</button></form>
<h2>로그아웃</h2><button class="btn secondary" data-a="logout">이 기기에서 로그아웃</button>`, 'settings');
  }
  async function addAdmin(form) {
    const e = String(new FormData(form).get('e') || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return toast('이메일 주소를 확인해 주세요.');
    try { await sb.api('/rest/v1/admins', { method: 'POST', body: JSON.stringify({ email: e }) }); renderSettings(); toast('관리자를 추가했어요.'); }
    catch (err) { toast('추가하지 못했어요: ' + errText(err)); }
  }
  async function delAdmin(e) {
    if (e === LOGIN_EMAIL || !confirm(`${e} 관리자를 삭제할까요?`)) return;
    try { await sb.api(`/rest/v1/admins?email=eq.${encodeURIComponent(e)}`, { method: 'DELETE' }); renderSettings(); } catch (err) { toast('삭제하지 못했어요: ' + errText(err)); }
  }
  async function changeCode(form) {
    const d = new FormData(form), a = String(d.get('c1') || ''), b = String(d.get('c2') || '');
    const err = m => { $('#code-err').textContent = m; };
    if (a.length < 6) return err('6자 이상으로 정해 주세요.');
    if (a !== b) return err('두 번 입력한 코드가 달라요.');
    try { await sb.api('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: a }) }); form.reset(); err(''); toast('접속 코드를 바꿨어요.'); }
    catch (e) { err('바꾸지 못했어요: ' + errText(e)); }
  }

  // ============================================================ router
  async function route() {
    closePreview();
    if (!sb.enabled || !sb.hasSession()) return renderLogin();
    if (!(await sb.session())) return renderLogin('다시 로그인해 주세요.');
    const h = location.hash.replace(/^#/, '') || 'letters';
    if (S.E && S.E.dirty && !h.startsWith('edit/' + S.E.id)) { readForm(); writeLocal(); }
    if (!h.startsWith('edit/')) S.E = null;
    S.route = h;
    if (h.startsWith('edit/')) return openEditor(decodeURIComponent(h.slice(5)));
    if (h === 'contacts') return renderContacts();
    if (h === 'send') return renderSend();
    if (h === 'posts') return renderPosts();
    if (h === 'settings') return renderSettings();
    return renderLetters();
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', e => { if (S.E && S.E.dirty) { readForm(); writeLocal(); e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.E && S.E.dirty) { readForm(); writeLocal(); } });

  // ============================================================ events
  document.addEventListener('mousedown', e => { if (e.target.closest('.rt-bar button')) e.preventDefault(); });
  document.addEventListener('click', e => {
    const cmdBtn = e.target.closest('.rt-bar button[data-cmd]');
    if (cmdBtn) { e.preventDefault(); return runCmd(cmdBtn); }
    const chip = e.target.closest('label.chip'); if (chip) { setTimeout(() => chip.classList.toggle('on', chip.querySelector('input').checked), 0); }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'close-modal') { if (e.target === b || b.classList.contains('close')) { $('#modal-root').innerHTML = ''; } return; }
    e.preventDefault();
    ({
      reload: route, 'new-letter': () => { location.hash = '#edit/new'; },
      move: () => moveLetter(b.dataset.id, Number(b.dataset.d)), feature: () => feature(b.dataset.id),
      save: () => saveDraft(), publish, preview, 'close-preview': closePreview, unpublish, 'delete-letter': deleteLetter,
      restore: () => { S.E.data = normalize(S.E.restore.data); S.E.restore = null; markDirty(); paintEditor(); toast('수정본을 불러왔어요. ‘임시 저장’을 눌러 저장해 주세요.'); },
      'discard-local': () => { clearLocal(S.E.id); S.E.restore = null; paintEditor(); },
      'blk-add': () => restructure(d => { if (b.dataset.kind === 'sections') d.sections.push({ title: '새 이야기', html: '<p><br></p>', photos: [] }); else d.prayers.push({ title: '', body: '' }); }),
      'blk-del': () => { if (confirm('삭제할까요?')) restructure(d => d[b.dataset.kind].splice(Number(b.dataset.i), 1)); },
      'blk-move': () => restructure(d => { const L = d[b.dataset.kind], i = Number(b.dataset.i), j = i + Number(b.dataset.d); if (j >= 0 && j < L.length) [L[i], L[j]] = [L[j], L[i]]; }),
      'ph-del': () => restructure(() => getList(b.dataset.b).splice(Number(b.dataset.j), 1)),
      'ph-move': () => restructure(() => { const L = getList(b.dataset.b), i = Number(b.dataset.j), j = i + Number(b.dataset.d); if (j >= 0 && j < L.length) [L[i], L[j]] = [L[j], L[i]]; }),
      pick: () => pickPhoto(b.dataset.k), picked: () => { $('#modal-root').innerHTML = ''; restructure(d => { d[b.dataset.k] = b.dataset.u; }); },
      'clear-photo': () => restructure(d => { d[b.dataset.k] = ''; }),
      'yt-default': () => restructure(d => { d.youtube = clone(DEFAULT_YT); }),
      export: exportDraft,
      'contact-new': () => { S.contactEdit = { name: '', email: '', note: '', groups: [] }; paintContacts(); $('#c-n')?.focus(); },
      'contact-edit': () => { S.contactEdit = clone(S.contacts.find(c => c.id === b.dataset.id)); paintContacts(); scrollTo(0, 0); $('#c-n')?.focus(); },
      'contact-cancel': () => { S.contactEdit = null; paintContacts(); }, 'contact-del': deleteContact,
      cgroup: () => { S.contactGroup = b.dataset.g; paintContacts(); }, 'group-del': () => deleteGroup(b.dataset.g),
      sgroup: () => { const g = b.dataset.g; S.send.groups = !g ? [] : S.send.groups.includes(g) ? S.send.groups.filter(x => x !== g) : [...S.send.groups, g]; paintSend(); },
      sall: () => { const on = b.dataset.v === '1'; pool().forEach(c => on ? S.send.excluded.delete(c.id) : S.send.excluded.add(c.id)); paintSend(); },
      'send-preview': sendPreview, 'send-go': sendGo, kakao,
      'post-del': () => deletePost(b.dataset.id),
      'admin-del': () => delAdmin(b.dataset.e),
      logout: async () => { await sb.signOut(); renderLogin(); },
    }[a] || (() => {}))();
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.closest && t.closest('#ed')) {
      markDirty();
      if (t.dataset.k === 'youtube.url') { const id = R.youtubeId(t.value), box = $('#yt-prev'); if (box) box.innerHTML = id ? `<img src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="영상 미리보기"><a class="btn secondary small" href="https://www.youtube.com/watch?v=${esc(id)}" target="_blank" rel="noopener">영상 열기 ↗</a>` : '<p class="help">YouTube 링크를 확인해 주세요.</p>'; }
      return;
    }
    const k = t.dataset?.aInput;
    if (k === 'contact-q') { S.contactQuery = t.value; const pos = t.selectionStart; paintContacts(); const q = $('#c-q'); q.focus(); q.setSelectionRange(pos, pos); }
    if (k === 'send-subject') S.send.subject = t.value;
    if (k === 'send-message') S.send.message = t.value;
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset?.upload) { uploadFiles(t).finally(() => { t.value = ''; }); return; }
    if (t.dataset?.import) { importDraft(t).finally(() => { t.value = ''; }); return; }
    if (t.matches('.rt-bar select[data-cmd]')) return runCmd(t);
    const k = t.dataset?.aChange;
    if (k === 'send-letter') { S.send.letterId = t.value; S.send.subject = defaultSubject(); paintSend(); }
    if (k === 'sone') { t.checked ? S.send.excluded.delete(t.dataset.id) : S.send.excluded.add(t.dataset.id); paintSend(); }
  });
  document.addEventListener('paste', e => {
    const ed = e.target.closest?.('[data-rich]'); if (!ed) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  document.addEventListener('submit', e => {
    const f = e.target.dataset?.f; if (!f) return;
    e.preventDefault();
    ({ login: () => login(e.target), contact: () => saveContact(e.target), group: () => { addGroup(e.target); }, 'admin-add': () => addAdmin(e.target), 'code-change': () => changeCode(e.target) }[f] || (() => {}))();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('.preview-shell')) closePreview(); else $('#modal-root').innerHTML = ''; } if ((e.metaKey || e.ctrlKey) && e.key === 's' && S.E) { e.preventDefault(); saveDraft(); } });

  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}
  route();
})();
