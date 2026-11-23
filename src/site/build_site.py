"""Builds the website edition of the DGT planner into ../site from the same sources as the Claude artifact."""
import json, re, base64, os, shutil, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.join(HERE, '..', 'app')
OUT = os.path.join(HERE, '..', '..')
os.makedirs(OUT, exist_ok=True)
def rd(p): return open(os.path.join(DASH, p), encoding='utf-8').read()

js = rd('planner4_app.js').replace('__WX__', rd('wx.json')).replace('__BADGE__', 'data:image/webp;base64,' + base64.b64encode(open(os.path.join(DASH, 'badge.webp'), 'rb').read()).decode())

def R(a, b, count=1):
    global js
    n = js.count(a)
    assert n == count, (a[:80], n)
    js = js.replace(a, b)

# wording for the website: sign-in is the group passcode, saving goes to the group sheet
R("'Saved to your Claude account'", "'Saved to the group sheet'")
R("in this browser, and privately to your Claude account when you\\'re signed in, so it follows you to other devices.",
  "in this browser, and to your tab in the group sheet, so it follows you to any device you sign in on.")
js = re.sub(r"\n        '<p class=\"note\" style=\"margin-top:8px\">To keep a copy the group can see, paste it into your tab in the <a href=\"https://docs\.google\.com/spreadsheets/[^\n]*\n", "\n", js, count=1)
R("'Answers are shown to people signed in to Claude.'", "'Sign in with the group passcode to see the answers.'")
R("'Saving here needs a Claude sign-in. Without one, copy your answer and send it to the group chat; Leon will add it.'", "'Sign in with the group passcode to save your answer, or copy it and send it to the group chat.'")
R("'The shared list of who brings what is shown to people signed in to Claude. Ask in the group chat, or open this page signed in.'", "'Sign in with the group passcode to see and change who brings what.'")
R("Sends item names and weights only. Needs a Claude sign-in.", "Sends item names and weights only. Opens in your own Claude account.")
R("'A written review needs a Claude sign-in on this page. The checks above work without one.'", "'Sign in with the group passcode to ask for a review. The checks above work without it.'")
R("'The group list is shown to people signed in to Claude.'", "'Sign in with the group passcode to see the group.'")
R("'Adding yourself needs a Claude sign-in. Without one, send your travel details to the group chat.'", "'Sign in with the group passcode to add your details.'")
R("saved in this browser, and in your own Claude account when you\\'re signed in.", "saved in this browser and to your own tab in the group sheet.")
R("'The review wasn\\'t allowed on this page.'", "'Reviews aren\\'t set up yet: the organiser needs to add a Claude API key.'")
R("'Too many requests just now. Try again in a minute.'", "'The group\\'s reviews for today are used up. Try again tomorrow.'")
R("Saved. Everyone now sees the new details.", "Saved. Everyone sees the new details next time they open the planner.")
assert '</script' not in js.lower()

css = rd('planner_css.css')
css = re.sub(r'nav\.jump[^\n]*\n', '', css).replace('*{box-sizing:border-box}', '*{box-sizing:border-box}\n[hidden]{display:none!important}', 1)
css = css.replace('minmax(150px,1fr));gap:10px}', 'minmax(140px,1fr));gap:10px}', 1)
topo = 'url("data:image/svg+xml,' + urllib.parse.quote(rd('topo_mask.svg'), safe=" =:/,'.-") + '")'
css += rd('planner3_extra.css') + "\n@media (max-width:520px){.item .nq{display:none}}\n" + rd('planner3_map.css') + '\n:root{--topo:' + topo + '}\n' + rd('planner_ds.css')
css += open(os.path.join(HERE, 'site.css'), encoding='utf-8').read()
assert '</style' not in css.lower()

st = rd('static5.json'); d3 = rd('d3b.json')
trip = json.dumps(json.load(open(os.path.join(DASH, 'trip.json'))), ensure_ascii=False).replace('<', '\\u003c')
boot = open(os.path.join(HERE, 'boot.js'), encoding='utf-8').read()
fonts = "https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap"
gate = '''<div id="gate" class="gate" hidden><form class="g-card" autocomplete="on">
<img src="icon-192.png" alt="" width="96" height="96">
<div class="eyebrow">Drakensberg Grand Traverse 2027</div><h1>Who are you?</h1>
<div class="g-names" role="group" aria-label="Your name"></div>
<label class="field">Group passcode<input class="g-pass" type="password" autocomplete="current-password" required></label>
<details><summary>I'm organising the trip</summary><label class="field">Organiser code<input class="g-admin" type="password" autocomplete="off"></label></details>
<button class="btn primary" type="submit">Open the planner</button>
<p class="msg g-msg" role="status"></p>
<button class="linkbtn g-skip" type="button">Look around without signing in</button>
</form></div>'''
import hashlib
build = hashlib.sha1((js + css + boot + trip).encode('utf-8')).hexdigest()[:12]
html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="dgt-build" content="{build}">
<title>DGT Trip Planner</title>
<meta name="theme-color" content="#222324">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png"><link rel="apple-touch-icon" href="icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}" id="dgt-fonts">
<style id="dgt-css">:root{{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}}body{{margin:0}}img{{max-width:100%}}{css}</style>
</head><body>
{gate}
<div id="app"></div>
<script type="application/json" id="dgt-static">{st}</script>
<script type="application/json" id="dgt-trip">{trip}</script>
<script type="application/json" id="dgt-3d">{d3}</script>
<script src="config.js"></script>
<script type="text/plain" id="dgt-app">{js}</script>
<script>{boot}</script>
</body></html>'''
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)
for f in ['sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'README.md', 'Code.gs']:
    src = os.path.join(HERE, f)
    if os.path.exists(src):
        dst = os.path.join(OUT, 'backend', f) if f == 'Code.gs' else os.path.join(OUT, f)
        os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy(src, dst)
if not os.path.exists(os.path.join(OUT, 'config.js')):
    shutil.copy(os.path.join(HERE, 'config.js'), os.path.join(OUT, 'config.js'))
print('index.html', len(html))
