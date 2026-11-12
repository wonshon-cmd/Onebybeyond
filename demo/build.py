#!/usr/bin/env python3
"""Build a single-file offline demo: demo/build.py OUTPUT.html

Visitor and admin screens run in two iframes that share one fake database
(demo-backend.js) stored in the browser. No network, no real accounts.
"""
import base64, html, io, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
out_path = Path(sys.argv[1] if len(sys.argv) > 1 else 'onetobeyond-demo.html')

def read(p): return (SITE / p).read_text(encoding='utf-8')

def photo_data_url(rel):
    from PIL import Image
    im = Image.open(SITE / rel.lstrip('/'))
    im.thumbnail((1000, 1000))
    buf = io.BytesIO(); im.convert('RGB').save(buf, 'JPEG', quality=74, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

content = json.loads(read('content.json'))
cache = {}
def swap(u):
    if isinstance(u, str) and u.startswith('/assets/photos/'):
        cache.setdefault(u, photo_data_url(u)); return cache[u]
    return u
for l in content['letters']:
    l['cover'] = swap(l['cover']); l['sidePhoto'] = swap(l.get('sidePhoto', ''))
    for g in l.get('gallery', []): g['url'] = swap(g['url'])
    for s in l.get('sections', []):
        for p in s.get('photos', []): p['url'] = swap(p['url'])

def patch(src, old, new, name):
    if old not in src: sys.exit(f'patch failed: {name}')
    return src.replace(old, new)

render = read('render.js')
community = patch(read('community.js'), '  function signIn() {\n', '  function signIn() {\n    if (window.OTB_DEMO_GOOGLE) return window.OTB_DEMO_GOOGLE();\n', 'community signIn')
admin = read('admin/admin.js')
admin = patch(admin, "urls.push(await sb.upload('media',", "urls.push(window.OTB_DEMO_UPLOAD ? await window.OTB_DEMO_UPLOAD(blob) : await sb.upload('media',", 'admin upload')
admin = patch(admin, '접속 코드를 입력해 주세요.</p>', '접속 코드를 입력해 주세요.</p><div class="banner">오프라인 데모 접속 코드: <b>1234</b></div>', 'admin login hint')
app = patch(read('app.js'), "new URLSearchParams(location.search).get('letter')", "(new URLSearchParams(location.search).get('letter') || (() => { try { return sessionStorage.getItem('otb-demo-letter'); } catch { return ''; } })())", 'app deep link')
backend = (ROOT / 'demo' / 'demo-backend.js').read_text(encoding='utf-8')
css = read('style.css') + '\n' + read('site.css')
admin_css = read('admin/admin.css')

def script(s): return '<script>' + s.replace('</script', '<\\/script') + '</script>'

def page(body_attrs, body, scripts, extra_css=''):
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<style>{css}\n{extra_css}</style></head><body {body_attrs}>{body}'
            '<div id="modal-root"></div><div id="toast-root" aria-live="polite"></div>'
            + ''.join(script(s) for s in scripts) + '</body></html>')

visitor = page('data-layout="forest"', '<div id="app"></div>', [backend, render, read('sb.js'), community, app])
adminp = page('class="adm-body" data-layout="forest"', '<div id="adm"></div>', [backend, render, read('sb.js'), admin], admin_css)

parent = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>One to Beyond · 오프라인 데모</title>
<style>
html,body{{margin:0;height:100%;background:#FAF9F6;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif;color:#343733}}
.bar{{position:fixed;top:0;left:0;right:0;height:52px;display:flex;align-items:center;gap:8px;padding:0 12px;background:#343733;color:#FAF9F6;z-index:10;box-sizing:border-box}}
.bar b{{font-size:12px;letter-spacing:.5px;white-space:nowrap}}
.bar .sp{{flex:1}}
.bar button{{border:1px solid #6f746c;background:transparent;color:#FAF9F6;border-radius:18px;padding:7px 12px;font-size:12px;cursor:pointer;white-space:nowrap}}
.bar button.on{{background:#FAF9F6;color:#343733;border-color:#FAF9F6}}
.bar .mk{{display:inline-flex;gap:4px;transform:skewX(-25deg);margin-right:4px}}.bar .mk i{{width:4px;height:16px;background:#ff7900}}.bar .mk i+i{{background:#009e60}}
iframe{{position:fixed;top:52px;left:0;width:100%;height:calc(100% - 52px);border:0;background:#FAF9F6}}
iframe[hidden]{{display:none}}
@media (max-width:420px){{.bar .title{{display:none}}}}
</style></head><body>
<div class="bar"><span class="mk"><i></i><i></i></span><b class="title">오프라인 데모</b><span class="sp"></span>
<button id="t-visitor" class="on">방문자 화면</button><button id="t-admin">관리자 화면</button><button id="reset" title="데모 내용을 처음 상태로">↺ 처음 상태로</button></div>
<iframe id="f-visitor" title="방문자 화면"></iframe><iframe id="f-admin" title="관리자 화면" hidden></iframe>
<script>
window.OTB_DEMO_SEED = {json.dumps(content, ensure_ascii=False).replace('</', '<\\/')};
const SRC = {{ visitor: {json.dumps(visitor, ensure_ascii=False).replace('</', '<\\/')}, admin: {json.dumps(adminp, ensure_ascii=False).replace('</', '<\\/')} }};
const fv = document.getElementById('f-visitor'), fa = document.getElementById('f-admin');
let adminLoaded = false;
function show(which, letter) {{
  document.getElementById('t-visitor').classList.toggle('on', which === 'visitor');
  document.getElementById('t-admin').classList.toggle('on', which === 'admin');
  fv.hidden = which !== 'visitor'; fa.hidden = which !== 'admin';
  if (which === 'visitor') {{ try {{ sessionStorage.setItem('otb-demo-letter', letter || ''); }} catch (e) {{}} fv.srcdoc = SRC.visitor; }}
  if (which === 'admin' && !adminLoaded) {{ fa.srcdoc = SRC.admin; adminLoaded = true; }}
}}
window.OTB_DEMO_SWITCH = show;
document.getElementById('t-visitor').onclick = () => show('visitor');
document.getElementById('t-admin').onclick = () => show('admin');
document.getElementById('reset').onclick = () => {{
  if (!confirm('데모에서 바꾼 내용을 모두 지우고 처음 상태로 돌릴까요?')) return;
  try {{ Object.keys(localStorage).filter(k => k.startsWith('otb-') || k.startsWith('onetobeyond-')).forEach(k => localStorage.removeItem(k)); }} catch (e) {{}}
  adminLoaded = false; fa.srcdoc = SRC.admin; adminLoaded = true; show('visitor');
}};
let storageOk = true; try {{ localStorage.setItem('otb-demo-probe', '1'); localStorage.removeItem('otb-demo-probe'); }} catch (e) {{ storageOk = false; }}
if (!storageOk) alert('이 브라우저는 데모 저장을 막고 있어요. Chrome이나 Safari로 열어 주세요.');
show('visitor');
</script></body></html>'''

out_path.write_text(parent, encoding='utf-8')
print(out_path, f'{out_path.stat().st_size/1e6:.2f} MB')
