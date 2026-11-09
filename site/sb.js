'use strict';
// Minimal Supabase client (Auth + REST + Storage) over fetch — no SDK, no CDN.
(function () {
  function OTBSupabase(storageKey) {
    const cfg = window.OTB_CONFIG || {};
    const URL_ = (cfg.supabaseUrl || '').replace(/\/$/, '');
    const KEY = cfg.supabaseAnonKey || '';
    const enabled = !!(URL_ && KEY);

    const read = () => { try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; } };
    const write = s => { try { s ? localStorage.setItem(storageKey, JSON.stringify(s)) : localStorage.removeItem(storageKey); } catch {} };
    const fromToken = d => ({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600), user: d.user || null });

    let refreshing = null;
    async function session() {
      const s = read();
      if (!s) return null;
      if (s.expires_at - 60 > Date.now() / 1000) return s;
      refreshing ||= (async () => {
        try {
          const r = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
          if (!r.ok) throw Error();
          const n = fromToken(await r.json()); write(n); return n;
        } catch { write(null); return null; } finally { setTimeout(() => { refreshing = null; }, 0); }
      })();
      return refreshing;
    }

    async function errorOf(r) {
      let m = '';
      try { const j = await r.json(); m = j.message || j.msg || j.error_description || j.error || ''; } catch {}
      const e = Error(m || ('HTTP ' + r.status)); e.status = r.status; return e;
    }

    async function api(path, opts = {}) {
      const s = await session();
      const headers = { apikey: KEY, Authorization: 'Bearer ' + (s ? s.access_token : KEY), ...(opts.body && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) };
      const r = await fetch(URL_ + path, { ...opts, headers });
      if (!r.ok) throw await errorOf(r);
      if (r.status === 204) return null;
      const t = await r.text();
      return t ? JSON.parse(t) : null;
    }

    async function signInWithPassword(email, password) {
      const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (!r.ok) throw await errorOf(r);
      const s = fromToken(await r.json()); write(s); return s;
    }
    async function signOut() {
      const s = read();
      write(null);
      if (s) fetch(`${URL_}/auth/v1/logout`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + s.access_token } }).catch(() => {});
    }
    async function upload(bucket, path, blob) {
      await api(`/storage/v1/object/${bucket}/${path}`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'true', 'cache-control': '31536000' } });
      return `${URL_}/storage/v1/object/public/${bucket}/${path}`;
    }
    async function fn(name, body) {
      return api(`/functions/v1/${name}`, { method: 'POST', body: JSON.stringify(body) });
    }

    return { enabled, url: URL_, key: KEY, session, api, signInWithPassword, signOut, upload, fn, clear: () => write(null), hasSession: () => !!read() };
  }
  window.OTBSupabase = OTBSupabase;
})();
