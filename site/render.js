'use strict';
// Shared by the public page and the admin preview so both look identical.
// Letter model:
// { id, issue, date, title, subtitle, cover, sidePhoto, intro(html), quote,
//   sections:[{title, html, photos:[{url,caption}]}], prayers:[{title, body}],
//   gallery:[{url, caption}], youtube:{url, title, description} }
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');

  // ---------- rich-text sanitizer (allowlist) ----------
  const INLINE = new Set(['B', 'STRONG', 'U', 'I', 'EM', 'SPAN', 'BR']);
  const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE']);
  const SIZE_OK = new Set(['small', 'large', 'x-large']);
  const FONT_SIZE = { 1: 'small', 2: 'small', 4: 'large', 5: 'large', 6: 'x-large', 7: 'x-large' };
  const COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i;

  function inlineStyle(el) {
    const out = [], st = el.style || {};
    const prev = { 'fs-s': 'small', 'fs-l': 'large', 'fs-xl': 'x-large' }[el.className] || '';
    const color = (st.color || el.getAttribute?.('color') || '').trim();
    if (color && COLOR_RE.test(color)) out.push('color:' + color);
    let size = (st.fontSize || '').trim() || prev;
    if (!size && el.tagName === 'FONT' && el.getAttribute('size')) size = FONT_SIZE[el.getAttribute('size')] || '';
    if (size === 'x-small') size = 'small';
    if (size === 'xx-large' || size === 'xxx-large') size = 'x-large';
    if (SIZE_OK.has(size)) out.push('size:' + size);
    if (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) out.push('font-weight:700');
    if ((st.textDecoration || st.textDecorationLine || '').includes('underline')) out.push('text-decoration:underline');
    return out.join(';');
  }
  function blockStyle(el) {
    const out = [], st = el.style || {};
    const align = (st.textAlign || el.getAttribute?.('align') || '').toLowerCase();
    if (['left', 'center', 'right'].includes(align) && align !== 'left') out.push('text-align:' + align);
    const m = /^(\d(?:\.\d+)?)em$/.exec((st.marginLeft || '').trim());
    if (m && Number(m[1]) > 0) out.push('margin-left:' + Math.min(6, Number(m[1])) + 'em');
    return out.join(';');
  }

  function sanitize(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    const out = document.createElement('div');
    let para = null;
    const flush = () => { if (para && (para.textContent.trim() || para.querySelector('br'))) out.appendChild(para); para = null; };
    const cur = () => (para ||= document.createElement('p'));

    function inline(node, parent) {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) { parent.appendChild(document.createTextNode(n.nodeValue)); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName;
        if (tag === 'BR') { parent.appendChild(document.createElement('br')); continue; }
        if (BLOCK.has(tag)) { inline(n, parent); parent.appendChild(document.createElement('br')); continue; }
        if (INLINE.has(tag) || tag === 'FONT') {
          const raw = inlineStyle(n).split(';').filter(Boolean);
          const sizeTok = raw.find(x => x.startsWith('size:'));
          const style = raw.filter(x => !x.startsWith('size:')).join(';');
          const cls = sizeTok ? ({ small: 'fs-s', large: 'fs-l', 'x-large': 'fs-xl' })[sizeTok.slice(5)] : '';
          const map = { B: 'strong', STRONG: 'strong', U: 'u', I: 'em', EM: 'em' };
          let target = parent;
          if (map[tag]) { const el = document.createElement(map[tag]); parent.appendChild(el); target = el; }
          if (style || cls) { const s = document.createElement('span'); if (style) s.setAttribute('style', style); if (cls) s.className = cls; target.appendChild(s); target = s; }
          inline(n, target);
          continue;
        }
        inline(n, parent); // unknown tag: keep its text only
      }
    }
    function walk(node) {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 1 && BLOCK.has(n.tagName)) {
          const hasBlockKids = [...n.children].some(c => BLOCK.has(c.tagName));
          if (hasBlockKids) { flush(); walk(n); continue; }
          flush();
          const p = document.createElement('p');
          const bs = blockStyle(n);
          if (bs) p.setAttribute('style', bs);
          inline(n, p);
          while (p.lastChild && p.lastChild.nodeName === 'BR' && p.childNodes.length > 1) p.removeChild(p.lastChild);
          if (p.textContent.trim()) out.appendChild(p);
        } else if (n.nodeType === 1 && /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE|svg|SVG|MATH|IMG|VIDEO|AUDIO)$/.test(n.tagName)) {
          continue;
        } else {
          const wrapper = document.createElement('div'); wrapper.appendChild(n.cloneNode(true));
          inline(wrapper, cur());
        }
      }
      flush();
    }
    walk(doc.body);
    return out.innerHTML;
  }

  // Plain text → paragraphs (used for content without markup)
  const textToHtml = t => String(t || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');

  // ---------- YouTube ----------
  function youtubeId(url) {
    if (!url) return '';
    try {
      const u = new URL(url.trim());
      if (/(^|\.)youtu\.be$/.test(u.hostname)) return u.pathname.slice(1).split('/')[0];
      if (/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)) {
        if (u.searchParams.get('v')) return u.searchParams.get('v');
        const m = /^\/(shorts|embed|live|v)\/([\w-]{6,})/.exec(u.pathname);
        if (m) return m[2];
      }
    } catch {}
    return /^[\w-]{11}$/.test(url.trim()) ? url.trim() : '';
  }
  const safeUrl = u => /^(https:\/\/|\/(?!\/))/.test(String(u || '')) ? String(u) : '';

  // ---------- letter page ----------
  // ctx: { react(type,id,label) -> html, share() -> html }
  function letterHTML(l, ctx) {
    const a = esc;
    const react = ctx.react || (() => ''), share = ctx.share || (() => '');
    const sections = l.sections || [], prayers = l.prayers || [], gallery = (l.gallery || []).filter(g => safeUrl(g.url));
    const side = safeUrl(l.sidePhoto) || (gallery[0] && gallery[0].url) || safeUrl(l.cover);
    const yt = l.youtube && youtubeId(l.youtube.url);
    const date = String(l.date || '');
    return `
<section class="hero"><div class="hero-copy"><div class="eyebrow">LETTRE DE PRIÈRE · NO. ${a(pad(l.issue || 1))}</div><h1>${a(l.title)}</h1><p class="hero-sub">${a(l.subtitle)}</p><a class="btn" href="#letter">편지 읽기 ↓</a><p class="hero-date">${a(date.replaceAll('-', '. '))} &nbsp;·&nbsp; ABIDJAN, CÔTE D’IVOIRE</p></div>${safeUrl(l.cover) ? `<figure class="hero-visual" data-action="to-letter" role="link" tabindex="0" aria-label="편지 본문으로"><img src="${a(safeUrl(l.cover))}" alt="소식지 대표 사진"><span class="place">ABIDJAN</span><figcaption>Bonjour,<br>Côte d’Ivoire.</figcaption></figure>` : ''}</section>
<section id="letter" class="reading"><aside><div class="eyebrow">FROM THE FIELD</div><h2>아비장에서<br>전하는 안부</h2><p>한결같은 마음으로,<br>한 통씩 쌓아가는 이야기.</p><nav class="toc" aria-label="이야기 목차">${sections.map((s, i) => `<a href="#story-${i}"><span>${pad(i + 1)}</span>${a(s.title)}</a>`).join('')}</nav>${side ? `<img loading="lazy" src="${a(side)}" alt="">` : ''}</aside>
<div class="prose rich"><span class="greeting">사랑하는 동역자 여러분께,</span>${sanitize(l.intro)}
${sections.map((s, i) => `<article class="story" id="story-${i}"><div class="story-head"><span>${pad(i + 1)}</span><h3>${a(s.title)}</h3></div>${sanitize(s.html)}${(s.photos || []).filter(p => safeUrl(p.url)).map(p => `<figure class="story-photo"><button data-action="photo" data-src="${a(p.url)}" data-caption="${a(p.caption)}" aria-label="사진 크게 보기"><img loading="lazy" src="${a(p.url)}" alt="${a(p.caption)}"></button>${p.caption ? `<figcaption>${a(p.caption)}</figcaption>` : ''}</figure>`).join('')}<div class="story-end">${react('likes', l.id + ':story:' + i, '')}</div></article>`).join('')}
${l.quote ? '<blockquote>“' + a(l.quote) + '”</blockquote>' : ''}<div class="reading-end">${react('likes', 'letter:' + l.id, '좋아요')}${share()}</div></div></section>
${gallery.length || yt ? `<section class="section" id="moments"><div class="section-head"><div><div class="eyebrow">EVERYDAY GRACE</div><h2>일상에 스며든 은혜</h2></div><p>새로운 만남, 낯선 풍경.<br>우리의 일상을 함께 나눠요.</p></div>${gallery.length ? `<div class="gallery">${gallery.map(g => `<button data-action="photo" data-src="${a(g.url)}" data-caption="${a(g.caption)}" aria-label="${a(g.caption || '사진')} 크게 보기"><img loading="lazy" src="${a(g.url)}" alt="${a(g.caption)}"><span class="caption">${a(g.caption)}<span>↗</span></span></button>`).join('')}</div>` : ''}
${yt ? `<a class="music video-card" href="https://www.youtube.com/watch?v=${a(yt)}" target="_blank" rel="noopener"><span class="video-thumb"><img loading="lazy" src="https://i.ytimg.com/vi/${a(yt)}/hqdefault.jpg" alt="영상 미리보기"><span class="play" aria-hidden="true">▶</span></span><div><strong>${a(l.youtube.title || '영상')}</strong>${l.youtube.description ? `<p>${a(l.youtube.description).replace(/\n/g, '<br>')}</p>` : ''}<span class="video-link">YouTube에서 보기 ↗</span></div></a>` : ''}</section>` : ''}`;
  }

  function prayersHTML(l, ctx) {
    const a = esc, react = ctx.react || (() => ''), prayers = l.prayers || [];
    if (!prayers.length) return '';
    const ym = String(l.date || '').slice(0, 7).split('-');
    return `<section class="prayer-section" id="prayers"><div class="prayer-inner"><div class="section-head"><div><div class="eyebrow">PRAY WITH US</div><h2>이 기도에, 함께해 주세요.</h2></div><p>${ym.length === 2 ? a(ym[0] + '년 ' + Number(ym[1]) + '월 ') : ''}기도제목<br>‘아멘’으로 마음을 모아주세요.</p></div><div class="prayer-grid">${prayers.map((p, i) => `<article class="prayer-card"><span class="prayer-number">${pad(i + 1)}</span><h3>${a(p.title)}</h3><p>${a(p.body)}</p>${react('amens', l.id + ':prayer:' + i, '아멘')}</article>`).join('')}</div><p class="prayer-note">여러분의 기도가 이곳의 하루를 지탱합니다.</p></div></section>`;
  }

  window.OTBRender = { esc, sanitize, textToHtml, youtubeId, safeUrl, letterHTML, prayersHTML };
})();
