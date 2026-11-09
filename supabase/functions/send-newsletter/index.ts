// Supabase Edge Function: send-newsletter
// Sends a letter announcement by email (via Resend) to selected contacts.
// Only callers whose login is in public.admins can use it.
//
// Secrets to set (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   — from https://resend.com (API Keys)
//   MAIL_FROM        — e.g. "One to Beyond <letters@onetobeyond.org>" (domain verified in Resend)
//   SITE_URL         — optional, defaults to https://onetobeyond.org
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const RESEND = Deno.env.get('RESEND_API_KEY');
  const FROM = Deno.env.get('MAIL_FROM');
  const SITE = (Deno.env.get('SITE_URL') || 'https://onetobeyond.org').replace(/\/$/, '');
  if (!RESEND || !FROM) return json({ error: '이메일 발송 설정(RESEND_API_KEY, MAIL_FROM)이 아직 없어요.' }, 503);

  const auth = req.headers.get('Authorization') || '';
  const rest = (path: string, init: RequestInit = {}) =>
    fetch(SUPABASE_URL + path, {
      ...init,
      headers: { apikey: ANON, Authorization: auth, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });

  try {
    const adm = await rest('/rest/v1/rpc/is_admin', { method: 'POST', body: '{}' });
    if (!adm.ok || (await adm.json()) !== true) return json({ error: '관리자만 보낼 수 있어요.' }, 403);

    const { letter_id, subject, message, contact_ids } = await req.json();
    if (!subject || typeof subject !== 'string' || subject.length > 200) return json({ error: '제목을 확인해 주세요.' }, 400);
    if (!Array.isArray(contact_ids) || !contact_ids.length) return json({ error: '받는 사람을 선택해 주세요.' }, 400);
    if (contact_ids.length > 2000) return json({ error: '한 번에 2000명까지 보낼 수 있어요.' }, 400);
    const ids = contact_ids.filter((x: unknown) => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x));

    const contacts: { name: string; email: string }[] = [];
    for (let i = 0; i < ids.length; i += 150) {
      const r = await rest(`/rest/v1/contacts?select=name,email&id=in.(${ids.slice(i, i + 150).join(',')})`);
      if (!r.ok) return json({ error: '주소록을 읽지 못했어요.' }, 500);
      contacts.push(...(await r.json()));
    }

    let title = '', subtitle = '', cover = '';
    if (letter_id) {
      const r = await rest(`/rest/v1/letters_published?select=data&id=eq.${encodeURIComponent(letter_id)}`);
      const rows = r.ok ? await r.json() : [];
      if (!rows.length) return json({ error: '공개된 소식지만 보낼 수 있어요.' }, 400);
      const d = rows[0].data;
      title = String(d.title || '').replace(/\n/g, ' ');
      subtitle = String(d.subtitle || '').replace(/\n/g, ' ');
      cover = String(d.cover || '');
      if (cover.startsWith('/')) cover = SITE + cover;
      if (!cover.startsWith('https://')) cover = '';
    }
    const link = letter_id ? `${SITE}/?letter=${encodeURIComponent(letter_id)}` : SITE;
    const msg = String(message || '');

    const html = (name: string) => `<!doctype html><html><body style="margin:0;background:#FAF9F6;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif;color:#343733">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-size:13px;letter-spacing:1px;margin:0 0 24px"><span style="color:#FF7900">/</span><span style="color:#009E60">/</span> ONE TO BEYOND</p>
${name ? `<p style="font-size:15px;margin:0 0 16px">${esc(name)} 님께,</p>` : ''}
<div style="font-size:15px;line-height:1.9;white-space:pre-line">${esc(msg)}</div>
${title ? `<div style="margin:28px 0;background:#fff;border:1px solid #E2E0D9;border-radius:8px;overflow:hidden">${cover ? `<img src="${esc(cover)}" alt="" style="display:block;width:100%;max-height:300px;object-fit:cover">` : ''}<div style="padding:20px"><p style="font-size:20px;font-weight:700;margin:0 0 8px">${esc(title)}</p><p style="font-size:14px;color:#6F746C;margin:0">${esc(subtitle)}</p></div></div>` : ''}
<p style="margin:24px 0"><a href="${esc(link)}" style="display:inline-block;background:#343733;color:#FAF9F6;text-decoration:none;padding:13px 22px;border-radius:6px;font-size:14px">기도편지 읽기 →</a></p>
<p style="font-size:12px;color:#6F746C;line-height:1.8;margin-top:36px">CÔTE D’IVOIRE · 함께 쓰는 기도편지<br>이 메일을 그만 받고 싶으시면 회신으로 알려 주세요.</p>
</div></body></html>`;

    let sent = 0;
    const failed: string[] = [];
    for (let i = 0; i < contacts.length; i += 100) {
      const batch = contacts.slice(i, i + 100).map((c) => ({
        from: FROM, to: [c.email], subject,
        html: html(c.name), text: `${c.name ? c.name + ' 님께,\n\n' : ''}${msg}\n\n${title}\n${link}`,
      }));
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify(batch),
      });
      if (r.ok) sent += batch.length; else failed.push(`${r.status} ${(await r.text()).slice(0, 200)}`);
    }

    await rest('/rest/v1/sends', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ letter_id: letter_id || null, subject, message: msg, recipient_count: contacts.length, sent_count: sent, status: failed.length ? (sent ? 'partial' : 'failed') : 'sent', error: failed.join('\n') || null }),
    });
    return json({ sent, total: contacts.length, failed: failed.length ? failed : undefined }, failed.length && !sent ? 502 : 200);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
