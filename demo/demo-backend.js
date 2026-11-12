'use strict';
// Offline demo backend: pretends to be Supabase inside the browser.
// Everything is stored in localStorage of this file only. Nothing is sent anywhere.
(function () {
  const BASE = 'https://demo.onetobeyond.invalid';
  const DB_KEY = 'otb-demo-db-v1';
  const DEMO_CODE = '1234';
  const ADMIN_EMAIL = 'admin@onetobeyond.org';
  const SEED = (window.parent && window.parent.OTB_DEMO_SEED) || window.OTB_DEMO_SEED;

  window.OTB_DEMO = true;
  window.OTB_CONFIG = { supabaseUrl: BASE, supabaseAnonKey: 'demo', adminLoginEmail: ADMIN_EMAIL };

  // about:srcdoc pages may refuse URL changes; keep the apps working anyway.
  for (const fn of ['replaceState', 'pushState']) {
    const orig = history[fn].bind(history);
    history[fn] = (s, t, url) => { try { orig(s, t, url); } catch { try { orig(s, t, String(url || '').replace(/^[^#]*/, '')); } catch {} } };
  }

  const pk = { letter_drafts: 'id', letters_published: 'id', site_settings: 'key', contacts: 'id', contact_groups: 'name', sends: 'id', posts: 'id', admins: 'email' };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  const now = () => new Date().toISOString();

  function seedDb() {
    const L = SEED.letters;
    return {
      letter_drafts: L.map(l => ({ id: l.id, data: l, updated_at: now() })),
      letters_published: L.map(l => ({ id: l.id, data: l, published_at: now() })),
      site_settings: [{ key: 'featured', value: SEED.settings.featured }, { key: 'order', value: SEED.settings.order }],
      contacts: [
        { id: uuid(), name: '김집사', email: 'kim@example.com', note: '매주 수요예배 중보', groups: ['교회'], source: 'admin', is_new: false, created_at: now() },
        { id: uuid(), name: '이권사', email: 'lee@example.com', note: '', groups: ['교회', '가족'], source: 'admin', is_new: false, created_at: now() },
        { id: uuid(), name: '박선교사', email: 'park@example.com', note: '아비장 동역 선교사', groups: ['선교사'], source: 'admin', is_new: false, created_at: now() },
        { id: uuid(), name: '최성도', email: 'choi@example.com', note: '', groups: [], source: 'subscribe', is_new: true, created_at: now() },
      ],
      contact_groups: [{ name: '가족' }, { name: '교회' }, { name: '선교사' }],
      sends: [],
      posts: [
        { id: uuid(), user_id: 'g-sample', name: '김집사', body: '첫 편지 감사히 읽었습니다.\n가정의 건강을 위해 기도할게요!', kind: 'sharing', visibility: 'public', letter_id: L[0].id, created_at: now() },
        { id: uuid(), user_id: 'g-sample2', name: '이권사', body: '은행 계좌 문제가 잘 해결되도록 함께 기도합니다.', kind: 'prayer', visibility: 'private', letter_id: L[0].id, created_at: now() },
      ],
      admins: [{ email: ADMIN_EMAIL }, { email: 'family@example.com' }],
    };
  }
  function load() { try { const d = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); if (d) return d; } catch {} const d = seedDb(); save(d); return d; }
  function save(d) { try { localStorage.setItem(DB_KEY, JSON.stringify(d)); return true; } catch { return false; } }

  // tokens: "admin" for the access-code account, "g:<name>" for demo Google visitors
  function who(headers) {
    const a = (headers.get('authorization') || '').replace(/^Bearer\s+/, '');
    if (a === 'demo-admin') return { id: 'admin', email: ADMIN_EMAIL, admin: true, meta: {} };
    if (a.startsWith('demo-g:')) { const name = decodeURIComponent(a.slice(7)); return { id: 'g-' + name, email: name + '@gmail.com', admin: false, meta: { full_name: name } }; }
    return null;
  }
  const res = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  function match(rows, params) {
    return rows.filter(r => [...params].every(([k, v]) => {
      if (['select', 'order', 'limit'].includes(k)) return true;
      if (v.startsWith('eq.')) return String(r[k]) === decodeURIComponent(v.slice(3));
      if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(r[k]));
      return true;
    }));
  }
  function sortRows(rows, order) {
    if (!order) return rows;
    const [col, dir] = order.split('.');
    return [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
  }
  function canRead(table, row, user) {
    if (table === 'posts') return row.visibility === 'public' || (user && (user.admin || row.user_id === user.id));
    if (['letters_published', 'site_settings'].includes(table)) return true;
    return !!(user && user.admin);
  }

  async function handle(url, init) {
    const u = new URL(url), path = u.pathname, method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || {});
    const user = who(headers);
    const body = init.body;
    await new Promise(r => setTimeout(r, 120)); // feel like a network

    if (path === '/auth/v1/token') {
      const b = JSON.parse(body || '{}');
      if (u.searchParams.get('grant_type') === 'refresh_token') return res({ access_token: 'demo-admin', refresh_token: 'r', expires_in: 3600 });
      if (b.email === ADMIN_EMAIL && b.password === (localStorage.getItem('otb-demo-code') || DEMO_CODE)) return res({ access_token: 'demo-admin', refresh_token: 'r', expires_in: 3600 });
      return res({ error_description: 'Invalid login credentials' }, 400);
    }
    if (path === '/auth/v1/user' && method === 'PUT') { const b = JSON.parse(body || '{}'); if (b.password) localStorage.setItem('otb-demo-code', b.password); return res({ id: 'admin' }); }
    if (path === '/auth/v1/user') return user ? res({ id: user.id, email: user.email, user_metadata: user.meta }) : res({ message: 'no session' }, 401);
    if (path === '/auth/v1/settings') return res({ external: { google: true, email: true } });
    if (path === '/auth/v1/logout') return res(null, 204);
    if (path === '/rest/v1/rpc/is_admin') return res(!!(user && user.admin));
    if (path === '/functions/v1/send-newsletter') {
      if (!user || !user.admin) return res({ error: '관리자만 보낼 수 있어요.' }, 403);
      const b = JSON.parse(body); const db = load();
      db.sends.unshift({ id: uuid(), letter_id: b.letter_id, subject: b.subject, message: b.message, recipient_count: b.contact_ids.length, sent_count: b.contact_ids.length, status: 'sent', created_at: now() });
      save(db);
      return res({ sent: b.contact_ids.length, total: b.contact_ids.length, demo: true });
    }
    if (path.startsWith('/storage/')) return res({ message: 'demo upload handled in page' }, 400);

    const db = load();
    if (path === '/rest/v1/rpc/subscribe') {
      const b = JSON.parse(body || '{}'), email = String(b.p_email || '').trim().toLowerCase();
      if (!db.contacts.some(c => c.email === email)) db.contacts.unshift({ id: uuid(), name: String(b.p_name || '').slice(0, 60), email, note: '', groups: [], source: 'subscribe', is_new: true, created_at: now() });
      save(db); return res(null, 204);
    }
    const table = path.replace('/rest/v1/', '');
    if (!db[table]) return res({ message: 'unknown table' }, 404);
    const params = u.searchParams;
    if (method === 'GET') return res(sortRows(match(db[table], params).filter(r => canRead(table, r, user)), params.get('order')).slice(0, Number(params.get('limit')) || undefined));

    const writable = user && (user.admin || table === 'posts');
    if (!writable) return res({ message: '권한이 없어요 (RLS)' }, 403);
    if (method === 'POST') {
      let rows = JSON.parse(body); rows = Array.isArray(rows) ? rows : [rows];
      const out = [];
      for (const row of rows) {
        if (table === 'posts') Object.assign(row, { id: uuid(), user_id: user.id, created_at: now() });
        if (table === 'contacts') {
          if (db.contacts.some(c => c.email === row.email)) return res({ message: 'duplicate key value violates unique constraint' }, 409);
          Object.assign(row, { id: uuid(), created_at: now(), groups: row.groups || [], source: row.source || 'admin' });
        }
        if (table === 'contact_groups' && db.contact_groups.some(g => g.name === row.name)) return res({ message: 'duplicate key' }, 409);
        const i = db[table].findIndex(r => r[pk[table]] === row[pk[table]]);
        if (i >= 0) db[table][i] = { ...db[table][i], ...row }; else db[table].push(row);
        out.push(i >= 0 ? db[table][i] : row);
      }
      if (!save(db)) return res({ message: '데모 저장 공간이 가득 찼어요. 위의 ‘처음 상태로’를 눌러 주세요.' }, 507);
      return (headers.get('prefer') || '').includes('return=representation') ? res(out, 201) : res(null, 201);
    }
    const targets = match(db[table], params).filter(r => table !== 'posts' || user.admin || r.user_id === user.id);
    if (method === 'PATCH') { const p = JSON.parse(body); targets.forEach(r => Object.assign(r, p)); save(db); return res(null, 204); }
    if (method === 'DELETE') {
      const del = new Set(targets); db[table] = db[table].filter(r => !del.has(r));
      if (table === 'letter_drafts') db.letters_published = db.letters_published.filter(p => !targets.some(t => t.id === p.id));
      save(db); return res(null, 204);
    }
    return res({ message: 'unsupported' }, 400);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith(BASE)) return handle(url, init);
    return realFetch(input, init);
  };

  // Photos: keep them inside the demo as small data URLs.
  window.OTB_DEMO_UPLOAD = blob => new Promise((resolve, reject) => {
    const img = new Image(), src = URL.createObjectURL(blob);
    img.onload = () => {
      const max = 1000, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(src);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(Error('사진을 읽지 못했어요.')); };
    img.src = src;
  });

  // Google sign-in for the demo: ask for a display name instead of going to Google.
  window.OTB_DEMO_GOOGLE = () => {
    const name = (prompt('데모용 Google 로그인입니다.\n표시할 이름을 입력해 주세요.', '홍길동') || '').trim();
    if (!name) return;
    localStorage.setItem('otb-session-v1', JSON.stringify({ access_token: 'demo-g:' + encodeURIComponent(name), refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 86400 }));
    location.reload();
  };

  // Links to the public site switch the demo tab instead of leaving the file.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]'); if (!a) return;
    const href = a.getAttribute('href');
    // In an embedded page "#x" links would resolve against the outer file; handle them here.
    if (href.startsWith('#') && !a.closest('[data-action]')) {
      e.preventDefault();
      const el = href.length > 1 && document.getElementById(decodeURIComponent(href.slice(1)));
      if (el) el.scrollIntoView({ behavior: 'smooth' }); else location.hash = href;
      return;
    }
    if (/^\/(\?letter=.*)?$/.test(href) && window.parent && window.parent.OTB_DEMO_SWITCH) {
      e.preventDefault(); e.stopPropagation();
      const m = /letter=([^&]+)/.exec(href);
      window.parent.OTB_DEMO_SWITCH('visitor', m ? decodeURIComponent(m[1]) : null);
    }
  }, true);
})();
