/* DGT 2027 planner, website edition.
   Stands in for the Claude artifact runtime: window.claude.use('db' | 'user' | 'artifact' | 'sample')
   is answered by a Google Apps Script web app attached to the group sheet (see backend/Code.gs).
   Sign-in is a name from the group plus the group passcode; the organiser code unlocks trip editing. */
(function(){
  var API=(window.DGT_CONFIG||{}).apiUrl||'';
  var NAMES=(window.DGT_CONFIG||{}).names||['Leon','Duncan','Christian','Stefan'];
  function lsg(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lss(k,v){ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} }
  var S={who:lsg('dgt-who'),k:lsg('dgt-pass'),admin:lsg('dgt-admin'),isAdmin:lsg('dgt-isadmin')==='1'};
  var cache={}, subs={}, online=false, timer=null;
  function slug(s){ return String(s||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

  async function call(body){
    if(!API) throw {code:'unavailable',message:'No backend configured'};
    var r; try{ r=await fetch(API,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({k:S.k,who:S.who,admin:S.admin},body))}); }catch(e){ throw {code:'network',message:'no connection'}; }
    var j; try{ j=await r.json(); }catch(e){ throw {code:'network',message:'unexpected reply '+r.status}; }
    if(!j.ok) throw {code:j.code||'error',message:j.error||'Request failed'};
    return j;
  }
  function snap(c){ var m=cache[c]||{}; return {docs:Object.keys(m).map(function(id){ return {id:id,exists:true,data:function(){return m[id];},metadata:{fromCache:false,hasPendingWrites:false}}; }),size:Object.keys(m).length,empty:!Object.keys(m).length,docChanges:function(){return [];}}; }
  function fire(c){ (subs[c]||[]).forEach(function(f){ try{ f(snap(c)); }catch(e){ console.error(e); } }); }
  function apply(j){ var d=j.data||{}; Object.keys(d).forEach(function(c){ cache[c]=d[c]||{}; }); Object.keys(subs).forEach(fire); try{ localStorage.setItem('dgt-cache',JSON.stringify({data:d,trip:j.trip,at:Date.now()})); }catch(e){} }
  async function refresh(){ try{ var j=await call({a:'all'}); online=true; apply(j); return j; }catch(e){ online=false; throw e; } }
  function poll(){ clearInterval(timer); timer=setInterval(function(){ if(document.visibilityState==='visible') refresh().catch(function(){}); },45000);
    document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible') refresh().catch(function(){}); }); }

  var db={collection:function(path){
    var m=/^data\/users\/([^/]+)$/.exec(path);
    if(m){ // personal gear: saved under the person's name, only when they choose to share it
      return {doc:function(){ return {
        get:async function(){ var g=(await call({a:'getgear'})).gear; return {exists:!!g,data:function(){return g;}}; },
        set:async function(d){ if(lsg('dgt-share')==='0') throw {code:'off'}; var rows=window.DGT_sheetRows?window.DGT_sheetRows():window.DGT_gearRows?window.DGT_gearRows():[]; await call({a:'gear',d:d,rows:rows}); },
        delete:async function(){ await call({a:'gear',d:null,rows:[]}); } }; } };
    }
    return {
      onSnapshot:function(fn,err){ (subs[path]=subs[path]||[]).push(fn); setTimeout(function(){ fn(snap(path)); },0); return function(){ subs[path]=(subs[path]||[]).filter(function(f){return f!==fn;}); }; },
      doc:function(id){ return {
        set:async function(d){ (cache[path]=cache[path]||{})[id]=d; fire(path); try{ await call({a:'set',c:path,id:id,d:d}); }catch(e){ refresh().catch(function(){}); throw e; } },
        update:async function(d){ var cur=Object.assign({},(cache[path]||{})[id]||{},d); return this.set(cur); },
        delete:async function(){ if(cache[path]) delete cache[path][id]; fire(path); try{ await call({a:'del',c:path,id:id}); }catch(e){ refresh().catch(function(){}); throw e; } },
        get:async function(){ var v=(cache[path]||{})[id]; return {exists:!!v,data:function(){return v;}}; } }; } };
  }};
  var user={ id:async function(){ return S.who?slug(S.who):null; }, me:async function(){ return {id:slug(S.who),name:S.who||''}; },
    canEdit:async function(){ return !!S.isAdmin; }, isOwner:function(){ return !!S.isAdmin; }, can:async function(){ return true; }, profiles:async function(){ return {}; } };
  var artifact={ publish:async function(html){ // the planner republishes itself when trip details change: keep only the trip data
    var doc=new DOMParser().parseFromString(html,'text/html'), el=doc.getElementById('dgt-trip'); if(!el) throw {code:'error'};
    await call({a:'trip',d:JSON.parse(el.textContent)}); } };
  function sample(prompt,opts){ opts=opts||{}; return call({a:'review',prompt:typeof prompt==='string'?prompt:JSON.stringify(prompt)}).then(function(j){ if(opts.onText) try{ opts.onText({text:j.text,delta:j.text}); }catch(e){} return {text:j.text,truncated:false}; },
    function(e){ throw {code:e.code==='limit'?'rate_limited':e.code,message:e.message}; }); }
  sample.json=function(p,o){ return sample(p,o).then(function(r){ return JSON.parse(r.text); }); };
  sample.limits=async function(){ return {images:false}; };

  /* no Anthropic API key: Claude features open a chat in the person's own Claude account instead */
  function handoff(prompt){ var q=typeof prompt==='string'?prompt:JSON.stringify(prompt); return Promise.reject({code:'handoff',prompt:q,url:'https://claude.ai/new?q='+encodeURIComponent(q)}); }
  handoff.json=handoff; handoff.limits=async function(){ return {images:false}; };
  var NOAI=(window.DGT_CONFIG||{}).ai===false;
  window.claude={use:function(name){ if(name==='sample'&&NOAI) return Promise.resolve(handoff); return Promise.resolve(online?({db:db,user:user,artifact:artifact,self:artifact,sample:sample})[name]||null:null); }};

  /* ---- sign-in gate ---- */
  function bar(kind,detail){
    var b=document.getElementById('dgt-bar'); if(!b){ b=document.createElement('div'); b.id='dgt-bar'; b.className='dgt-bar'; b.setAttribute('role','status'); document.body.insertBefore(b,document.getElementById('app')); }
    if(!kind){ b.hidden=true; return; } b.hidden=false;
    b.innerHTML=kind==='guest'?'<span>You\'re looking around without signing in: the group\'s shared plans are hidden and nothing you change is shared.</span><button class="btn primary" data-dgt="in">Sign in</button>'
      :'<span>Couldn\'t reach the group sheet'+(detail?' ('+detail+')':'')+'. You\'re seeing what this device saved last time; changes stay on this device.</span><button class="btn" data-dgt="retry">Try again</button><button class="linkbtn" data-dgt="out">Sign in as someone else</button>';
  }
  function start(trip){
    if(trip){ var t=document.getElementById('dgt-trip'); if(t) t.textContent=JSON.stringify(trip); }
    if(S.who) lss('dgt-poll-name',S.who);
    var src=document.getElementById('dgt-app'), s=document.createElement('script'); s.textContent=src.textContent; document.body.appendChild(s);
    document.documentElement.classList.toggle('dgt-signedin',online);
    document.documentElement.classList.toggle('dgt-noai',(window.DGT_CONFIG||{}).ai===false);
    decorate(); poll();
    if(!online) bar(S.who&&S.k?'offline':'guest',start.err); else bar(null);
  }
  function decorate(){ // signed-in line and the share switch on the Overview "Your data" card
    var paint=function(){ var card=document.querySelector('[data-act="backup"]'); if(!card) return; card=card.closest('.card'); if(!card||card.querySelector('.dgt-acct')) return;
      var box=document.createElement('div'); box.className='dgt-acct';
      box.innerHTML=online?('<p class="note">Signed in as <b></b>'+(S.isAdmin?' (organiser)':'')+'. <button class="linkbtn" data-dgt="out">Switch person</button></p>'+
        '<label class="adv-chk"><input type="checkbox" id="dgt-share"'+(lsg('dgt-share')!=='0'?' checked':'')+'> Save my gear and food menu to the group sheet under my name</label>'+
        '<p class="note">On (the default): your gear and food are saved automatically and follow you to any device you sign in on; the group sheet shows them in your tab. Off: they stay in this browser only.</p>')
        :('<p class="note">Not signed in: shared parts are hidden and your gear stays in this browser. <button class="linkbtn" data-dgt="in">Sign in</button></p>');
      var b=box.querySelector('b'); if(b) b.textContent=S.who; card.appendChild(box); };
    paint(); new MutationObserver(paint).observe(document.getElementById('app'),{childList:true,subtree:true});
    document.addEventListener('change',function(e){ if(e.target&&e.target.id==='dgt-share'){ lss('dgt-share',e.target.checked?'1':'0'); if(e.target.checked&&window.DGT_SYNC) window.DGT_SYNC.push(); } });
    document.addEventListener('click',function(e){ var t=e.target.closest&&e.target.closest('[data-dgt]'); if(!t) return;
      if(t.dataset.dgt==='out'){ ['dgt-who','dgt-pass','dgt-admin','dgt-isadmin'].forEach(function(k){ lss(k,null); }); location.reload(); }
      if(t.dataset.dgt==='in'){ lss('dgt-skip',null); location.reload(); }
      if(t.dataset.dgt==='retry'){ location.reload(); } });
  }
  function gate(msg){
    var g=document.getElementById('gate'); g.hidden=false;
    g.querySelector('.g-names').innerHTML=NAMES.map(function(n){ return '<button type="button" class="g-name" aria-pressed="'+(S.who===n)+'">'+n+'</button>'; }).join('');
    var m=g.querySelector('.g-msg'); m.textContent=msg||'';
    g.onclick=function(e){ var b=e.target.closest('.g-name'); if(b){ S.who=b.textContent; g.querySelectorAll('.g-name').forEach(function(x){ x.setAttribute('aria-pressed',String(x===b)); }); }
      if(e.target.closest('.g-skip')){ lss('dgt-skip','1'); g.hidden=true; offline(); } };
    g.querySelector('form').onsubmit=async function(e){ e.preventDefault();
      if(!S.who){ m.textContent='Pick your name first.'; return; }
      S.k=g.querySelector('.g-pass').value.trim(); S.admin=g.querySelector('.g-admin').value.trim()||null;
      m.textContent='Checking…';
      try{ var j=await call({a:'auth'}); S.isAdmin=!!j.admin; lss('dgt-who',S.who); lss('dgt-pass',S.k); lss('dgt-admin',S.admin); lss('dgt-isadmin',S.isAdmin?'1':'0');
        if(S.admin&&!S.isAdmin){ m.textContent='Signed in, but that organiser code is wrong: trip details stay read-only.'; }
        var all=await refresh(); g.hidden=true; try{ history.replaceState(null,'',location.pathname+location.search+'#overview'); }catch(_){ location.hash='#overview'; } start(all.trip); }
      catch(err){ m.textContent=err.code==='auth'?'That passcode is wrong.':'Couldn\'t reach the group sheet. Check your connection and try again.'; } };
  }
  function offline(){ var c=null; try{ c=JSON.parse(localStorage.getItem('dgt-cache')||'null'); }catch(e){} start(c&&c.trip); }
  async function boot(){
    if(S.who&&S.k){
      try{ var all=await refresh(); start(all.trip); return; }
      catch(e){ if(e.code==='auth'){ lss('dgt-pass',null); S.k=null; gate('The group passcode has changed. Enter the new one.'); return; }
        start.err=e&&e.message?String(e.message).slice(0,80):''; var c=null; try{ c=JSON.parse(localStorage.getItem('dgt-cache')||'null'); }catch(_){}
        if(c){ apply(c); } start(c&&c.trip); return; }
    }
    if(lsg('dgt-skip')==='1'){ offline(); return; }
    gate();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
  if('serviceWorker' in navigator&&location.protocol==='https:') navigator.serviceWorker.register('sw.js').catch(function(){});
})();

/* tell people when a newer version is live, so nobody plans on an old copy */
(function(){ var me=(document.querySelector('meta[name="dgt-build"]')||{}).content, last=0; if(!me) return;
  function show(){ if(document.getElementById('dgt-upd')) return; var d=document.createElement('div'); d.id='dgt-upd'; d.className='dgt-bar'; d.setAttribute('role','status');
    d.innerHTML='<span>A newer version of the planner is ready. Your data is saved.</span><button class="btn primary" type="button">Reload</button>'; d.querySelector('button').addEventListener('click',function(){ location.reload(); });
    document.body.insertBefore(d,document.getElementById('app')); }
  function check(){ if(Date.now()-last<120000) return; last=Date.now();
    fetch('index.html?b='+Date.now(),{cache:'no-store'}).then(function(r){ return r.ok?r.text():''; }).then(function(t){ var m=t.match(/name="dgt-build" content="([^"]+)"/); if(m&&m[1]!==me) show(); }).catch(function(){}); }
  document.addEventListener('visibilitychange',function(){ if(!document.hidden) check(); }); window.addEventListener('focus',check); setInterval(check,600000); setTimeout(check,8000);
})();
