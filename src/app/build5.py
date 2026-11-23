import os
import json,re
import base64
js=open('planner4_app.js').read().replace('__WX__',open('wx.json').read()).replace('__BADGE__','data:image/webp;base64,'+base64.b64encode(open('badge.webp','rb').read()).decode())
css=open('planner_css.css').read()
css=re.sub(r'nav\.jump[^\n]*\n','',css).replace('*{box-sizing:border-box}','*{box-sizing:border-box}\n[hidden]{display:none!important}',1)
css=css.replace('minmax(150px,1fr));gap:10px}','minmax(140px,1fr));gap:10px}',1)
css+=open('planner3_extra.css').read()+"\n@media (max-width:520px){.item .nq{display:none}}\n"+open('planner3_map.css').read()
import urllib.parse
topo='url("data:image/svg+xml,'+urllib.parse.quote(open('topo_mask.svg').read(),safe=" =:/,'.-")+'")'
css+='\n:root{--topo:'+topo+'}\n'+open('planner_ds.css').read()
st=open('static5.json').read(); d3=open('d3b.json').read()
tr=json.dumps(json.load(open('trip.json')),ensure_ascii=False).replace('<','\\u003c')
for x in (js,st,d3): assert '</script' not in x.lower()
assert '</style' not in css.lower()
fonts="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap"
html=f'''<title>DGT Trip Planner</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}" id="dgt-fonts">
<style id="dgt-css">{css}</style>
<div id="app"></div>
<script type="application/json" id="dgt-static">{st}</script>
<script type="application/json" id="dgt-trip">{tr}</script>
<script type="application/json" id="dgt-3d">{d3}</script>
<script id="dgt-app">{js}</script>
'''
open(os.environ.get('DGT_ARTIFACT_OUT',os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','build','dgt-planner.html')),'w').write(html); print(len(html))
