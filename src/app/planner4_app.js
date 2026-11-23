(function(){
"use strict";
var S = JSON.parse(document.getElementById('dgt-static').textContent);
var T = JSON.parse(document.getElementById('dgt-trip').textContent);
var D = JSON.parse(document.getElementById('dgt-3d').textContent);
var LS_KEY = 'dgt-planner-v3';
var canEdit = false, editing = false, draft = null, saving = false, saveMsg = '';

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function $(id){return document.getElementById(id);}
function fmt(n,d){return Number(n).toLocaleString('en-GB',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});}
function kg(g){return fmt(g/1000,2)+' kg';}
function sg(g){return (g>0?'+':g<0?'−':'±')+fmt(Math.abs(g))+' g';}
function parseD(s){if(!s)return null;var p=s.split('-');return new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));}
function iso(d){return d.toISOString().slice(0,10);}
function addDays(s,n){var d=parseD(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);}
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], WD=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function nice(s,wd){var d=parseD(s);if(!d)return '';return (wd?WD[d.getUTCDay()]+' ':'')+d.getUTCDate()+' '+MON[d.getUTCMonth()]+' '+d.getUTCFullYear();}
function short(s){var d=parseD(s);if(!d)return '';return WD[d.getUTCDay()]+' '+d.getUTCDate()+' '+MON[d.getUTCMonth()];}
function dm(s){var d=parseD(s);if(!d)return '';return d.getUTCDate()+' '+MON[d.getUTCMonth()];}
function today(){var n=new Date();return iso(new Date(Date.UTC(n.getFullYear(),n.getMonth(),n.getDate())));}
function daysBetween(a,b){return Math.round((parseD(b)-parseD(a))/864e5);}
function num(v){var n=parseFloat(String(v).replace(',','.'));return isNaN(n)?null:n;}

var BADGE='__BADGE__';
var P=S.plan;
// Personal gear starts empty: every line is 0 g until the person weighs their own kit. The typical weight stays as a hint.
S.catalog.forEach(function(it){ if(it.scope==='g') return; it.typ=it.g||0; it.g=0; (it.parts||[]).forEach(function(p){ p.typ=p.g||0; p.g=0; }); });
var totalKm=S.days.reduce(function(a,d){return a+d.distance_km;},0);
var totalUp=S.days.reduce(function(a,d){return a+d.ascent_m;},0);
var highest=Math.max.apply(null,S.days.map(function(d){return d.high_m;}));
/* =========================================================
   Trip length: split the route into n days at camp spots
   ========================================================= */
var CUM=S.cum, ORIG_N=S.days.length, MIN_DAYS=8, MAX_DAYS=14;
function cIdx(km){return Math.max(0,Math.min(CUM.up.length-1,Math.round(km/CUM.step)));}
function segStats(a,b){ var i=cIdx(a),j=cIdx(b),hi=0; for(var k=i;k<=j;k++) if(CUM.hi[k]>hi) hi=CUM.hi[k]; return {dist:b-a,up:CUM.up[j]-CUM.up[i],down:CUM.dn[j]-CUM.dn[i],max:hi}; }
function effort(a,b){ var s=segStats(a,b); return s.dist+s.up/100; } // 100 m of climbing ≈ 1 km of walking
var GEO=(function(){ // x/z (km) → lat/lon, fitted on the named points
  var p=D.pois, n=p.length, sx=0,sl=0,sxx=0,sxl=0,sz=0,sa=0,szz=0,sza=0;
  p.forEach(function(q){ sx+=q.x; sl+=q.lon; sxx+=q.x*q.x; sxl+=q.x*q.lon; sz+=q.z; sa+=q.lat; szz+=q.z*q.z; sza+=q.z*q.lat; });
  var b=(n*sxl-sx*sl)/(n*sxx-sx*sx), a=(sl-b*sx)/n, d=(n*sza-sz*sa)/(n*szz-sz*sz), c=(sa-d*sz)/n;
  return function(x,z){ return {lat:c+d*z, lon:a+b*x}; };
})();
function routeAt(km){ var R=D.route,lo=0,hi=R.km.length-1; while(lo<hi){var m=(lo+hi)>>1; if(R.km[m]<km) lo=m+1; else hi=m;} return {x:R.x[lo],z:R.z[lo]}; }
var CANDS=(function(){
  var c=[], total=D.total;
  D.zones.forEach(function(z){ if(z.day>=ORIG_N) return; c.push({km:D.dstats[z.day-1].to,name:z.t,kind:'zone',note:z.note,x:z.x,z:z.z,lat:z.lat,lon:z.lon,r:z.r,pen:0}); });
  D.caves.forEach(function(v){ if(v.s!=='sleep'||v.off>1000||v.km<4||v.km>total-3) return;
    c.push({km:v.km,name:v.n,kind:'cave',cap:v.cap,off:v.off,note:(v.cap?'Sleeps '+v.cap+'. ':'')+(v.off<1000?v.off+' m':'1 km')+' off the line.'+(v.note?' '+v.note:''),x:v.x,z:v.z,lat:v.lat,lon:v.lon,r:0.8,pen:v.off<=400?2:5}); });
  var water=D.pois.filter(function(p){return p.c==='water';});
  for(var k=5;k<total-3;k+=0.5){
    var w=water.filter(function(p){return Math.abs(p.km-k)<=1.5;})[0], pt=routeAt(k), g=GEO(pt.x,pt.z);
    c.push({km:k,name:w?'Wild camp near '+w.n:'Wild camp at km '+fmt(k,1),kind:'wild',note:w?'No cave or known camp here: pitch tents near '+w.n+'.':'No cave or known camp here: pitch tents, and check water before committing.',x:pt.x,z:pt.z,lat:g.lat,lon:g.lon,r:1,pen:w?20:35});
  }
  c.sort(function(a,b){return a.km-b.km;});
  return c;
})();
var planCache={};
function buildPlan(n){
  if(planCache[n]) return planCache[n];
  var total=D.total, finish={km:total,name:'Bushman\'s Nek (finish)',kind:'finish',note:'Finish at the Bushman\'s Nek border post and Ezemvelo office.',pen:0};
  var z=D.zones[ORIG_N-1]; finish.x=z.x; finish.z=z.z; finish.lat=z.lat; finish.lon=z.lon; finish.r=0;
  var stops;
  if(n===ORIG_N){
    stops=D.zones.slice(0,ORIG_N-1).map(function(z,i){return {km:D.dstats[i].to,name:z.t,kind:'zone',note:z.note,x:z.x,z:z.z,lat:z.lat,lon:z.lon,r:z.r,range:z.range};});
  } else {
    var pts=[{km:0,pen:0}].concat(CANDS,[finish]), M=pts.length, target=effort(0,total)/n, INF=1e18;
    var E=function(i,j){ return effort(pts[i].km,pts[j].km); };
    var f=[new Float64Array(M).fill(INF)], back=[new Int32Array(M).fill(-1)]; f[0][0]=0;
    for(var d=1;d<=n;d++){
      var fd=new Float64Array(M).fill(INF), bd=new Int32Array(M).fill(-1), prev=f[d-1];
      for(var j=1;j<M;j++){
        if(d<n&&j===M-1) continue; if(d===n&&j!==M-1) continue;
        for(var i=0;i<j;i++){ if(prev[i]>=INF) continue; var gap=pts[j].km-pts[i].km; if(gap<4) continue;
          var e=E(i,j)-target, v=prev[i]+e*e+(pts[j].pen||0); if(v<fd[j]){ fd[j]=v; bd[j]=i; } }
      }
      f.push(fd); back.push(bd);
    }
    var idx=[], j2=M-1; for(var d2=n;d2>=1;d2--){ idx.unshift(j2); j2=back[d2][j2]; }
    stops=idx.slice(0,-1).map(function(k){ return pts[k]; });
  }
  stops=stops.concat([finish]);
  var stages=[], from=0, prevName='Sentinel Car Park';
  stops.forEach(function(s,i){
    var st=segStats(from,s.km);
    if(n===ORIG_N){ var o=S.days[i]; st={dist:o.distance_km,up:o.ascent_m,down:o.descent_m,max:o.high_m}; }
    var guide=[]; D.dstats.forEach(function(g,gi){ var ov=Math.min(g.to,s.km)-Math.max(g.from,from); if(ov>0.5) guide.push(gi); });
    stages.push({day:i+1,from:from,to:s.km,dist:st.dist,up:st.up,down:st.down,max:st.max,camp:s,title:prevName+' → '+s.name,guide:guide});
    from=s.km; prevName=s.name.replace(/^Wild camp (near|at) /,'');
  });
  var p={n:n,original:n===ORIG_N,stages:stages};
  p.maxDist=Math.max.apply(null,stages.map(function(s){return s.dist;})); p.maxUp=Math.max.apply(null,stages.map(function(s){return s.up;}));
  p.wild=stages.filter(function(s){return s.camp.kind==='wild';}).length;
  planCache[n]=p; return p;
}
function groupDays(){ return Math.max(MIN_DAYS,Math.min(MAX_DAYS,+T.tripDays||ORIG_N)); }
function myDays(){ return L.tripDays!=null?Math.max(MIN_DAYS,Math.min(MAX_DAYS,+L.tripDays)):groupDays(); }
var PLAN=buildPlan(groupDays()), N=PLAN.n;
function setPlan(n){ PLAN=buildPlan(n); N=PLAN.n; }

/* dates only count once the poll is locked in (datesStatus Confirmed); until then no countdown, no day dates */
function datesOn(){return T.datesStatus==='Confirmed'&&!!T.start;}
function TS(){return datesOn()?T.start:'';}
function stageDate(i){return TS()?addDays(TS(),i):'';}
function endDate(){return TS()?addDays(TS(),N-1):'';}

/* =========================================================
   Per-person state, saved in this browser
   ========================================================= */
/* Group plan: the trail days plus buffer days for weather or delays. Food and gas cover both. */
var BUFFER=2;
function blankSetup(){return {st:{},custom:[],cats:[]};}
var L={v:3,active:'A',names:{A:'Setup A',B:'Setup B'},lo:{A:blankSetup(),B:blankSetup()},groupSize:P.group_size,groupLoad:null,
  food:{kcal:4500,dens:450,spare:BUFFER,water:1},prep:{},savedAt:null};
var storageOK=true;
function loadState(){
  try{
    var raw=localStorage.getItem(LS_KEY);
    if(raw){ var o=JSON.parse(raw); if(o&&o.v===3){ for(var k in o) L[k]=o[k]; } }
    else {
      var old=localStorage.getItem('dgt-planner-v2')||localStorage.getItem('dgt-planner-v1');
      if(old){ var p=JSON.parse(old); ['food','prep','names','groupSize'].forEach(function(k){ if(p[k]!=null) L[k]=p[k]; }); }
    }
    ['A','B'].forEach(function(k){ var lo=L.lo[k]=L.lo[k]||blankSetup(); lo.st=lo.st||{}; lo.custom=lo.custom||[]; lo.cats=lo.cats||[]; });
  }catch(e){ storageOK=false; }
}
loadState();
loadFix();
if(!L.gs4){ if(+L.groupSize===5) L.groupSize=4; L.gs4=1; }
setPlan(myDays());
function persist(){
  L.savedAt=new Date().toISOString();
  try{ localStorage.setItem(LS_KEY,JSON.stringify(L)); storageOK=true; }catch(e){ storageOK=false; }
  showSaved();
  if(typeof SYNC!=='undefined'&&SYNC) SYNC.push();
  if(typeof updateLive==='function') try{ updateLive(); }catch(e){}
}
function showSaved(){
  var el=$('saved'); if(!el) return;
  var acct=typeof SYNC!=='undefined'&&SYNC&&SYNC.on();
  if(acct){ var d0=L.savedAt?new Date(L.savedAt):null; el.textContent='Saved to your Claude account'+(d0?' · '+String(d0.getHours()).padStart(2,'0')+':'+String(d0.getMinutes()).padStart(2,'0'):''); return; }
  if(!storageOK){ el.textContent='Not saved: this browser blocks storage'; return; }
  if(!L.savedAt){ el.textContent='Saves automatically in this browser'; return; }
  var d=new Date(L.savedAt); el.textContent='Saved in this browser · '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}

/* =========================================================
   Gear model
   ========================================================= */
var KIND={base:'Carried gear',worn:'Worn',cons:'Consumable'};
var CLASSES=[[4536,'Ultralight'],[6804,'Lightweight'],[11340,'Traditional'],[Infinity,'Heavy']]; // 10 / 15 / 25 lb
function cur(){return L.lo[L.active];}
function catList(lo,scope){
  return S.cats.filter(function(c){return c.scope===scope;}).concat((lo.cats||[]).filter(function(c){return c.scope===scope;}).map(function(c){return {scope:c.scope,name:c.name,kind:c.kind,custom:true};}));
}
function catInfo(lo,scope,name){ var a=catList(lo,scope); for(var i=0;i<a.length;i++) if(a[i].name===name) return a[i]; return {scope:scope,name:name,kind:'base'}; }
function items(lo,scope){
  var a=S.catalog.filter(function(i){return !scope||i.scope===scope;});
  (lo.custom||[]).forEach(function(c){ if(!scope||c.scope===scope) a.push(c); });
  return a;
}
function stOf(lo,id){return lo.st[id]||{};}
function wst(lo,id){return lo.st[id]||(lo.st[id]={});}
function isOn(it,s){return s.on!=null?s.on:(it.custom?true:!!it.essential);}
function partsOf(it,s){
  var base=(it.parts||[]).map(function(p){return {id:p.id,name:p.name,g:p.g,cons:!!p.cons,extra:false};});
  (s.xp||[]).forEach(function(p){base.push({id:p.id,name:p.name,g:p.g,cons:false,extra:true});});
  var ps=s.p||{};
  return base.map(function(p){var o=ps[p.id]||{};var src=(it.parts||[]).filter(function(q){return q.id===p.id;})[0];return {id:p.id,name:o.name||p.name,generic:p.name,extra:p.extra,cons:p.cons,def:p.g,typ:src&&src.typ||0,g:o.g!=null?o.g:p.g,on:o.on!=null?o.on:true};});
}
function nameOf(it,s){return (s.mine&&s.mine.trim())||it.name;}
function modeOf(it,s){var n=(it.parts||[]).length+(s.xp||[]).length;return s.mode||(n?'parts':'total');}
function unitOf(it,s){
  if(modeOf(it,s)==='parts'){return partsOf(it,s).reduce(function(a,p){return a+(p.on?(+p.g||0):0);},0);}
  return s.g!=null?s.g:(it.g||0);
}
function qtyOf(it,s){return s.qty!=null?s.qty:(it.qty||1);}
/* totals count the typical weight (the grey number) for anything not weighed yet, so they are a realistic estimate from the start */
function unitEst(it,s){
  if(modeOf(it,s)==='parts') return partsOf(it,s).reduce(function(a,p){return a+(p.on?((+p.g||0)||(+p.typ||0)):0);},0);
  return unitOf(it,s)||(it.typ||0);
}
function isEst(it,s){return isOn(it,s)&&it.scope!=='g'&&unitEst(it,s)>unitOf(it,s);}
function estList(s){ var b=[];
  if(s.est) b.push(s.est+' ticked item'+(s.est>1?'s aren\'t':' isn\'t')+' weighed yet, so the typical weight is counted ('+kg(s.estG)+')');
  if(s.foodEst) b.push('food is a rough '+fmt(food().perDay)+' g a day until you build a menu on Food &amp; fuel');
  if(s.evenSplit) b.push('group gear is an even split until you pick what you\'ll bring on Group gear');
  return b; }
function weightOf(it,s){return isOn(it,s)?unitEst(it,s)*qtyOf(it,s):0;}
/* the consumable part of an item (e.g. the gas inside a canister) */
function consOf(it,s){
  if(!isOn(it,s)) return 0;
  var ps=partsOf(it,s); if(!ps.some(function(p){return p.cons;})) return 0;
  if(modeOf(it,s)==='parts') return ps.reduce(function(a,p){return a+(p.on&&p.cons?(+p.g||0):0);},0)*qtyOf(it,s);
  var tg=it.typ!=null?it.typ:it.g, defCons=(it.parts||[]).reduce(function(a,p){return a+(p.cons?(p.typ!=null?p.typ:p.g):0);},0), frac=tg?defCons/tg:0;
  return unitOf(it,s)*qtyOf(it,s)*frac;
}
function summary(lo){
  var r={pBase:0,worn:0,consOther:0,big3:0,cats:{},gBase:0,gFuel:0,gcats:{},miss:[],gmiss:[],est:0,estG:0};
  items(lo).forEach(function(it){
    var s=stOf(lo,it.id), w=weightOf(it,s), on=isOn(it,s), ci=catInfo(lo,it.scope,it.cat);
    if(it.scope==='g'){ var c=consOf(it,s); r.gFuel+=c; r.gBase+=w-c; r.gcats[it.cat]=(r.gcats[it.cat]||0)+w; if(!on&&it.essential) r.gmiss.push(it.name); return; }
    if(!on&&it.essential) r.miss.push(it.name);
    if(isEst(it,s)){ r.est++; r.estG+=(unitEst(it,s)-unitOf(it,s))*qtyOf(it,s); }
    r.cats[it.cat]=(r.cats[it.cat]||0)+w;
    if(ci.kind==='worn') r.worn+=w; else if(ci.kind==='cons') r.consOther+=w; else { r.pBase+=w; if(ci.big3) r.big3+=w; }
  });
  var gs=Math.max(1,+L.groupSize||1), gt=r.gBase+r.gFuel;
  r.group=gt;
  var cl=typeof GG!=='undefined'&&GG.load?GG.load():null; r.claimed=cl;
  var own=L.groupLoad!=null&&!(+L.groupLoad===0&&cl>0); r.ownLoad=own;
  var load=own?L.groupLoad:(cl>0?cl:gt/gs);
  r.share=load; r.shareBase=gt?load*r.gBase/gt:0; r.shareFuel=gt?load*r.gFuel/gt:0;
  if(!own&&cl>0&&GG.split){ var sp=GG.split(); if(sp){ r.shareBase=sp.base; r.shareFuel=sp.fuel; } }
  var f=food(); r.food=f.total; r.foodEst=!f.menu; r.evenSplit=!(cl>0)&&!own; r.water=(+L.food.water||0)*1000; r.fuel=r.shareFuel;
  r.base=r.pBase+r.shareBase;
  r.cons=r.food+r.water+r.fuel+r.consOther;
  r.pack=r.base+r.cons; r.skin=r.pack+r.worn;
  r.big3pct=r.pBase?r.big3/r.pBase*100:0;
  for(var i=0;i<CLASSES.length;i++) if(r.base<CLASSES[i][0]){ r.cls=CLASSES[i][1]; r.clsI=i; break; }
  return r;
}
/* water to boil a day per person: filled up near camp, so it is never carried; it only sizes the gas */
function boilL(){ var v=num(L.food.boil); return v!=null&&v>0?v:1; }
function gasPlan(){
  var gs=Math.max(1,+L.groupSize||1);
  var days=N-1+BUFFER, perDay=boilL()*P.group_g_per_litre_measured*gs, need=perDay*days;
  var lo=cur(), have=0, n=0;
  items(lo,'g').forEach(function(it){ if(it.fuel){ var s=stOf(lo,it.id); have+=consOf(it,s); n+=isOn(it,s)?qtyOf(it,s):0; } });
  var each=n?have/n:230;
  return {need:need,needTrail:perDay*(N-1),days:days,have:have,n:n,netEach:n?have/n:0,margin:have-need,cansNeed:Math.ceil(need/each)};
}
/* Rough energy use per trail day: walking about 0.5 kcal per kg (body + pack) per km, x1.35 for trackless grass and rock;
   climbing as lifting body + pack at 25% muscle efficiency (0.00938 kcal per kg per m); descending about a third of that;
   plus about 24 kcal per kg of body weight a day for the body at rest. Estimates within about +/-15%. */
function burnEst(){ var bw=num(L.food.bw); if(!bw) return null; var pk=packByDay(cur()), tot=0, fd=food();
  PLAN.stages.forEach(function(st,i){ var m=bw+((pk[i]&&pk[i].total)||0)/1000; tot+=0.5*m*st.dist*1.35+m*st.up*0.00938+0.3*m*st.down*0.00938+bw*24; });
  var eat=fd.kcal*N, def=tot-eat; return {perDay:tot/N,total:tot,eat:eat,kg:def/7700,lo:(tot*0.85-eat)/7700,hi:(tot*1.15-eat)/7700}; }
function lossText(b){ if(!b) return ''; if(b.hi<0.3) return 'roughly even'; return 'about '+fmt(Math.max(0,b.kg),1)+' kg lighter'; }
function packByDay(lo){
  var s=summary(lo||cur()),f=food(),g=gasPlan(),out=[];
  var fuelBurn=s.fuel*Math.min(1,g.have?g.needTrail/g.have:1);
  for(var d=1;d<=N;d++){
    var foodLeft=f.perDay*(N-d+1)+(f.total-f.perDay*N);
    var fuelNow=Math.max(0,s.fuel-fuelBurn*((d-1)/N));
    var other=s.consOther*(1-(d-1)/N);
    out.push({day:d,base:s.base,food:foodLeft,water:s.water,fuel:fuelNow+other,total:s.base+foodLeft+s.water+fuelNow+other});
  }
  return out;
}

/* =========================================================
   Shell: tabs and views
   ========================================================= */
var VIEWS=[['overview','Overview'],['people','Group & travel'],['trip','Dates & bookings'],['links','Links'],['route','Route map'],['weather','Weather'],['safety','Safety'],['gear','My gear'],['group','Group gear'],['weight','Weight'],['compare','Compare A/B'],['food','Food & fuel'],['training','Training'],['prep','Before you go']];
var view='overview';
function parseHash(){
  var h=(location.hash||'').slice(1), m=/^day-(\d+)$/.exec(h);
  if(m){ return {v:'route',day:Math.min(N,+m[1])}; }
  for(var i=0;i<VIEWS.length;i++) if(VIEWS[i][0]===h) return {v:h,day:0};
  return {v:'overview',day:0};
}
var GROUP_NAMES=['Leon','Duncan','Christian','Stefan'];
var VGROUPS=[['plan','Plan',['overview','people','trip','links']],['route','Route',['route','weather','safety']],['kit','Kit',['gear','group','weight','compare']],['food','Food & prep',['food','training','prep']]];
function groupOf(v){ for(var i=0;i<VGROUPS.length;i++) if(VGROUPS[i][2].indexOf(v)>=0) return VGROUPS[i]; return VGROUPS[0]; }
function shell(){
  $('app').innerHTML='<datalist id="dgt-names">'+GROUP_NAMES.map(function(n){return '<option value="'+n+'">';}).join('')+'</datalist>'+'<div class="wrap" style="gap:18px;padding-top:0">'+
    '<div class="topbar"><div class="in tb-top"><a class="tb-mark" href="#overview" aria-label="DGT trip planner: overview">DGT</a><nav class="tb-groups" aria-label="Sections">'+
      VGROUPS.map(function(g){return '<a href="#'+g[2][0]+'" data-group="'+g[0]+'">'+g[1]+'</a>';}).join('')+'</nav></div>'+
      '<div class="in tb-sub"><nav class="tabs" aria-label="Pages in this section">'+
      VIEWS.map(function(v){return '<a href="#'+v[0]+'" data-tab="'+v[0]+'" data-g="'+groupOf(v[0])[0]+'">'+v[1]+'</a>';}).join('')+
    '</nav><span class="saved" id="saved"></span></div><div class="in tb-live" id="tb-live" hidden></div><div class="tb-stripes" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>'+
    VIEWS.map(function(v){return '<div class="view" data-view="'+v[0]+'" hidden></div>';}).join('')+
    '<footer>Route figures come from the group\'s GPX track. Gear lists show a typical weight on every line, counted in the totals until you type in your own. Weight classes follow the usual backpacking bands on base weight (ultralight under 4.5 kg, lightweight to 6.8 kg, traditional to 11.3 kg). Your gear, ticks and setups are private: saved in this browser, and in your own Claude account when you\'re signed in. Dates, bookings, the dates poll, who brings what and the group list are shared with everyone who opens this page.</footer>'+
  '</div>';
  showSaved();
}
function viewEl(v){return document.querySelector('[data-view="'+v+'"]');}
function show(v,day){
  var changed=v!==view; view=v;
  var gv=groupOf(v)[0];
  document.querySelectorAll('[data-group]').forEach(function(a){ if(a.dataset.group===gv) a.setAttribute('aria-current','true'); else a.removeAttribute('aria-current'); });
  document.querySelectorAll('[data-tab]').forEach(function(a){ a.hidden=a.dataset.g!==gv; if(a.dataset.tab===v) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  document.querySelectorAll('[data-view]').forEach(function(el){ el.hidden=el.dataset.view!==v; });
  var t=document.querySelector('[data-tab="'+v+'"]'); if(t){ var nv=t.parentNode; nv.scrollLeft=t.offsetLeft-(nv.clientWidth-t.offsetWidth)/2; }
  renderView(v); updateLive();
  if(v==='route') MAP.show(day||0);
  if(changed) window.scrollTo(0,0);
}
function renderView(v){
  var el=viewEl(v); if(!el) return;
  if(v==='route'){ renderRoute(el); return; }
  var f={overview:vOverview,people:PEOPLE.view,weather:vWeather,safety:vSafety,trip:vTrip,gear:function(){return vGear('p');},group:function(){return vGear('g');},weight:vWeight,compare:vCompare,food:vFood,training:vTraining,prep:vPrep,links:vLinks}[v];
  el.innerHTML=f();
  if(v==='gear'||v==='group') updateGear();
  if(v==='food') updateFood();
  if(v==='weight') drawPackChart();
}
function rerender(){ var y=window.scrollY; renderView(view); window.scrollTo(0,y); }
window.addEventListener('hashchange',function(){ var h=parseHash(); show(h.v,h.day); });

function setupSwitch(){
  return '<div class="seg" role="group" aria-label="Gear setup">'+['A','B'].map(function(k){
    return '<button data-setup="'+k+'" aria-pressed="'+(L.active===k)+'">'+esc(L.names[k])+' · '+kg(summary(L.lo[k]).base)+'</button>';
  }).join('')+'</div>';
}
var SER=[['base','var(--c1)','Base gear'],['food','var(--c2)','Food'],['water','var(--c3)','Water'],['fuel','var(--c4)','Fuel and other consumables']];
function compBar(s){
  var parts=[['base',s.base],['food',s.food],['water',s.water],['fuel',s.fuel+s.consOther]], tot=s.pack||1;
  return '<div class="compbar" role="img" aria-label="Pack at the trailhead: '+parts.map(function(p,i){return SER[i][2]+' '+kg(p[1]);}).join(', ')+'">'+
    parts.map(function(p,i){ return p[1]>0?'<span style="flex:'+p[1]+';background:'+SER[i][1]+'" title="'+SER[i][2]+' '+kg(p[1])+' ('+fmt(p[1]/tot*100)+'%)"></span>':''; }).join('')+'</div>'+
    '<div class="legend">'+parts.map(function(p,i){return '<span><i style="background:'+SER[i][1]+'"></i>'+SER[i][2]+' '+kg(p[1])+'</span>';}).join('')+'</div>';
}

/* ----- overview ----- */
function vOverview(){
  var on=datesOn(), n=on?daysBetween(today(),TS()):null;
  var startTxt=on?esc(short(TS())):'after the poll';
  return '<header class="ov-hero"><div class="ov-copy"><h1><span class="mark">DGT</span><span class="sub">Trip planner</span></h1>'+
      '<p class="lede">'+N+' days along the top of the uKhahlamba escarpment, from Sentinel car park to the Lesotho border post at Bushman\'s Nek. Dates, bookings, the route, and everyone\'s gear and food in one place.</p>'+
      '<dl class="ov-facts"><div><dt>Distance</dt><dd>'+fmt(totalKm)+' km</dd></div><div><dt>Climbing</dt><dd>'+fmt(totalUp)+' m</dd></div><div><dt>On the trail</dt><dd>'+N+' days</dd></div>'+
      '<div><dt>Start</dt><dd>'+startTxt+(on?'':' <a class="ov-poll" href="#trip">vote</a>')+'</dd></div></dl></div>'+
      '<img class="badge" src="'+BADGE+'" alt="Drakensberg Grand Traverse expedition badge: DGT, uKhahlamba, Barrier of Spears" width="260" height="260"></header>'+
    ME.card()+
    (on?'':POLL.card())+
    '<div class="ov-two"><section class="ov-sec" aria-labelledby="ov-gg-h"><div class="ov-h"><h2 id="ov-gg-h">Group gear</h2><a href="#group">Who brings what</a></div>'+
      '<p class="note">Shared items anyone can add. What you claim shows in My gear and counts in your pack.</p><div id="ov-gg">'+ovGG()+'</div></section>'+
    '<section class="ov-sec" aria-labelledby="ov-bk-h"><div class="ov-h"><h2 id="ov-bk-h">Bookings</h2><a href="#links">Shuttles and places to stay</a></div>'+ovBookings()+'</section></div>'+
    '<section class="ov-sec ov-data" aria-labelledby="ov-data-h"><h2 id="ov-data-h">Your data</h2><p class="note">Everything you tick or type saves on its own: in this browser, and privately to your Claude account when you\'re signed in, so it follows you to other devices. A backup code is a spare copy you can keep anywhere.</p>'+
        '<div class="toolbar" style="margin-top:10px"><button class="btn" data-act="backup">Copy backup code</button><button class="btn ghost" data-act="showrestore">Restore from a code</button><button class="btn ghost" data-act="tsv">Copy gear list for Google Sheets</button></div>'+
        '<div id="bk-out"></div>'+
        '<div id="restore" hidden style="margin-top:10px"><textarea class="code" id="restore-in" placeholder="Paste your backup code here, or rows copied from your tab in the group sheet (from the Setup header down)" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false"></textarea><div class="toolbar" style="margin-top:6px"><button class="btn primary" data-act="restore">Restore</button><label class="btn ghost" style="cursor:pointer">Load from a .txt file<input type="file" id="restore-file" accept=".txt,text/plain" hidden></label></div><div id="restore-msg" class="msg"></div></div>'+
    '</section>'+
    (T.notes?'<p class="note">'+esc(T.notes)+'</p>':'');
}
function ovGG(){
  var m=GG.mineList?GG.mineList():null, me=GG.me?GG.me():null;
  if(m===null) return '<p class="note">'+(GG.state&&GG.state()==='loading'?'Loading the shared list…':'Sign in to see who brings what.')+'</p>';
  var rows=m.map(function(x){ return '<li><span>'+esc(x.name)+(x.n>1?' ×'+x.n:'')+'</span><span class="ov-who">You'+(x.g?', '+fmt(x.g*x.n)+' g':'')+'</span></li>'; }).join('');
  return '<ul class="ov-list">'+(rows||'<li><span class="note" style="margin:0">You haven\'t picked anything yet.</span><a href="#group">Choose</a></li>')+
    (me&&me.open?'<li><span>'+me.open+' essential item'+(me.open>1?'s':'')+' still need someone</span><a href="#group">See what\'s left</a></li>':'')+'</ul>';
}
function ovBookings(){
  var open=T.bookings.filter(function(b){return b.status==='To book';}), done=T.bookings.length-open.length;
  return '<p class="note">'+done+' of '+T.bookings.length+' sorted.'+(datesOn()?'':' Dates follow once the poll is locked in; book flights first.')+'</p>'+
    '<ul class="ov-list">'+open.slice(0,5).map(function(b){ return '<li><span>'+esc(b.title)+'</span>'+(datesOn()&&b.date?'<span class="ov-who">'+esc(short(b.date))+'</span>':'')+'<span class="chip">To book</span></li>'; }).join('')+
    (open.length>5?'<li><a href="#trip">'+(open.length-5)+' more on Dates &amp; bookings</a></li>':'')+'</ul>'+
    (open.length<=5?'<p class="note"><a href="#trip">All bookings</a></p>':'');
}

/* ----- your trip: the personal panel at the top of Overview ----- */
var ME=(function(){
  function name(){ try{ return (localStorage.getItem('dgt-poll-name')||'').trim(); }catch(e){ return ''; } }
  function stat(href,k,v,s,warn){ return '<a class="me-stat'+(warn?' warn':'')+'" href="'+href+'"><span class="k">'+k+'</span><span class="v">'+v+'</span><span class="s">'+s+'</span></a>'; }
  function inner(){
    var nm=name(), s=summary(cur()), fd=food(), mc=fd.menu, f=L.food, t=+f.kcal||0;
    var prepDone=S.prep.filter(function(p){return L.prep[p.id];}).length, prepLeft=S.prep.length-prepDone;
    var gg=GG.me?GG.me():null, poll=POLL.mine?POLL.mine():null, ppl=PEOPLE.mine?PEOPLE.mine():null;
    var miss=s.miss.length, short=mc&&t?t-fd.kcal:0;
    var stats=
      stat('#gear','Pack at the start',kg(s.pack),(estList(s).length?'estimate, base '+kg(s.base):'base '+kg(s.base)+', '+esc(L.names[L.active])),miss>0||estList(s).length>0)+
      (mc?stat('#food','Food a day',fmt(fd.kcal)+' kcal',(short>50?fmt(short)+' under your '+fmt(t)+' target':fmt(fd.perDay)+' g a day, target '+fmt(t)),short>50):stat('#food','Food a day','No menu','estimate: '+fmt(fd.perDay)+' g',true))+
      (gg?stat('#group','You\'re bringing',gg.items.length?gg.items.length+' item'+(gg.items.length>1?'s':''):'Nothing yet',gg.items.length?kg(gg.g)+' of group gear':(gg.open?gg.open+' essentials unclaimed':'all covered'),!gg.items.length&&gg.open>0)
          :stat('#group','You\'re bringing','—','sign in to see group gear'))+
      stat('#prep','Before you go',prepDone+' of '+S.prep.length,prepLeft?prepLeft+' left':'all done',false)+
      (function(){ var b=burnEst(); return b?stat('#food','By Bushman\'s Nek',(b.kg>0.05?'−'+fmt(b.kg,1)+' kg':'± 0 kg'),'body weight, food against effort',false):''; })();
    var todo=[];
    if(!nm) todo.push(['#trip','Put your name in the dates poll so the planner knows which answers and gear are yours']);
    if(poll===false&&T.datesStatus!=='Confirmed') todo.push(['#trip','Answer the dates poll']);
    if(ppl===false&&datesOn()) todo.push(['#people','Add your flights and travel details']);
    if(miss) todo.push(['#gear','Tick or replace '+miss+' essential item'+(miss>1?'s':'')+' in '+esc(L.names[L.active])]);
    if(!mc) todo.push(['#food','Build your food menu']);
    else if(short>50) todo.push(['#food','Your menu is about '+fmt(short)+' kcal a day short of your target']);
    if(+f.spare<BUFFER) todo.push(['#food','Add food for the '+BUFFER+' buffer days']);
    if(gg&&!gg.items.length) todo.push(['#group','Choose the group gear you\'ll carry'+(gg.open?' ('+gg.open+' essentials still unclaimed)':'')]);
    if(prepLeft) todo.push(['#prep',prepLeft+' thing'+(prepLeft>1?'s':'')+' left on your before-you-go list']);
    var cd=''; if(TS()){ var n=daysBetween(today(),TS()); cd=n>0?n+' days to the start':(daysBetween(today(),endDate())>=0?'On the trail':'Trip completed'); }
    var lbl=function(h){ var v=h.slice(1), f=VIEWS.filter(function(x){return x[0]===v;})[0]; return f?f[1]:''; };
    return '<div class="me-head"><h2 id="me-h">'+(nm?esc(nm)+'\'s trip':'Your trip')+'</h2><span class="me-cd">'+(cd?'<b>'+esc(cd.replace(/ to the start$/,''))+'</b>'+(/days/.test(cd)?' to the start':''):'Dates waiting on the poll')+'</span></div>'+
      '<div class="me-stats">'+stats+'</div>'+
      (todo.length?'<h3 class="me-th">Still to do</h3><ul class="me-todo">'+todo.map(function(x){ return '<li><a href="'+x[0]+'"><span class="c" aria-hidden="true"></span><span class="t">'+x[1]+'</span><span class="w">'+esc(lbl(x[0]))+'</span></a></li>'; }).join('')+'</ul>'
        :'<p class="okbox">You\'re up to date. Check back as the group fills in the plan.</p>');
  }
  function card(){ return '<section class="me" id="me-card" aria-labelledby="me-h">'+inner()+'</section>'; }
  function refresh(){ var el=$('me-card'); if(el&&view==='overview') el.innerHTML=inner(); }
  return {card:card,refresh:refresh};
})();

/* ----- links: shuttles, places to stay, permits. Kept with the trip details (the organiser edits, everyone sees) ----- */
var LINK_CATS=['Shuttles','Accommodation','Permits & planning','Maps & gear','Other'];
var linkEdit=null, linkMsg='';
function host(u){ try{ return new URL(u).hostname.replace(/^www\./,''); }catch(e){ return ''; } }
function vLinks(){
  var ls=T.links||[];
  if(linkEdit) return linksForm();
  var open=T.bookings.filter(function(b){ return b.status==='To book'; });
  var groups=LINK_CATS.map(function(c){ return [c,ls.filter(function(l){ return (l.cat||'Other')===c; })]; }).filter(function(g){ return g[1].length; });
  return '<div class="head" style="padding-top:12px"><div><h2>Links</h2><p class="note">Shuttles, places to stay and permits for the start at Witsieshoek and the finish at Bushman\'s Nek. Prices and timetables change: check with the operator before booking.</p></div>'+
    (canEdit?'<button class="btn" data-act="links-edit">Edit links</button>':'')+'</div>'+
    (open.length?'<div class="card lk-todo"><h3>Still to book</h3><ul>'+open.map(function(b){ return '<li><b>'+esc(b.title)+'</b>'+(b.date&&datesOn()?' <span class="lk-d">'+esc(short(b.date))+'</span>':'')+(b.details?'<span class="sub">'+esc(b.details)+'</span>':'')+'</li>'; }).join('')+'</ul><p class="note">Mark bookings done on <a href="#trip">Dates &amp; bookings</a>.</p></div>':'')+
    (groups.length?groups.map(function(g){ return '<section class="card lk-cat"><h3>'+esc(g[0])+'</h3><ul class="lk-list">'+g[1].map(function(l){
        return '<li><a href="'+esc(l.url)+'" target="_blank" rel="noopener">'+esc(l.title||host(l.url))+'</a><span class="lk-host mono">'+esc(host(l.url))+'</span>'+(l.note?'<p>'+esc(l.note)+'</p>':'')+'</li>'; }).join('')+'</ul></section>'; }).join('')
      :'<div class="card"><p class="empty">No links yet.</p></div>')+
    (canEdit?'':'<p class="note">Found something useful? Send it to Leon in the group chat and he\'ll add it here.</p>')+
    (linkMsg?'<div class="msg '+(linkMsg.indexOf('Saved')===0?'ok':'bad')+'">'+esc(linkMsg)+'</div>':'');
}
function linksForm(){
  return '<div class="head" style="padding-top:12px"><div><h2>Edit links</h2><p class="note">Everyone sees these. Saving publishes them for the group.</p></div></div>'+
    '<div class="card lk-edit">'+linkEdit.map(function(l,i){ return '<div class="lk-row" data-li="'+i+'">'+
      '<label class="field">Title<input data-lk="title" value="'+esc(l.title||'')+'"></label>'+
      '<label class="field">Web address<input data-lk="url" inputmode="url" autocapitalize="off" value="'+esc(l.url||'')+'" placeholder="https://"></label>'+
      '<label class="field">Section<select data-lk="cat">'+LINK_CATS.map(function(c){ return '<option'+(c===(l.cat||'Other')?' selected':'')+'>'+esc(c)+'</option>'; }).join('')+'</select></label>'+
      '<label class="field lk-wide">Note<input data-lk="note" value="'+esc(l.note||'')+'"></label>'+
      '<button class="fd-x" data-act="links-rm" aria-label="Remove this link">×</button></div>'; }).join('')+
    '<div class="toolbar" style="margin-top:12px"><button class="btn" data-act="links-add">+ Add a link</button><button class="btn primary" data-act="links-save"'+(saving?' disabled':'')+'>'+(saving?'Saving…':'Save links')+'</button><button class="btn ghost" data-act="links-cancel">Cancel</button></div>'+(linkMsg?'<div class="msg bad">'+esc(linkMsg)+'</div>':'')+'</div>';
}
/* publish a changed copy of the trip details (organiser only) */
async function publishTrip(next,okMsg){
  if(saving) return false; saving=true;
  try{ var art=await claude.use('artifact'); if(!art) throw {code:'not_granted'};
    await art.publish(buildDoc(next)); T=next; setPlan(myDays()); MAP.replan(); saving=false; return true; }
  catch(err){ saving=false; var c=err&&err.code; alertMsg(c==='not_writer'||c==='not_granted'?'Only the organiser can change this.':c==='conflict'?'Someone else saved at the same moment. Reload and try again.':'Saving didn\'t work ('+(c||'unknown error')+'). Try again.'); return false; }
}
function alertMsg(m){ linkMsg=m; }
/* lock the trip to the week the group picked in the poll */
async function lockDates(o,btn){
  if(btn.dataset.armed!=='1'){ btn.dataset.armed='1'; btn.textContent='Tap again to lock in '+o.title.replace(/^Week/,'the week'); btn.classList.add('armed'); return; }
  var next=JSON.parse(JSON.stringify(T)), delta=T.start?daysBetween(T.start,o.start):0;
  next.start=o.start; next.datesStatus='Confirmed';
  if(delta){ next.bookings.forEach(function(b){ if(b.date) b.date=addDays(b.date,delta); }); if(next.arrive) next.arrive=addDays(next.arrive,delta); if(next.depart) next.depart=addDays(next.depart,delta); }
  btn.disabled=true; btn.textContent='Saving…';
  var ok=await publishTrip(next); if(ok){ location.hash='#trip'; rerender(); } else { btn.disabled=false; btn.textContent='Lock in '+o.title.replace(/^Week/,'the week'); btn.dataset.armed=''; }
}

/* ----- the live figures bar under the header: the same numbers in the same place while you edit ----- */
function updateLive(){
  var el=$('tb-live'); if(!el) return; var g=groupOf(view)[0], h='';
  if(g==='kit'){ var s=summary(cur()); h='<span class="lv-name">'+esc(L.names[L.active])+'</span><span><b>'+kg(s.base)+'</b> base</span><span><b>'+kg(s.worn)+'</b> worn</span><span><b>'+kg(s.pack)+'</b> pack at the start'+(estList(s).length?' <span class="lv-est">estimate</span>':'')+'</span><span class="lv-opt"><b>'+kg(s.skin)+'</b> skin-out</span>'+(s.miss.length?'<span class="lv-warn">'+s.miss.length+' essential'+(s.miss.length>1?'s':'')+' not ticked</span>':''); }
  else if(view==='food'){ var fd=food(), t=+L.food.kcal||0, b=burnEst(); h='<span class="lv-name">'+esc((fMenu()||{}).name||'Quick estimate')+'</span><span'+(fd.menu&&t&&fd.kcal<t-50?' class="lv-warn"':'')+'><b>'+fmt(fd.kcal)+'</b> of '+fmt(t)+' kcal a day</span><span><b>'+fmt(fd.perDay)+' g</b> a day</span><span><b>'+kg(fd.total)+'</b> to carry'+(fd.menu?'':' <span class="lv-est">estimate</span>')+'</span>'+(b?'<span class="lv-opt"><b>'+(b.kg>0.05?'−'+fmt(b.kg,1):'±0')+' kg</b> body weight</span>':''); }
  el.innerHTML=h; el.hidden=!h; setHdr();
}
function setHdr(){ var tb=document.querySelector('.topbar'); if(tb) document.documentElement.style.setProperty('--hdr',tb.offsetHeight+'px'); }
window.addEventListener('resize',function(){ clearTimeout(window._hdrT); window._hdrT=setTimeout(setHdr,150); });

/* ----- route ----- */
function renderRoute(el){
  if(!el.dataset.built){
    el.dataset.built='1';
    el.innerHTML='<div class="head" style="padding-top:12px"><div><h2>Route map</h2><p class="note">Drag to move, scroll or pinch to zoom. Pick a day to zoom to it. Tap a cave, peak, water point or camp zone for details and coordinates.</p></div></div>'+
      '<div id="plan-card"></div>'+MAP.markup()+'<div id="route-table"></div>';
  }
  $('plan-card').innerHTML=planCard();
  var rows=PLAN.stages.map(function(d,i){
    var dt=stageDate(i), now=dt&&dt===today(), last=i===PLAN.stages.length-1;
    return '<tr class="click'+(now?' now':'')+'" data-goday="'+d.day+'"><td class="r"><b>'+d.day+'</b></td><td class="r">'+(dt?esc(short(dt)):'')+'</td>'+
    '<td>'+esc(PLAN.original?S.days[i].stage:d.title)+'<span class="sub">'+(last?'Finish':({zone:'Camp area',cave:'Sleeping cave',wild:'Wild camp'}[d.camp.kind])+': '+esc(d.camp.name))+'</span></td>'+
    '<td class="r">'+fmt(d.dist,1)+'</td><td class="r">'+fmt(d.up)+'</td><td class="r hide-s">'+fmt(d.down)+'</td><td class="r hide-s">'+fmt(d.max)+'</td></tr>';
  }).join('');
  var mx=PLAN.stages.reduce(function(a,s){return Math.max(a,s.dist+s.up/100);},1);
  $('route-table').innerHTML='<div class="card scroll"><table class="t"><thead><tr><th class="r">Day</th><th class="r">Date</th><th>Stage</th><th class="r">km</th><th class="r">Up m</th><th class="r hide-s">Down m</th><th class="r hide-s">High m</th></tr></thead><tbody>'+rows+
    '</tbody><tfoot><tr><td></td><td></td><td><b>Total</b></td><td class="r"><b>'+fmt(totalKm,1)+'</b></td><td class="r"><b>'+fmt(PLAN.stages.reduce(function(a,s){return a+s.up;},0))+'</b></td><td class="hide-s"></td><td class="r hide-s"><b>'+fmt(highest)+'</b></td></tr></tfoot></table></div>'+
    '<p class="note">Tap a row to zoom the map to that day.</p>';
}

function planCard(){
  var st=PLAN.stages, n=st.length, g=groupDays();
  var avgKm=totalKm/n, avgUp=st.reduce(function(a,s){return a+s.up;},0)/n;
  var counts={zone:0,cave:0,wild:0}; st.slice(0,-1).forEach(function(s){counts[s.camp.kind]++;});
  var mx=Math.max.apply(null,st.map(function(s){return s.dist+s.up/100;}));
  var md=Math.max.apply(null,st.map(function(s){return s.dist;}));
  var bars='<div class="effort" role="img" aria-label="Distance per day">'+st.map(function(s){return '<span title="Day '+s.day+': '+fmt(s.dist,1)+' km, +'+fmt(s.up)+' m"><em>'+fmt(s.dist,0)+'</em><i style="height:'+(s.dist/md*58).toFixed(0)+'px"></i><b>D'+s.day+'</b></span>';}).join('')+'</div>';
  return '<div class="card plan"><h3>Plan the days</h3><p class="note">Change the number of trail days to see how the distances and camps shift. Camps are picked to even out each day\'s effort.</p><div class="plan-top"><label class="field" style="flex:1;min-width:220px">Trip length<input type="range" min="'+MIN_DAYS+'" max="'+MAX_DAYS+'" step="1" value="'+n+'" data-act="days" aria-label="Days on the trail"></label>'+
    '<div class="sum-big" id="days-out">'+n+' days</div></div>'+
    '<div class="plan-stats"><span>Average <b>'+fmt(avgKm,1)+' km</b> and <b>'+fmt(avgUp)+' m</b> up a day</span><span>Longest day <b>'+fmt(PLAN.maxDist,1)+' km</b></span><span>Camps: '+
      [counts.zone?counts.zone+' known camp area'+(counts.zone>1?'s':''):'',counts.cave?counts.cave+' sleeping cave'+(counts.cave>1?'s':''):'',counts.wild?counts.wild+' wild camp'+(counts.wild>1?'s':''):''].filter(Boolean).join(', ')+'</span>'+
      (TS()?'<span>'+esc(short(TS()))+' – '+esc(short(endDate()))+'</span>':'')+'</div>'+bars+
    '<p class="note">'+(PLAN.original?'11 days follows the route guide\'s camps.':'Camp spots are chosen to even out each day\'s effort (distance plus 1 km for every 100 m of climbing), preferring known camp areas, then sleeping caves close to the line.')+
    ' Bars show kilometres per day.</p>'+
    (n!==g?'<div class="warnbox">You\'re looking at '+n+' days; the group plan is '+g+' days. <button class="linkbtn" data-act="days-reset">Back to the group plan</button>'+(canEdit?' · <button class="linkbtn" data-act="days-save">Make '+n+' days the group plan</button>':'')+'</div>':'<div class="okbox">This is the group plan: '+g+' days.</div>')+
  '</div>';
}
/* ----- gear (personal and group) ----- */
var openIds={}, openAdd={};
function itemRow(it){
  var lo=cur(), s=stOf(lo,it.id), on=isOn(it,s), ps=partsOf(it,s), open=!!openIds[it.id], q=qtyOf(it,s), mine=!!(s.mine&&s.mine.trim());
  var showQty=it.scope==='g'||q!==1;
  var html='<div class="item'+(on?'':' off')+(mine?' mine':'')+'" data-id="'+it.id+'">'+
    '<input type="checkbox" id="c-'+it.id+'" data-act="on"'+(on?' checked':'')+' aria-label="Take '+esc(nameOf(it,s))+'">'+
    '<div class="nm"><label for="c-'+it.id+'"><span id="t-'+it.id+'">'+esc(nameOf(it,s))+'</span>'+(it.essential?' <span class="pill ess">essential</span>':'')+'</label>'+
      '<span class="n" id="n-'+it.id+'">'+noteText(it,s)+'</span></div>'+
    (showQty?'<label class="qty">×<input type="number" min="0" step="1" inputmode="numeric" data-act="qty" value="'+q+'" aria-label="How many"></label>':'<span class="nq"></span>')+
    '<div class="g"><input type="number" min="0" step="5" inputmode="numeric" data-act="g"'+(isEst(it,s)?' class="est" title="Typical weight, counted until you type in yours"':'')+' value="'+(unitOf(it,s)||'')+'" placeholder="'+(it.typ?'~'+it.typ:'0')+'" aria-label="Grams for '+esc(nameOf(it,s))+(showQty?' (each)':'')+'"><span>g</span></div>'+
    '<button class="exp" data-act="tog" aria-expanded="'+open+'" title="Your item and parts" aria-label="'+(open?'Close':'Edit')+' '+esc(nameOf(it,s))+'">'+(open?'▾':'▸')+'</button></div>';
  if(open){
    html+='<div class="parts" data-pfor="'+it.id+'">'+
      (it.custom?'<label class="field mine-f">Name<input data-act="cname" value="'+esc(it.name)+'"></label>'
        :'<label class="field mine-f">Your item for “'+esc(it.name)+'”<input data-act="mine" value="'+esc(s.mine||'')+'" placeholder="Brand and model, e.g. '+esc(EXAMPLES[it.id]||'what you\'re taking')+'" autocomplete="off"></label>')+
      (ps.length?'<div class="plabel">Parts <span>tick what you take, rename or re-weigh any part</span></div>':'')+
      ps.map(function(p){
        return '<div class="part'+(p.on?'':' off')+'" data-pid="'+p.id+'"><input type="checkbox" data-act="pon"'+(p.on?' checked':'')+' aria-label="Take '+esc(p.name)+'">'+
          '<input class="pn" data-act="pname" value="'+esc(p.name)+'" aria-label="Part name"'+(p.cons?' title="Consumable"':'')+'>'+
          '<div class="g"><input type="number" min="0" step="5" inputmode="numeric" data-act="pg" value="'+(p.g||'')+'" placeholder="'+(p.typ?'~'+p.typ:'0')+'" aria-label="Grams for '+esc(p.name)+'"><span>g</span></div>'+
          (p.extra?'<button class="rm" data-act="prm" aria-label="Remove '+esc(p.name)+'">×</button>':'<span></span>')+'</div>';
      }).join('')+
      '<div class="addpart"><input placeholder="Add a part, e.g. stuff sack" data-new="name" aria-label="New part name"><input type="number" min="0" inputmode="numeric" placeholder="grams" data-new="g" aria-label="New part grams"><button class="btn" data-act="padd">Add</button></div>'+
      '<div class="pnote"><span id="m-'+it.id+'">'+modeText(it,s)+'</span>'+
      (it.custom?'<button class="linkbtn" data-act="irm">Remove this item</button>':(mine||s.p||s.xp||s.g!=null?'<button class="linkbtn" data-act="slotreset">Back to the typical item</button>':''))+'</div></div>';
  }
  return html;
}
var EXAMPLES={};
function noteText(it,s){
  var bits=[]; if(s.mine&&s.mine.trim()) bits.push('For: '+esc(it.name)); else if(it.note) bits.push(esc(it.note));
  var q=qtyOf(it,s), n=partsOf(it,s).length;
  if(n) bits.push(n+' part'+(n>1?'s':''));
  if(q>1) bits.push('total '+kg(unitOf(it,s)*q));
  return bits.join(' · ');
}
function modeText(it,s){
  var ps=partsOf(it,s);
  if(!ps.length) return 'Add parts if you want to weigh it piece by piece.';
  return modeOf(it,s)==='parts'?'Weight is the sum of the ticked parts.':'Using the total you typed. <button class="linkbtn" data-act="useparts">Use the sum of parts instead</button>';
}
/* group gear you've said you'll bring (Group gear > Who brings what) shows in My gear and counts in your pack */
function claimedHTML(){
  var m=typeof GG!=='undefined'&&GG.mineList?GG.mineList():null, st=GG.state?GG.state():'';
  var head=function(r){ return '<div class="cat-h"><h3>Group gear you\'re bringing</h3><span class="cat-t">'+r+'</span></div>'; };
  if(m===null) return head('')+'<p class="note">'+(st==='loading'?'Loading the shared list…':'Sign in to see the group gear you\'ve claimed.')+'</p>';
  if(!m.length) return head('')+'<p class="note">Nothing yet. Pick items under <a href="#group">Group gear</a> and they appear here and count in your pack weight.</p>';
  var tot=m.reduce(function(a,x){return a+x.g*x.n;},0);
  return head(m.length+' item'+(m.length>1?'s':'')+', '+kg(tot))+m.map(function(x){
      return '<div class="item claimed" data-id="'+esc(x.id)+'"><span class="ck" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></span>'+
        '<div class="nm"><span>'+esc(x.name)+(x.n>1?' ×'+x.n:'')+'</span><span class="n">'+(x.g?'':'No weight yet: weigh it on Group gear')+'</span></div><span class="nq"></span>'+(x.cat?'<div class="g"><input type="number" min="0" step="5" inputmode="numeric" data-act="g" value="'+(x.g||'')+'" aria-label="Grams for '+esc(x.name)+'"></div><span class="u">g'+(x.n>1?' ×'+x.n:'')+'</span>':'<div class="cw">'+(x.g?fmt(x.g*x.n)+' g':'—')+'</div><span></span>')+'</div>'; }).join('')+
    dupWarn()+
    (L.groupLoad!=null&&!(+L.groupLoad===0&&tot>0)?'<p class="note">You typed your own group load ('+kg(L.groupLoad)+') on Group gear, so that is used instead. <button class="linkbtn" data-act="gload-clear">Use what you\'ve claimed</button></p>':'<p class="note">Change what you bring on <a href="#group">Group gear</a>.</p>');
}
/* someone who made their own "group kit" category before claiming would count the same things twice */
function dupWarn(){ var lo=cur(), hit=[];
  (lo.custom||[]).forEach(function(it){ if(it.scope==='p'&&/group/i.test(it.cat||'')&&isOn(it,stOf(lo,it.id))){ var c=hit.filter(function(h){return h.c===it.cat;})[0]; if(!c){ c={c:it.cat,g:0,n:0}; hit.push(c); } c.g+=weightOf(it,stOf(lo,it.id)); c.n++; } });
  return hit.map(function(h){ return '<p class="warnbox">Your own category “'+esc(h.c)+'” also counts '+kg(h.g)+'. If it holds the same things you\'ve claimed here, untick or remove those items there so they aren\'t counted twice.</p>'; }).join(''); }
function vGear(scope){
  var lo=cur(), its=items(lo,scope), cats=catList(lo,scope), group=scope==='g';
  var list=cats.map(function(c){
    var mine=its.filter(function(i){return i.cat===c.name;});
    var key=scope+'|'+c.name;
    return '<div class="cat"><div class="cat-h"><h3>'+esc(c.name)+(c.kind!=='base'?'<span class="kindpill">'+KIND[c.kind].toLowerCase()+'</span>':'')+(c.big3?'<span class="kindpill">big three</span>':'')+'</h3>'+
      '<span><span class="mono" data-cat="'+esc(c.name)+'"></span>'+(c.custom&&!mine.length?'<button class="x2" data-act="catrm" data-cat="'+esc(c.name)+'" aria-label="Remove category '+esc(c.name)+'">×</button>':'')+'</span></div>'+
      mine.map(itemRow).join('')+
      (openAdd[key]
        ?'<div class="addin" data-addcat="'+esc(c.name)+'"><input data-ai="name" placeholder="Item name" aria-label="New item in '+esc(c.name)+'"><input data-ai="g" type="number" min="0" inputmode="numeric" placeholder="grams" aria-label="Grams"><button class="btn" data-act="ai-add" data-scope="'+scope+'">Add</button><button class="btn ghost" data-act="ai-cancel">Cancel</button></div>'
        :'<button class="addbtn" data-act="ai-open" data-key="'+esc(key)+'">+ Add item to '+esc(c.name)+'</button>')+
      '</div>';
  }).join('');
  var intro=group
    ?'Shared kit: cooking, navigation and communication, and first aid. Each person\'s share is the total divided by the group, unless you enter what you actually carry. The gas itself counts as a consumable; stoves, pots and empty canisters count as base weight.'
    :'Your own kit, including your tent. The grey number on each line is a typical weight: it counts in your totals until you weigh your own and type it in, so your totals start as an estimate. Open ▸ to put in your own item (brand and model) and to weigh it part by part. Use “+ Add item” only for things that don\'t fit a line. Each category counts as carried gear, worn, or consumable.';
  var s=summary(lo);
  var side=group
    ?'<div class="card sticky"><div class="eyebrow">Group gear, '+esc(L.names[L.active])+'</div><div class="sum-big" id="g-total"></div>'+
      '<div style="margin-top:12px" class="fields"><label class="field">People in the group<input type="number" min="1" max="20" data-act="gsize" value="'+L.groupSize+'"></label>'+
      '<label class="field">Group gear you carry (g)<input type="number" min="0" data-act="gload" placeholder="'+(s.claimed>0?'what you claimed':'even split')+'" value="'+(L.groupLoad!=null?L.groupLoad:'')+'"></label></div>'+
      '<div style="margin-top:8px"><div class="sum-row"><span>Even split per person</span><b id="g-even"></b></div>'+
      '<div class="sum-row"><span>Your share, base weight</span><b id="g-sbase"></b></div>'+
      '<div class="sum-row" style="border:0"><span>Your share, gas (consumable)</span><b id="g-sfuel"></b></div></div>'+
      '<div id="g-warn"></div><p class="note">Leave "you carry" empty to use what you\'ve said you\'ll bring above (or an even split if you haven\'t picked anything).</p></div>'
    :'<div class="card sticky"><div class="eyebrow">'+esc(L.names[L.active])+'</div>'+
      '<div class="sum-row"><span><b>Base weight</b></span><b id="g-base"></b></div>'+
      '<div class="sum-row sub"><span id="g-share-l">of which group gear</span><b id="g-share"></b></div>'+
      '<div class="sum-row"><span>Worn weight</span><b id="g-worn"></b></div>'+
      '<div class="sum-row"><span>Consumables</span><b id="g-cons"></b></div>'+
      '<div class="sum-row" style="border:0"><span><b>Pack at the start</b></span><b id="g-pack"></b></div><div id="g-est"></div>'+
      '<div id="g-comp"></div><div class="note" id="g-cls" style="margin-top:8px"></div>'+
      '<div id="g-warn"></div><p class="note"><a href="#weight">Full weight breakdown</a> · food and water are set on <a href="#food">Food &amp; fuel</a>.</p></div>';
  return '<div class="head" style="padding-top:12px"><div><h2>'+(group?'Group gear':'My gear')+'</h2><p class="note">'+intro+'</p></div>'+
    '<div class="toolbar">'+setupSwitch()+'<button class="btn ghost" data-act="reset-scope" data-scope="'+scope+'">Reset this list</button></div></div>'+
    (group?GG.card()+'<h3 style="margin-top:6px">What the group\'s kit weighs</h3><p class="note" style="margin-top:-6px">Your own copy for working out pack weight: tick, weigh and split it here. Saved in this browser only.</p>':'')+
    '<div class="gear-grid"><div class="card">'+(group?'':'<div class="cat" id="g-claimed">'+claimedHTML()+'</div>')+list+
    '<div class="addrow" style="grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) auto"><label class="field">New category<input id="new-cat-name" placeholder="'+(group?'e.g. Repair kit':'e.g. Photography')+'"></label>'+
    '<label class="field">Counts as<select id="new-cat-kind"><option value="base">Carried gear (base weight)</option><option value="worn">Worn</option><option value="cons">Consumable</option></select></label>'+
    '<button class="btn" data-act="cat-add" data-scope="'+scope+'">Add category</button></div></div>'+side+'</div>';
}
function updateGear(){
  var lo=cur(), s=summary(lo);
  var set=function(id,t){var e=$(id); if(e) e.textContent=t;};
  set('g-base',kg(s.base)); set('g-share',kg(s.shareBase)); set('g-share-l','of which group gear'+(s.evenSplit?' (even split)':''));
  if($('g-est')){ var el2=estList(s); $('g-est').innerHTML=el2.length?'<p class="estbox"><b>This is an estimate.</b> '+el2.map(function(x){return x.charAt(0).toUpperCase()+x.slice(1);}).join('. ')+'.</p>':'<p class="estbox done">Everything ticked is weighed: these are your real numbers.</p>'; } set('g-worn',kg(s.worn)); set('g-cons',kg(s.cons)); set('g-pack',kg(s.pack));
  set('g-total',kg(s.group)); set('g-even',kg(s.group/Math.max(1,+L.groupSize||1))); set('g-sbase',kg(s.shareBase)); set('g-sfuel',kg(s.shareFuel));
  if($('g-comp')) $('g-comp').innerHTML=compBar(s);
  if($('g-cls')) $('g-cls').innerHTML='Base weight class: <b>'+esc(s.cls)+'</b>. Big Three (pack, shelter, sleep) are '+fmt(s.big3pct)+'% of your own base gear.';
  var gw=$('g-warn');
  if(gw){ var m=view==='group'?s.gmiss:s.miss; gw.innerHTML=m.length?'<div class="warnbox">'+m.length+' essential '+(m.length>1?'lines':'line')+' not ticked: '+m.slice(0,6).map(esc).join(', ')+(m.length>6?' and '+(m.length-6)+' more':'')+'. Tick them, or put your own item in them with ▸.</div>':'<div class="okbox">All essential items ticked.</div>'; }
  var all=items(lo), sc=view==='group'?'g':'p';
  document.querySelectorAll('[data-cat]').forEach(function(el){
    if(el.tagName==='BUTTON') return;
    var c=el.getAttribute('data-cat'),t=0,n=0,on=0;
    var est=0; all.forEach(function(i){ if(i.cat===c&&i.scope===sc){ var st=stOf(lo,i.id); n++; if(isOn(i,st)){on++; t+=weightOf(i,st); if(isEst(i,st)) est++;} } });
    el.textContent=on+' of '+n+', '+(est?'about ':'')+kg(t);
  });
  document.querySelectorAll('.seg [data-setup]').forEach(function(b){ var k=b.dataset.setup; b.textContent=L.names[k]+' · '+kg(summary(L.lo[k]).base); });
}
function findItem(id){ var a=items(cur()); for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; return null; }

/* ----- weight dashboard ----- */
function gaugeHtml(base){
  var max=14000, pos=Math.min(base,max)/max*100, edges=[0,4536,6804,11340,max];
  return '<div class="gauge" role="img" aria-label="Base weight '+kg(base)+'"><div class="mk" style="left:'+pos.toFixed(1)+'%"><b>'+kg(base)+'</b></div>'+
    '<div class="bands">'+CLASSES.map(function(c,i){var w=(edges[i+1]-edges[i])/max*100;return '<span style="flex:0 0 calc('+w.toFixed(2)+'% - 2px)" class="'+(base>=edges[i]&&base<edges[i+1]||(i===3&&base>=edges[3])?'on':'')+'"></span>';}).join('')+'</div>'+
    '<div class="lbls">'+CLASSES.map(function(c,i){var w=(edges[i+1]-edges[i])/max*100;return '<span style="flex:0 0 calc('+w.toFixed(2)+'% - 2px)">'+c[1]+'<br>'+(i<3?'to '+fmt(edges[i+1]/1000,1)+' kg':'above')+'</span>';}).join('')+'</div></div>';
}
function vWeight(){
  var lo=cur(), s=summary(lo), cats=catList(lo,'p').filter(function(c){return c.kind==='base';});
  var rows=cats.map(function(c){return {name:c.name,g:s.cats[c.name]||0,b3:!!c.big3};});
  rows.push({name:'Share of group gear',g:s.shareBase,b3:false});
  rows.sort(function(a,b){return b.g-a.g;});
  var mx=Math.max.apply(null,rows.map(function(r){return r.g;}).concat([1]));
  var g=gasPlan();
  return '<div class="head" style="padding-top:12px"><div><h2>Weight</h2><p class="note">Base weight is everything you carry that doesn\'t get used up. Worn weight is on your body. Consumables (food, water, gas) shrink as the days go by.</p></div><div class="toolbar">'+setupSwitch()+'</div></div>'+
    '<div class="hero">'+
      '<div class="tile"><div class="k"><span class="dot" style="background:var(--c1)"></span>Base weight</div><div class="v">'+kg(s.base)+'</div><div class="s">'+kg(s.pBase)+' own + '+kg(s.shareBase)+' group</div></div>'+
      '<div class="tile"><div class="k">Worn weight</div><div class="v">'+kg(s.worn)+'</div><div class="s">boots, clothes, poles</div></div>'+
      '<div class="tile"><div class="k">Consumables</div><div class="v">'+kg(s.cons)+'</div><div class="s">food, water, gas at the start</div></div>'+
      '<div class="tile"><div class="k">Pack at the start</div><div class="v">'+kg(s.pack)+'</div><div class="s">base + consumables</div></div>'+
      '<div class="tile"><div class="k">Skin-out</div><div class="v">'+kg(s.skin)+'</div><div class="s">pack + worn</div></div>'+
    '</div>'+ADVICE.card()+
    '<div class="grid2">'+
      '<div class="card"><h3>What\'s in your pack at the trailhead</h3>'+compBar(s)+
        '<div class="scroll" style="margin-top:10px"><table class="t"><tbody>'+
        '<tr><td>Base gear</td><td class="r">'+kg(s.base)+'</td><td class="r">'+fmt(s.base/s.pack*100)+'%</td></tr>'+
        '<tr><td>Food ('+fmt(food().days,1)+' days × '+fmt(food().perDay)+' g)</td><td class="r">'+kg(s.food)+'</td><td class="r">'+fmt(s.food/s.pack*100)+'%</td></tr>'+
        '<tr><td>Water ('+fmt(L.food.water,1)+' L)</td><td class="r">'+kg(s.water)+'</td><td class="r">'+fmt(s.water/s.pack*100)+'%</td></tr>'+
        '<tr><td>Gas (your share) and other consumables</td><td class="r">'+kg(s.fuel+s.consOther)+'</td><td class="r">'+fmt((s.fuel+s.consOther)/s.pack*100)+'%</td></tr></tbody></table></div></div>'+
      '<div class="card"><h3>Base weight class</h3><p class="note">'+esc(s.cls)+'. Classes are judged on base weight only, so your full pack sits well above it.</p>'+gaugeHtml(s.base)+
        '<div class="sum-row" style="margin-top:14px"><span>Big Three (pack, shelter, sleep)</span><b>'+kg(s.big3)+'</b></div>'+
        '<div class="sum-row" style="border:0"><span>Share of your own base gear</span><b>'+fmt(s.big3pct)+'%</b></div>'+
        '<p class="note">'+(s.big3pct>=55?'The Big Three dominate your base weight; a lighter pack, tent or sleeping bag is where the big savings are.':'Your Big Three are already a modest share; the smaller items are adding up.')+'</p></div>'+
    '</div>'+
    '<div class="card"><h3>Base weight by category</h3><p class="note" style="margin-bottom:8px">Darker bars are the Big Three.</p>'+
      rows.map(function(r){return '<div class="hbar"><span class="nm" title="'+esc(r.name)+'">'+esc(r.name)+'</span><span class="tr"><i class="'+(r.b3?'b3':'')+'" style="width:'+(r.g/mx*100).toFixed(1)+'%"></i></span><span class="vv">'+kg(r.g)+'</span></div>';}).join('')+'</div>'+
    '<div class="card"><h3>Your pack each morning</h3><p class="note" style="margin-bottom:8px">Food, gas and other consumables burn off day by day; base weight and water stay. Gas: '+fmt(g.have)+' g for '+L.groupSize+' people against about '+fmt(g.need)+' g needed.</p><div class="chart" id="pack"></div></div>';
}
function drawPackChart(){
  var el=$('pack'); if(!el) return;
  var data=packByDay(), W=1000,H=250,m={l:44,r:10,t:22,b:26};
  var max=Math.ceil(Math.max.apply(null,data.map(function(d){return d.total;}))/2000)*2000||2000;
  var bw=(W-m.l-m.r)/data.length;
  function y(v){return m.t+(H-m.t-m.b)*(1-v/max);}
  var keys=['base','food','water','fuel'];
  var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Pack weight each morning">';
  for(var v=0;v<=max;v+=2000){ s+='<line x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--line)"/><text x="'+(m.l-6)+'" y="'+(y(v)+3)+'" text-anchor="end">'+(v/1000)+' kg</text>'; }
  data.forEach(function(d,i){
    var acc=0, x0=m.l+i*bw+bw*0.18, w=bw*0.64;
    keys.forEach(function(k,ki){ var h=d[k]; if(h<=0) return; var top=y(acc+h), hh=Math.max(0,y(acc)-y(acc+h)-2);
      s+='<rect x="'+x0+'" y="'+top+'" width="'+w+'" height="'+hh+'" fill="'+SER[ki][1]+'"'+(ki===3?' rx="3"':'')+'><title>Day '+d.day+' · '+SER[ki][2]+' '+kg(h)+'</title></rect>'; acc+=h; });
    s+='<text x="'+(x0+w/2)+'" y="'+(y(d.total)-6)+'" text-anchor="middle" style="fill:var(--ink)">'+fmt(d.total/1000,1)+'</text><text x="'+(x0+w/2)+'" y="'+(H-8)+'" text-anchor="middle">D'+d.day+'</text>';
  });
  s+='</svg><div class="legend" style="margin-top:6px">'+SER.map(function(c){return '<span><i style="background:'+c[1]+'"></i>'+c[2]+'</span>';}).join('')+'</div>';
  el.innerHTML=s;
}

/* ----- compare ----- */
function vCompare(){
  var A=L.lo.A,B=L.lo.B,sa=summary(A),sb=summary(B);
  function row(label,a,b,strong){var d=b-a;return '<tr><td>'+(strong?'<b>'+label+'</b>':label)+'</td><td class="r">'+kg(a)+'</td><td class="r">'+kg(b)+'</td><td class="r '+(d>0?'pos':d<0?'neg':'')+'">'+(d?sg(d):'—')+'</td></tr>';}
  var names=[]; catList(A,'p').concat(catList(B,'p')).forEach(function(c){ if(names.indexOf(c.name)<0) names.push(c.name); });
  var rows=names.map(function(c){return row(esc(c),sa.cats[c]||0,sb.cats[c]||0);}).join('');
  var diffs=[], seen={};
  function has(lo,it){return !it.custom||(lo.custom||[]).some(function(x){return x.id===it.id;});}
  items(A).concat(items(B)).forEach(function(it){
    if(seen[it.id]) return; seen[it.id]=1;
    var a=has(A,it)?weightOf(it,stOf(A,it.id)):0, b=has(B,it)?weightOf(it,stOf(B,it.id)):0;
    if(a!==b) diffs.push({it:it,a:a,b:b});
  });
  diffs.sort(function(x,y){return Math.abs(y.b-y.a)-Math.abs(x.b-x.a);});
  var bars=[['Base weight',sa.base,sb.base],['Worn weight',sa.worn,sb.worn],['Consumables',sa.cons,sb.cons],['Pack at the start',sa.pack,sb.pack],['Skin-out',sa.skin,sb.skin]];
  var mx=Math.max.apply(null,bars.map(function(b){return Math.max(b[1],b[2]);}).concat([1]));
  return '<div class="head" style="padding-top:12px"><div><h2>Compare A/B</h2><p class="note">Two complete setups side by side, for example your current kit against a lighter option. Switch setup on the gear tabs to edit each one.</p></div>'+
    '<div class="toolbar"><button class="btn" data-act="copy" data-from="A" data-to="B">Copy A → B</button><button class="btn" data-act="copy" data-from="B" data-to="A">Copy B → A</button></div></div>'+
    '<div class="grid2">'+['A','B'].map(function(k){var s=k==='A'?sa:sb;
      return '<div class="card"><label class="field">Name<input data-act="rename" data-k="'+k+'" value="'+esc(L.names[k])+'" maxlength="40"></label>'+
        '<div class="sum-big" style="margin-top:10px">'+kg(s.base)+'</div><div class="note">base weight · '+esc(s.cls)+'</div>'+compBar(s)+
        '<div class="toolbar" style="margin-top:10px"><button class="btn" data-setup="'+k+'" data-go="gear"'+(L.active===k?' disabled':'')+'>'+(L.active===k?'Editing this one':'Edit this setup')+'</button></div></div>';}).join('')+'</div>'+
    '<div class="card"><h3>Side by side</h3><div class="legend" style="margin:6px 0 8px"><span><i style="background:var(--c1)"></i>'+esc(L.names.A)+'</span><span><i style="background:var(--c2)"></i>'+esc(L.names.B)+'</span></div>'+
      bars.map(function(b){var d=b[2]-b[1];return '<div class="ab"><span>'+b[0]+'</span><span class="trs"><i style="width:'+(b[1]/mx*100).toFixed(1)+'%;background:var(--c1)" title="'+esc(L.names.A)+' '+kg(b[1])+'"></i><i style="width:'+(b[2]/mx*100).toFixed(1)+'%;background:var(--c2)" title="'+esc(L.names.B)+' '+kg(b[2])+'"></i></span><span class="vv">'+kg(b[1])+'<br>'+kg(b[2])+'</span></div>';}).join('')+'</div>'+
    '<div class="card scroll"><table class="t"><thead><tr><th>Personal gear by category</th><th class="r">'+esc(L.names.A)+'</th><th class="r">'+esc(L.names.B)+'</th><th class="r">B − A</th></tr></thead><tbody>'+rows+
      row('Share of group gear (base)',sa.shareBase,sb.shareBase)+row('Base weight',sa.base,sb.base,true)+row('Consumables',sa.cons,sb.cons)+row('Pack at the start',sa.pack,sb.pack,true)+
    '</tbody></table></div>'+
    '<div class="card scroll"><h3 style="margin-bottom:6px">What\'s different</h3>'+
    (diffs.length?'<table class="t"><thead><tr><th>Item</th><th class="r">'+esc(L.names.A)+'</th><th class="r">'+esc(L.names.B)+'</th><th class="r">B − A</th></tr></thead><tbody>'+
      diffs.map(function(x){return '<tr><td>'+esc(nameOf(x.it,stOf(L.lo.A,x.it.id)))+'<span class="sub">'+(x.it.scope==='g'?'Group · ':'')+esc(x.it.cat)+'</span></td><td class="r">'+(x.a?fmt(x.a)+' g':'—')+'</td><td class="r">'+(x.b?fmt(x.b)+' g':'—')+'</td><td class="r '+(x.b>x.a?'pos':'neg')+'">'+sg(x.b-x.a)+'</td></tr>';}).join('')+'</tbody></table>'
      :'<div class="empty">The two setups are identical. Use Copy A → B, then change B on the gear tabs.</div>')+'</div>';
}

/* ----- food ----- */
/* Each person builds one or more menus (daily ration plans). The active menu drives the food weight everywhere else
   (Weight tab, pack chart, weight advice). Without a menu, the quick estimate (kcal a day ÷ kcal per 100 g) is used. */
var MEALS=[['bf','Breakfast'],['lu','Lunch'],['sn','Trail snacks'],['di','Dinner'],['dr','Drinks'],['sp','Spare day']];
var MEAL_NAME={}; MEALS.forEach(function(m){ MEAL_NAME[m[0]]=m[1]; });
/* Food groups, and the meals each one is suggested for. */
var FCATS=[['cer','Porridge & cereals',['bf']],['dai','Milk powder & creamers',['bf','dr']],['brd','Breads, wraps & crackers',['lu','bf']],
  ['mea','Dried meat & fish',['lu','sn','di']],['che','Cheese & spreads',['lu','bf']],['nut','Nuts, seeds & nut butters',['sn','bf','lu']],
  ['fru','Dried fruit',['sn','bf']],['cho','Chocolate, sweets & salty snacks',['sn']],['bar','Bars & rusks',['sn','bf']],
  ['mls','Dehydrated & freeze-dried meals',['di','lu']],['qck','Quick-cook carbs & extras',['di']],['fat','Oils & calorie boosters',['di','bf']],
  ['hot','Hot drinks & soups',['dr','di']],['spo','Electrolytes & sports fuel',['dr','sn']]];
var FCAT_NAME={}; FCATS.forEach(function(c){ FCAT_NAME[c[0]]=c[1]; });
/* Typical values per 100 g as sold (dry): kcal, protein, carbohydrate, fat; a usual portion in grams; ml of hot water for that portion.
   Brands differ: check the label on what you buy. SA brands checked against their labels where available (Future Life, Ouma, Provita). */
var FOODLIB=[
  ['cer','Rolled oats (Jungle Oats)',375,13,60,7,80,250],['cer','Instant oats sachets (Oats So Easy)',380,10,65,7,70,200],['cer','Future Life High Protein',337,30,39,5,75,200],
  ['cer','ProNutro',380,16,62,4,70,200],['cer','Instant maize porridge (Morvite)',380,8,75,3,60,200],['cer','Granola / muesli',450,10,62,17,90,0],['cer','Chia seeds',486,17,42,31,15,0],
  ['dai','Full-cream milk powder (Nido)',500,25,38,27,25,0],['dai','Coconut milk powder',690,7,25,63,20,0],['dai','Coffee creamer (Cremora)',540,2,57,33,15,0],
  ['brd','Flour tortilla wraps',310,8,50,8,80,0],['brd','Provita crackers',430,11,68,5,40,0],['brd','Crackers (Salticrax type)',470,9,65,19,40,0],['brd','Rice cakes',390,8,82,3,30,0],
  ['brd','Pita / naan bread',280,9,50,5,80,0],['brd','Bagels',270,10,52,2,90,0],['brd','Rye crispbread',350,9,66,2,30,0],
  ['mea','Beef biltong',310,55,3,9,75,0],['mea','Droëwors',480,40,2,35,50,0],['mea','Salami / dry sausage',450,25,2,38,50,0],['mea','Pepperoni sticks',500,22,2,44,40,0],
  ['mea','Tuna in olive oil (pouch)',190,25,0,10,80,0],['mea','Tuna in brine (pouch)',110,25,0,1,80,0],['mea','Home-dried mince',450,60,0,22,40,100],['mea','Soya mince (TVP)',330,50,30,1,40,120],
  ['che','Mature cheddar',415,25,1,34,40,0],['che','Parmesan',400,33,0,28,30,0],['che','Cheese wedges',240,10,6,19,32,0],['che','Dehydrated hummus',420,18,50,15,20,50],
  ['che','Peanut butter',600,25,15,50,40,0],['che','Nut butter sachet',610,22,15,52,32,0],['che','Chocolate spread (Nutella type)',540,6,57,31,30,0],['che','Honey',304,0,82,0,20,0],
  ['nut','Roasted salted mixed nuts',620,20,15,54,65,0],['nut','Macadamia nuts',740,8,14,76,40,0],['nut','Cashew nuts',580,18,30,46,50,0],['nut','Almonds',600,21,9,52,40,0],
  ['nut','Walnuts',690,15,7,65,30,0],['nut','Pumpkin seeds',580,30,10,49,30,0],['nut','Peanuts & raisins',470,15,40,28,60,0],['nut','Trail mix',480,13,45,30,60,0],['nut','Nuts & chia mix',600,18,15,52,25,0],
  ['fru','Dried mango',320,2,78,1,30,0],['fru','Dried apricots',240,3,63,1,30,0],['fru','Raisins',300,3,79,1,30,0],['fru','Dates',280,2,75,0,40,0],['fru','Banana chips',520,2,58,34,30,0],
  ['fru','Freeze-dried berries',350,5,80,2,10,0],['fru','Honey & freeze-dried berries',320,1,82,1,20,0],['fru','Fruit roll / leather',330,1,80,1,30,0],['fru','Coconut chips',650,7,24,62,30,0],
  ['cho','Dark chocolate 85%',580,12,19,46,30,0],['cho','Dark chocolate 70%',580,8,36,43,40,0],['cho','Milk chocolate',540,7,57,31,40,0],['cho','Chocolate bar (Bar-One / Snickers type)',480,6,62,23,55,0],
  ['cho','Peanut chocolate sweets',520,9,60,26,45,0],['cho','Jelly sweets',340,4,80,0,40,0],['cho','Biscuits (Romany Creams type)',500,6,63,25,40,0],['cho','Potato chips',540,6,52,34,40,0],
  ['bar','Flapjack / energy bar',440,12,55,19,40,0],['bar','Protein bar',380,30,35,13,50,0],['bar','Muesli bar',420,7,62,15,30,0],['bar','Rusks, buttermilk (Ouma)',445,9,68,14,60,0],['bar','Rusks, muesli / bran',420,10,62,15,60,0],
  ['mls','Mama Alles dehydrated meal',430,15,60,14,130,270],['mls','Freeze-dried meal (Trek\'n Eat type)',420,18,55,13,125,400],['mls','High-energy freeze-dried meal',520,15,55,26,140,300],['mls','Pasta & sauce sachet',380,11,70,6,110,350],
  ['qck','Instant noodles (2-minute)',450,9,60,19,85,350],['qck','Couscous',360,13,72,2,100,120],['qck','Instant mash (Smash)',350,8,78,1,80,350],['qck','Instant rice',360,7,80,1,100,150],
  ['qck','Quick-cook pasta',355,12,72,2,100,300],['qck','Instant polenta',360,8,78,2,80,300],['qck','Dehydrated vegetables',300,10,60,1,15,80],['qck','Sauce / gravy powder',380,8,60,11,20,0],
  ['fat','Olive oil',884,0,0,100,20,0],['fat','Ghee',880,0,0,99,20,0],['fat','Coconut oil',860,0,0,100,20,0],['fat','Butter (first days)',720,1,1,81,20,0],
  ['hot','Ground coffee / drip bags',20,0,0,0,15,200],['hot','Instant coffee',100,8,10,0,6,200],['hot','Cappuccino / 3-in-1 sachet',440,5,70,15,20,150],['hot','Tea / rooibos',0,0,0,0,4,250],
  ['hot','Hot chocolate mix',400,6,75,8,25,250],['hot','Milo',410,9,70,9,25,250],['hot','Instant soup (Cup-a-Soup)',380,6,65,9,20,250],
  ['spo','Electrolyte drink powder',260,0,65,0,15,0],['spo','Energy drink powder (Energade / Game)',380,0,95,0,40,0],['spo','Energy gel',270,0,68,0,40,0],['spo','Energy chews',330,0,80,0,50,0],
  ['spo','Glucose sweets',380,0,95,0,30,0],['spo','Recovery shake powder',380,25,55,6,40,0]
];
function libObj(l,i){ return {src:'lib',key:'l'+i,cat:l[0],name:l[1],k:l[2],p:l[3],c:l[4],f:l[5],g:l[6],w:l[6]?Math.round(l[7]/l[6]*100):0}; }
var FLIB=FOODLIB.map(libObj);
/* Starting point: the 10-day menu from Leon's master gear list (Food List & Shopping Plan tab).
   Breakfast had no calories in the sheet; typical values are filled in. [meal, library name, display name, grams a day] */
var FOOD_STARTER=[
  ['bf','Rolled oats (Jungle Oats)',null,80],['bf','Full-cream milk powder (Nido)',null,25],['bf','Nuts & chia mix',null,25],['bf','Honey & freeze-dried berries',null,20],
  ['lu','Beef biltong',null,75],['lu','Droëwors',null,50],['lu','Flour tortilla wraps','Flour tortilla wraps (2)',80],['lu','Mature cheddar','Mature cheddar / parmesan',40],['lu','Dehydrated hummus','Dehydrated hummus (Mama Alles)',20],
  ['sn','Roasted salted mixed nuts',null,65],['sn','Dark chocolate 85%',null,30],['sn','Dried mango','Dried mango & apricots',25],['sn','Flapjack / energy bar','Flapjack / energy bar (1)',40],
  ['di','Mama Alles dehydrated meal','Mama Alles dinner (peanut, dhal, jolof, tagine)',160],['di','Olive oil','Olive oil (into dinner)',20],
  ['dr','Ground coffee / drip bags',null,15],['dr','Electrolyte drink powder',null,15],['dr','Hot chocolate mix',null,25]
];
function libByName(n){ n=String(n||'').trim().toLowerCase(); for(var i=0;i<FLIB.length;i++) if(FLIB[i].name.toLowerCase()===n) return FLIB[i]; return null; }
function fid(){ return 'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function fMenus(){ var f=L.food; if(!f.menus) f.menus=[]; return f.menus; }
function fMenu(){ var ms=fMenus(); if(!ms.length) return null; return ms.filter(function(m){return m.id===L.food.active;})[0]||ms[0]; }
function fMine(){ var f=L.food; if(!f.mine) f.mine=[]; return f.mine; }
function fDays(it){ var d=num(it.days); return d==null?N:Math.max(0,Math.min(d,N)); }
function menuCalc(m){
  if(!m||!m.items||!m.items.length) return null;
  var r={gpd:0,kpd:0,ppd:0,cpd:0,fpd:0,kMac:0,wml:0,meals:{},noK:[],noG:[],hasP:false,spG:0,spK:0};
  MEALS.forEach(function(x){ r.meals[x[0]]={g:0,k:0}; });
  m.items.forEach(function(it){
    var share=N?fDays(it)/N:1, g0=num(it.g)||0, g=g0*share, k=num(it.k), p=num(it.p), c=num(it.c), f=num(it.f), w=num(it.w);
    if(it.meal==='sp'){ r.spG+=g0; r.spK+=g0*(k||0)/100; return; }
    if(!g0) r.noG.push(it.name||'Unnamed');
    if(k==null&&g0) r.noK.push(it.name||'Unnamed');
    var kc=g*(k||0)/100;
    r.gpd+=g; r.kpd+=kc; if(p!=null){ r.ppd+=g*p/100; if(p>0) r.hasP=true; }
    if(c!=null&&f!=null&&p!=null&&k){ r.cpd+=g*c/100; r.fpd+=g*f/100; r.kMac+=kc; }
    if(w) r.wml+=g*w/100;
    var ml=r.meals[it.meal]||(r.meals[it.meal]={g:0,k:0}); ml.g+=g; ml.k+=kc;
  });
  r.dens=r.gpd?r.kpd/r.gpd*100:0;
  return r;
}
function food(){
  var f=L.food, days=N+(+f.spare||0), mc=menuCalc(fMenu());
  if(mc){ var pd=Math.round(mc.gpd), sp=+f.spare||0, spD=mc.spG?Math.round(mc.spG):pd; return {perDay:pd,days:days,total:pd*N+spD*sp,spareDay:spD,ownSpare:!!mc.spG,kcal:Math.round(mc.kpd),dens:mc.dens,menu:mc}; }
  var perDay=Math.round(f.kcal/f.dens*100); return {perDay:perDay,days:days,total:perDay*days,spareDay:perDay,ownSpare:false,kcal:+f.kcal,dens:+f.dens,menu:null};
}

var FOOD=(function(){
  var impOpen=false, impMsg='', newOpen=false, armed=null, busy=false, pick=null, pickAll=false, pickQ='', creating=false, shared=[], dbCol=null, dbState='off';
  function itemFrom(o,meal,g,name){ return {id:fid(),meal:meal,name:name||o.name,g:g!=null?g:o.g,k:o.k,p:o.p,c:o.c,f:o.f,w:o.w||0,days:null}; }
  function starterItems(){ return FOOD_STARTER.map(function(x){ var o=libByName(x[1]); return itemFrom(o,x[0],x[3],x[2]||o.name); }); }
  function addMenu(kind){
    var ms=fMenus(), cur0=fMenu(), m={id:fid(),name:'',items:[]};
    if(kind==='starter'){ m.items=starterItems(); m.name='Starter menu'; }
    else if(kind==='copy'&&cur0){ m.items=JSON.parse(JSON.stringify(cur0.items)).map(function(it){ it.id=fid(); return it; }); m.name=(cur0.name||'Menu')+' (copy)'; }
    else m.name='Menu '+(ms.length+1);
    ms.push(m); L.food.active=m.id; newOpen=false; pick=null; persist(); rerender();
  }
  /* import a menu from text: "Meal; Food; grams[; kcal per 100 g]" per line, or rows copied from a tab in the group sheet */
  function mealKey(t){ t=String(t||'').toLowerCase().trim();
    return /^break/.test(t)?'bf':/^(lunch|second)/.test(t)?'lu':/^(trail|snack)/.test(t)?'sn':/^(din|supper|dessert)/.test(t)?'di':/^(drink|hot drink|bever)/.test(t)?'dr':/^(spare|emergency)/.test(t)?'sp':null; }
  function known(name){ var lo=String(name).toLowerCase().trim(), hit=null;
    fMenus().forEach(function(m){ m.items.forEach(function(i){ if(!hit&&String(i.name).toLowerCase().trim()===lo&&num(i.k)!=null) hit=i; }); });
    return hit; }
  function importMenu(txt){
    var lines=String(txt||'').split(/\r?\n/), name='', items=[], skipped=[];
    lines.forEach(function(raw){ var l=raw.replace(/[*_`>]/g,'').replace(/^\s*(?:[-•–]|\d+[.)])\s+/,'').trim(); if(!l) return;
      var mm=l.match(/^(?:dgt menu|menu|name)\s*:\s*(.+)$/i); if(mm){ name=mm[1].trim(); return; }
      var f=l.indexOf('\t')>=0?l.split('\t'):l.split(/\s*[;|]\s*/), meal, nm, g, k=null;
      if(f.length>=8&&/^food$/i.test(f[0])){ if(/^(meal|whole menu)$/i.test(f[1])) return; meal=mealKey(f[1]); nm=f[3]; g=num(f[7]); var kd=num(f[5]); if(kd!=null&&g) k=Math.round(kd/g*1000)/10; if(!name&&f[4]) name=f[4]; }
      else { meal=mealKey(f[0]); nm=f[1]; g=num(f[2]); if(f[3]!=null&&f[3]!=='') k=num(f[3]); var mp=num(f[4]), mcb=num(f[5]), mf=num(f[6]); }
      if(!meal||!nm||g==null){ if(/[;|\t]/.test(l)&&!/^meal\b/i.test(l)) skipped.push(l.slice(0,40)); return; }
      var src=known(nm)||findLib(nm), it={id:fid(),meal:meal,name:nm.trim(),g:g,k:k!=null?k:(src?num(src.k):null),p:src?src.p:null,c:src?src.c:null,f:src?src.f:null,w:src&&src.w!=null?src.w:0,days:null};
      if(k!=null&&src&&num(src.k)!=null&&Math.abs(k-src.k)>src.k*0.15){ it.c=null; it.f=null; it.p=null; }
      if(mp!=null) it.p=mp; if(mcb!=null) it.c=mcb; if(mf!=null) it.f=mf; mp=mcb=mf=null;
      items.push(it); });
    if(!items.length){ impMsg='Nothing to import. Use one line per food: Meal; Food; grams a day.'; rerender(); return; }
    var ms=fMenus(), m={id:fid(),name:(name||'Imported menu')+(ms.some(function(x){return x.name===name;})?' (2)':''),items:items};
    ms.push(m); L.food.active=m.id; impOpen=false; newOpen=false; pick=null;
    var spSet=items.some(function(i){return i.meal==='sp';})&&!(+L.food.spare>0); if(spSet) L.food.spare=BUFFER;
    var noK=items.filter(function(i){return num(i.k)==null;}).length;
    impMsg='Imported “'+m.name+'” with '+items.length+' foods.'+(noK?' '+noK+' need kcal per 100 g: they\'re marked below.':'')+(skipped.length?' Skipped '+skipped.length+' line'+(skipped.length>1?'s':'')+' that didn\'t read as Meal; Food; grams.':'')+(spSet?' Spare days of food was 0, so it\'s now '+BUFFER+' for the buffer days.':'');
    persist(); rerender(); }
  /* hand the menu over to the person's own Claude, with their numbers filled in; they paste the result back with Import */
  function kcalSet(){ var f=L.food; return !!f.kcalSet||+f.kcal!==4500; }
  function suggestKcal(){ var b=burnEst(); return b?Math.max(2800,Math.min(4800,Math.round(b.perDay*0.8/100)*100)):null; }
  function claudeMissing(){ var m=[]; if(!num(L.food.bw)) m.push('bw'); if(!kcalSet()) m.push('kcal'); return m; }
  function claudeGate(){ var miss=claudeMissing(), sg=suggestKcal();
    return '<div class="fd-cgate" id="fd-cgate"><h4>Before Claude plans your menu</h4><p class="note">Claude plans around these two numbers, so it\'s worth setting them first.</p><div class="fields">'+
      '<label class="field">Body weight, kg<input type="number" step="1" min="35" max="160" data-f="bw" value="'+(num(L.food.bw)||'')+'" placeholder="e.g. 75"></label>'+
      '<label class="field">kcal a day<input type="number" step="100" min="1500" data-f="kcal" value="'+(+L.food.kcal||'')+'"></label></div>'+
      '<p class="note" id="fd-csg">'+(sg?'Suggested: about '+fmt(sg)+' kcal a day (roughly 80% of what you\'ll burn). <button class="linkbtn" data-fact="usesg">Use '+fmt(sg)+'</button>':'Add your body weight for a suggested target.')+'</p>'+
      '<div class="toolbar"><a class="btn primary" data-claude-menu data-go="1" href="https://claude.ai/new" target="_blank" rel="noopener">Continue to Claude</a><a class="btn ghost" data-claude-menu data-go="1" data-ask="1" href="https://claude.ai/new" target="_blank" rel="noopener">Skip, Claude can ask me</a><button class="btn ghost" data-fact="cgclose">Cancel</button></div></div>'; }
  function claudePrompt(ask,lvl){ lvl=lvl||0;
    var f=L.food, m=fMenu(), km=PLAN.stages.reduce(function(a,x){return a+x.dist;},0)/N, up=PLAN.stages.reduce(function(a,x){return a+x.up;},0)/N, bw=num(f.bw);
    return 'Help me plan my food for the Drakensberg Grand Traverse: '+N+' days unsupported along the escarpment (mostly 2,900 to 3,400 m), about '+fmt(km)+' km and '+fmt(up)+' m of climbing a day, in March. '+
      'I cook on a gas stove, boiling water only. We fill up water near camp, so only the dry food weight matters.\n\n'+
      (kcalSet()?'My target: about '+fmt(+f.kcal)+' kcal a day':'I haven\'t worked out my calorie target yet')+(bw?', body weight '+bw+' kg, so roughly '+fmt(bw*1.4)+' to '+fmt(bw*1.8)+' g of protein a day':'')+'.'+
      (!bw||!kcalSet()?' Before planning, ask me for '+(!bw&&!kcalSet()?'my body weight, and suggest a daily calorie target from it':!bw?'my body weight':'a daily calorie target, suggesting one from my body weight')+'.':'')+' I want it as light as possible: high calories per gram, foods that keep for 10 days.\n\n'+
      (m&&m.items.length&&lvl<2?'Here is my current menu (meal; food; dry grams a day'+(lvl?'':'; then kcal, protein, carbs and fat per 100 g where known')+'). Improve it, and tell me what you changed and why:\n\n'+exportText(!!lvl)+'\n\n':m&&m.items.length?'I\'ll paste my current menu in my next message; improve it then.\n\n':'Before you plan, ask me a few quick questions: foods I like, foods I don\'t eat, and brands I already have.\n\n')+
      'We plan '+N+' trail days plus '+BUFFER+' buffer days in case weather holds us up. Include one lighter spare day (about 500 g, mostly no cooking) that I carry '+BUFFER+' times.\n\n'+
      'Use DRY weights (as the food comes out of the pack, before water) and values per 100 g dry. When we are done, give me the final menu as plain text in exactly this format, one food per line, with nothing else in that block:\n\n'+
      'DGT menu: <menu name>\nMeal; Food; dry grams per day; kcal per 100 g; protein per 100 g; carbs per 100 g; fat per 100 g\n\n'+
      'Meal must be one of: Breakfast, Lunch, Trail snacks, Dinner, Drinks, Spare day.';
  }
  function claudeUrl(ask){ var u; for(var l=0;l<3;l++){ u='https://claude.ai/new?q='+encodeURIComponent(claudePrompt(ask,l)); if(u.length<=7000) return {url:u,prompt:claudePrompt(ask,l),lvl:l}; } return {url:u,prompt:claudePrompt(ask,2),lvl:2}; }
  function openGate(a){ var old=$('fd-cgate'); if(old) old.remove(); var tb=a.closest('.toolbar')||a.parentNode; tb.insertAdjacentHTML('afterend',claudeGate()); var g=$('fd-cgate'); if(g){ g.scrollIntoView({block:'nearest'}); var i=g.querySelector(num(L.food.bw)?'[data-f="kcal"]':'[data-f="bw"]'); if(i) i.focus({preventScroll:true}); } }
  function gateRefresh(){ var e=$('fd-csg'); if(!e) return; var sg=suggestKcal(); e.innerHTML=sg?'Suggested: about '+fmt(sg)+' kcal a day (roughly 80% of what you\'ll burn). <button class="linkbtn" data-fact="usesg">Use '+fmt(sg)+'</button>':'Add your body weight for a suggested target.'; }
  function claudeSent(lvl){ setTimeout(function(){ var g=$('fd-cgate'); if(g) g.remove(); impOpen=true; impMsg='';
      rerender(); var box=document.querySelector('.fd-imp'); if(box){ box.insertAdjacentHTML('afterbegin','<p class="okbox" role="status">Claude opened in a new tab. The prompt is also copied: if Claude opens empty, paste it in.'+(lvl===2?' Your menu was too long to send in the link, so paste it into Claude after the prompt (Copy to share).':'')+' When Claude gives you the final menu, copy it and paste it below.</p>'); box.scrollIntoView({block:'nearest'}); } },400); }
  function claudeBtn(label){ return '<a class="btn" data-claude-menu href="https://claude.ai/new" target="_blank" rel="noopener">'+label+'</a>'; }
  function exportText(compact){ var m=fMenu(); return 'DGT menu: '+(m.name||'Menu')+'\n'+MEALS.map(function(ml){ return m.items.filter(function(i){return i.meal===ml[0]&&num(i.g);}).map(function(i){ return ml[1]+'; '+i.name+'; '+num(i.g)+(num(i.k)!=null&&!compact?'; '+num(i.k)+(num(i.p)!=null||num(i.c)!=null||num(i.f)!=null?'; '+(num(i.p)!=null?num(i.p):'')+'; '+(num(i.c)!=null?num(i.c):'')+'; '+(num(i.f)!=null?num(i.f):''):''):''); }).join('\n'); }).filter(Boolean).join('\n'); }
  function findIt(id){ var m=fMenu(); return m?m.items.filter(function(i){return i.id===id;})[0]:null; }
  /* older menus: fill in carbs, fat and hot water from the food list where the name matches */
  var FALIAS={'salami':'Salami / dry sausage','mama alles dehydrated dinner':'Mama Alles dehydrated meal','rusks (buttermilk)':'Rusks, buttermilk (Ouma)','prONutro':'ProNutro'};
  function findLib(name){ var n=String(name||'').trim(), lo=n.toLowerCase(), base=lo.replace(/\s*\(.*\)$/,''), o=libByName(n)||libByName(base)||(FALIAS[lo]&&libByName(FALIAS[lo]));
    if(!o) FOOD_STARTER.forEach(function(x){ if(x[2]&&x[2]===n) o=libByName(x[1]); });
    if(!o&&base.length>=4) o=FLIB.filter(function(l){ return l.name.toLowerCase().indexOf(base)===0; })[0]||null; return o; }
  function backfill(){ fMenus().forEach(function(m){ m.items.forEach(function(it){ if(it.c!=null) return; var o=findLib(it.name), k=num(it.k);
      if(o&&(k==null||Math.abs(k-o.k)<=o.k*0.15)){ it.c=o.c; it.f=o.f; if(it.w==null) it.w=o.w; if(it.p==null) it.p=o.p; } }); }); }

  function impHTML(){ return '<div class="fd-imp"><label class="field">Paste a menu<textarea id="fd-imp-in" class="code" rows="8" placeholder="DGT menu: My menu&#10;Breakfast; Rolled oats (Jungle Oats); 80&#10;Dinner; Mama Alles dehydrated meal; 160&#10;Spare day; Macadamia nuts; 40" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea></label>'+
    '<p class="note">Got a menu from Claude? Paste the block it gave you. One food per line: meal; food; dry grams a day, and optionally kcal, protein, carbs and fat per 100 g. Meals: Breakfast, Lunch, Trail snacks, Dinner, Drinks, Spare day. Rows copied from someone\'s tab in the group sheet work too. Foods you already use, or that are in the food list, get their values filled in.</p>'+
    '<div class="toolbar"><button class="btn primary" data-fact="impgo">Import as a new menu</button><button class="btn ghost" data-fact="impcancel">Cancel</button></div></div>'; }
  function rowHTML(it){
    return '<div class="fd-row" data-fid="'+it.id+'">'+
      '<input class="fd-name" data-fd="name" value="'+esc(it.name)+'" aria-label="Food">'+
      '<label class="fd-in"><span>dry g a day</span><input data-fd="g" inputmode="decimal" value="'+(it.g==null?'':esc(it.g))+'"'+(it.g==null?' class="need"':'')+'></label>'+
      '<label class="fd-in"><span>kcal/100 g</span><input data-fd="k" inputmode="decimal" value="'+(it.k==null?'':esc(it.k))+'"'+(it.k==null?' class="need"':'')+'></label>'+
      '<label class="fd-in"><span>protein/100 g</span><input data-fd="p" inputmode="decimal" value="'+(it.p==null?'':esc(it.p))+'"></label>'+
      '<label class="fd-in"><span>days</span><input data-fd="days" inputmode="numeric" placeholder="all" value="'+(it.days==null?'':esc(it.days))+'"></label>'+
      '<output class="fd-kc mono" id="fk-'+it.id+'"></output>'+
      '<button class="fd-x" data-fact="del" aria-label="Remove '+esc(it.name)+'">×</button></div>';
  }
  /* ---- the food picker: grouped by food type, suggestions for this meal first ---- */
  function catsFor(meal){ if(meal==='sp') return FCATS.map(function(c){return c[0];}); return FCATS.filter(function(c){ return c[2].indexOf(meal)>=0; }).map(function(c){return c[0];}); }
  function pickItems(meal){
    var q=pickQ.trim().toLowerCase(), rel=catsFor(meal), groups=[];
    var byName=q&&FLIB.concat(fMine(),shared).some(function(o){ return o.name.toLowerCase().indexOf(q)>=0; });
    function match(o){ return !q||o.name.toLowerCase().indexOf(q)>=0||(!byName&&(FCAT_NAME[o.cat]||'').toLowerCase().indexOf(q)>=0); }
    function useCat(c){ return q||pickAll||rel.indexOf(c)>=0; }
    var mine=fMine().filter(function(o){ return match(o)&&useCat(o.cat); }).map(function(o){ return Object.assign({src:'mine',key:'m'+o.id},o); });
    if(mine.length) groups.push(['Your foods',mine]);
    var grp=shared.filter(function(o){ return match(o)&&useCat(o.cat); });
    if(grp.length) groups.push(['Shared by the group',grp]);
    var order=pickAll||q?FCATS.map(function(c){return c[0];}):rel;
    order.forEach(function(c){ var it=FLIB.filter(function(o){ return o.cat===c&&match(o); }); if(it.length) groups.push([FCAT_NAME[c],it]); });
    return groups;
  }
  function pickListHTML(meal){
    var gs=pickItems(meal);
    if(!gs.length) return '<p class="note">Nothing matches “'+esc(pickQ)+'”. Create it as your own food below.</p>';
    return gs.map(function(g){ return '<div class="fp-g"><h5>'+esc(g[0])+'</h5><div class="fp-items">'+g[1].map(function(o){
      var own=o.src==='mine', b='<button class="fp-it" data-fpick="'+esc(o.key)+'"><b>'+esc(o.name)+'</b><span class="mono">'+fmt(o.k)+' kcal/100 g, '+fmt(o.g)+' g</span></button>';
      return own?'<div class="fp-itw">'+b+'<button class="fp-del" data-fact="mdel" data-id="'+esc(o.id)+'" aria-label="Remove '+esc(o.name)+' from your foods">×</button></div>':b; }).join('')+'</div></div>'; }).join('');
  }
  function catOptions(sel){ return FCATS.map(function(c){ return '<option value="'+c[0]+'"'+(c[0]===sel?' selected':'')+'>'+esc(c[1])+'</option>'; }).join(''); }
  function pickerHTML(meal){
    var nm=MEAL_NAME[meal].toLowerCase();
    return '<div class="fd-pick" data-pick="'+meal+'">'+
      '<div class="fp-top"><input class="fp-q" data-fq="1" placeholder="Search all foods, e.g. peanut butter" value="'+esc(pickQ)+'" aria-label="Search foods">'+
      '<div class="seg fp-seg" role="group" aria-label="Which foods"><button data-fact="pickrel" aria-pressed="'+(!pickAll)+'">For '+esc(nm)+'</button><button data-fact="pickall" aria-pressed="'+pickAll+'">All foods</button></div>'+
      '<button class="btn ghost" data-fact="pickclose">Done</button></div>'+
      '<p class="fp-msg" role="status" id="fp-msg"></p>'+
      '<div class="fp-list" id="fp-list">'+pickListHTML(meal)+'</div>'+
      (creating?newFoodHTML(meal):'<button class="btn" data-fact="newfood">+ Create your own food</button>')+
      '</div>';
  }
  /* your own food: copy the label either per 100 g or per pack; always the dry food as it comes out of the pack */
  function newFoodHTML(meal){
    var def=catsFor(meal)[0];
    return '<div class="fp-new" data-mode="pack"><h5>Your own food</h5>'+
      '<p class="note">Use the food as it comes out of the pack: the dry weight, before you add water.</p>'+
      '<div class="seg fp-mode" role="group" aria-label="The label gives values"><button data-fact="nfmode" data-m="pack" aria-pressed="true">Per pack or serving</button><button data-fact="nfmode" data-m="100" aria-pressed="false">Per 100 g</button></div>'+
      '<div class="fp-grid">'+
      '<label class="field fp-wide">Name<input data-nf="name" value="'+esc(pickQ)+'"></label>'+
      '<label class="field fp-wide">Type of food<select data-nf="cat">'+catOptions(def)+'</select></label>'+
      '<label class="field m-pack">Pack weight, dry (g)<input data-nf="pw" inputmode="decimal" placeholder="net weight on the pack"></label>'+
      '<label class="field m-pack">kcal per pack<input data-nf="kp" inputmode="decimal"></label>'+
      '<label class="field m-pack">Protein g per pack<input data-nf="pp" inputmode="decimal"></label>'+
      '<label class="field m-pack">Carbs g per pack<input data-nf="cp" inputmode="decimal"></label>'+
      '<label class="field m-pack">Fat g per pack<input data-nf="fp" inputmode="decimal"></label>'+
      '<label class="field m-100">kcal per 100 g<input data-nf="k" inputmode="decimal" placeholder="e.g. 450"></label>'+
      '<label class="field m-100">Protein g/100 g<input data-nf="p" inputmode="decimal"></label>'+
      '<label class="field m-100">Carbs g/100 g<input data-nf="c" inputmode="decimal"></label>'+
      '<label class="field m-100">Fat g/100 g<input data-nf="f" inputmode="decimal"></label>'+
      '<label class="field">Grams a day<input data-nf="g" inputmode="decimal" placeholder="one pack"></label>'+
      '</div><p class="note">If the label only gives values "as prepared", use the per-pack numbers: the energy in a pack doesn\'t change when you add water. kJ on the label? Divide by 4.18 for kcal.</p>'+
      (dbState==='ok'?'<label class="adv-chk"><input type="checkbox" data-nf="share" checked> Share this food with the group, so others can pick it too</label>':'')+
      '<div class="toolbar"><button class="btn primary" data-fact="nfsave">Save and add</button><button class="btn ghost" data-fact="nfcancel">Cancel</button></div></div>';
  }
  function redrawPick(){ var el=document.querySelector('.fd-pick'); if(!el) return; var l=$('fp-list'); if(l) l.innerHTML=pickListHTML(pick); }
  function openPick(meal){ pick=meal; pickQ=''; pickAll=false; creating=false; rerender(); var q=document.querySelector('.fd-pick .fp-q'); if(q){ q.focus({preventScroll:true}); var box=q.closest('.fd-pick'); if(box) box.scrollIntoView({block:'nearest'}); } }
  function srcObj(key){
    if(key[0]==='l') return FLIB[+key.slice(1)];
    if(key[0]==='m'){ var id=key.slice(1); return fMine().filter(function(o){return o.id===id;})[0]; }
    return shared.filter(function(o){return o.key===key;})[0];
  }
  function addFromPick(o){ var m=fMenu(); if(!m||!o) return; var it=itemFrom(o,pick); m.items.push(it); if(pick==='sp'&&!(+L.food.spare>0)){ L.food.spare=BUFFER; var sf=document.querySelector('[data-f="spare"]'); if(sf) sf.value=1; } persist();
    var sec=document.querySelector('[data-meal="'+pick+'"] .fd-rows'); if(sec){ sec.insertAdjacentHTML('beforeend',rowHTML(it)); }
    var msg=$('fp-msg'); if(msg){ msg.textContent='Added '+it.name+' ('+fmt(it.g)+' g a day). Pick more, or Done.'; }
    refresh(); }
  function saveNew(){
    var box=document.querySelector('.fp-new'); if(!box) return; function v(k){ var e=box.querySelector('[data-nf="'+k+'"]'); return e?e.value:''; }
    function focus(k,msg){ var e=box.querySelector('[data-nf="'+k+'"]'); if(e) e.focus(); $('fp-msg').textContent=msg; }
    var name=v('name').trim(), mode=box.dataset.mode, g=num(v('g')), k,p,c,f,gg;
    if(!name){ focus('name','Give the food a name.'); return; }
    if(mode==='pack'){ var pw=num(v('pw')), kp=num(v('kp'));
      if(!pw){ focus('pw','Add the dry weight of the pack (the net weight printed on it).'); return; }
      if(kp==null){ focus('kp','Add the kcal for the whole pack.'); return; }
      var per=function(x){ x=num(x); return x==null?null:Math.round(x/pw*1000)/10; };
      k=Math.round(kp/pw*1000)/10; p=per(v('pp')); c=per(v('cp')); f=per(v('fp')); gg=g||pw; }
    else { k=num(v('k')); p=num(v('p')); c=num(v('c')); f=num(v('f')); gg=g||50;
      if(k==null){ focus('k','Add the kcal per 100 g from the label.'); return; } }
    if((k<150||k>900)&&box.dataset.ok!==String(k)){ box.dataset.ok=String(k);
      $('fp-msg').textContent=k<150?'That works out at '+fmt(k)+' kcal per 100 g, which is what food weighs once water is in it. Dry trail food is usually 350 to 600. Check you used the dry weight, or press Save again if it really is that low (fresh fruit, say).':'That works out at '+fmt(k)+' kcal per 100 g, more than pure oil. Check the numbers, or press Save again.'; return; }
    var o={id:fid(),cat:v('cat'),name:name.slice(0,80),k:k,p:p,c:c,f:f,g:gg,w:0};
    fMine().push(o); var sh=box.querySelector('[data-nf="share"]');
    if(sh&&sh.checked&&dbCol){ var doc={cat:o.cat,name:o.name,k:o.k,p:o.p,c:o.c,f:o.f,g:o.g,w:o.w,at:new Date().toISOString()};
      Object.keys(doc).forEach(function(x){ if(doc[x]==null) delete doc[x]; }); dbCol.doc(o.id).set(doc).catch(function(){}); }
    creating=false; addFromPick(Object.assign({src:'mine'},o)); pickQ=''; var el=document.querySelector('.fd-pick'); if(el) el.outerHTML=pickerHTML(pick);
    var msg=$('fp-msg'); if(msg) msg.textContent='Saved '+o.name+' ('+fmt(o.k)+' kcal per 100 g) and added it.'; }
  /* remove one of your own foods (and its shared copy). Menus that already use it keep their row */
  function delMine(id){ var ms=fMine(), i=ms.findIndex(function(o){return o.id===id;}); if(i<0) return; var nm=ms[i].name; ms.splice(i,1);
    if(dbCol) try{ dbCol.doc(id).delete().catch(function(){}); }catch(e){}
    persist(); redrawPick(); var msg=$('fp-msg'); if(msg) msg.textContent='Removed '+nm+' from your foods. Any menu row using it stays; fix or remove it there.'; }

  function view(){
    var f=L.food, m=fMenu(), ms=fMenus(), g=gasPlan();
    var target='<div class="card"><h3 style="margin-bottom:8px">Your target</h3><div class="fields">'+
      '<label class="field">kcal a day<input type="number" step="100" min="1500" data-f="kcal" value="'+f.kcal+'"></label>'+
      '<label class="field">Body weight, kg<input type="number" step="1" min="35" max="160" data-f="bw" placeholder="optional" value="'+(f.bw||'')+'"></label>'+
      '<label class="field">Buffer days of food<input type="number" step="0.5" min="0" max="4" data-f="spare" value="'+f.spare+'"></label>'+
      (m?'':'<label class="field">kcal per 100 g<input type="number" step="10" min="200" max="700" data-f="dens" value="'+f.dens+'"></label>')+
      '</div><div class="fd-bw" id="f-bw"></div>'+
      (m?'':'<div style="margin-top:10px"><div class="sum-row"><span>Food per day</span><b id="f-day"></b></div>'+
        '<div class="sum-row"><span>Days of food ('+N+' + buffer)</span><b id="f-days"></b></div>'+
        '<div class="sum-row"><span>Total food to carry</span><b id="f-total"></b></div>'+
        '<div class="sum-row" style="border:0"><span>Total energy</span><b id="f-kcal"></b></div>'+
        '<p class="note">A quick estimate. Build a menu below to check it food by food.</p></div>')+'</div>';
    var wcard='<div class="card fd-water"><h3 style="margin-bottom:6px">Water</h3>'+
      '<div class="fields"><label class="field">Water you carry, litres<input type="number" step="0.5" min="0" max="4" data-f="water" value="'+f.water+'"></label>'+
      '<label class="field">Water you boil a day, litres<input type="number" step="0.25" min="0" max="4" data-f="boil" value="'+boilL()+'"></label></div>'+
      '<p class="note">Water you carry counts in your pack weight. Water for cooking and hot drinks you fill up near camp, so it isn\'t carried; it only sets how much gas the group needs. Food weights are always dry.</p></div>';
    var gas='<div class="card"><h3 style="margin-bottom:8px">Group gas</h3>'+
      '<div class="sum-row"><span>Canisters on the Group gear list</span><b>'+g.n+' × '+fmt(g.netEach)+' g gas</b></div>'+
      '<div class="sum-row"><span>Water to boil each</span><b>'+fmt(boilL(),1)+' L a day × '+g.days+' stove days</b></div>'+
      '<div class="sum-row"><span>Stove days</span><b>'+(N-1)+' nights + '+BUFFER+' buffer days</b></div>'+
      '<div class="sum-row"><span>Burn rate, measured</span><b>'+P.group_g_per_litre_measured+' g per litre</b></div>'+
      '<div class="sum-row" style="border:0"><span>Group need for '+L.groupSize+' people</span><b>'+fmt(g.need)+' g of '+fmt(g.have)+' g</b></div>'+
      '<div class="'+(g.margin>=0?'okbox':'warnbox')+'">'+(g.margin>=0?'About '+fmt(g.margin)+' g spare across the group'+(g.have?', roughly '+fmt(g.margin/g.have*100)+'%.':'.')+(g.n>g.cansNeed?' '+g.cansNeed+' canister'+(g.cansNeed>1?'s':'')+' would cover it, including the buffer days; each extra one is about 365 g full.':''):'Short by about '+fmt(-g.margin)+' g. You need '+g.cansNeed+' canisters; add one on the Group gear tab.')+'</div>'+
      '<p class="note">'+esc(P.burners||'')+'. The day-by-day pack chart is on the <a href="#weight">Weight</a> tab.</p></div>';
    var head='<div class="head" style="padding-top:12px"><div><h2>Food &amp; fuel</h2><p class="note">Build your own menu and check it has enough energy for '+N+' days on the escarpment. Pick foods from the list (about '+Math.round(FLIB.length/10)*10+' trail foods with typical values) or add your own from the label. Your menu is yours: it\'s saved with your gear, not shared.</p></div></div>';
    var body;
    if(!m){
      body='<div class="card fd-start"><div class="eyebrow">Food calculator</div><h3>Start your menu</h3>'+
        '<p>List what you\'ll eat each day, with grams. The planner adds up calories, protein, carbs and fat, checks them against your target, and uses the weight on the Weight tab.</p>'+
        '<div class="toolbar"><button class="btn primary" data-fact="new" data-kind="starter">Start from the starter menu</button><button class="btn" data-fact="new" data-kind="empty">Start empty</button>'+claudeBtn('Plan my menu with Claude')+'<button class="btn ghost" data-fact="impopen">Import a menu</button></div>'+
        '<p class="note">Plan my menu with Claude opens Claude in a new tab with your target filled in. When it gives you the final menu, copy it and come back to Import a menu.</p>'+(impOpen?impHTML():'')+(impMsg?'<p class="warnbox">'+esc(impMsg)+'</p>':'')+
        '<p class="note">The starter menu is the 10-day plan from Leon\'s master list: about 810 g and 3,450 kcal a day. Change anything in it.</p></div>';
    } else {
      var tabs='<div class="fd-tabs">'+ms.map(function(x){ return '<button class="fd-tab" data-fact="menu" data-mid="'+x.id+'" aria-pressed="'+(x.id===m.id)+'"><span id="fmn-'+x.id+'">'+esc(x.name||'Menu')+'</span></button>'; }).join('')+
        '<button class="fd-tab add" data-fact="newopen" aria-expanded="'+newOpen+'">+ New menu</button></div>'+
        (newOpen?'<div class="fd-newbar"><span class="note">New menu from:</span><button class="btn" data-fact="new" data-kind="copy">A copy of this one</button><button class="btn" data-fact="new" data-kind="starter">The starter menu</button><button class="btn ghost" data-fact="new" data-kind="empty">Empty</button><button class="btn ghost" data-fact="impopen">Import…</button>'+claudeBtn('Plan with Claude')+'</div>':'')+
        (impOpen?impHTML():'')+(impMsg?'<p class="'+(/^Imported/.test(impMsg)?'okbox':'warnbox')+'" role="status">'+esc(impMsg)+'</p>':'');
      var meals=MEALS.map(function(ml){
        var its=m.items.filter(function(i){return i.meal===ml[0];});
        return '<section class="fd-meal'+(ml[0]==='sp'?' fd-spare':'')+'" data-meal="'+ml[0]+'"><div class="fd-mh"><h4>'+ml[1]+'</h4><span class="mono" id="fms-'+ml[0]+'"></span></div>'+
          (ml[0]==='sp'?'<p class="note">What you carry for each buffer day (the group plans '+BUFFER+'; set yours above). Leave it empty to carry a copy of an average day; a compact, dense spare day is lighter. It doesn\'t count in the daily averages.</p>':'')+
          '<div class="fd-rows">'+its.map(rowHTML).join('')+'</div>'+
          (pick===ml[0]?pickerHTML(ml[0]):'<button class="fd-addbtn" data-fact="pick" data-meal-add="'+ml[0]+'">+ Add to '+ml[1].toLowerCase()+'</button>')+'</section>';
      }).join('');
      body='<div class="card fd-menu">'+tabs+
        '<div class="fd-mbar"><label class="field fd-mname">Menu name<input data-fd="mname" value="'+esc(m.name||'')+'"></label>'+
        '<div class="toolbar"><button class="btn ghost" data-fact="rm">Delete menu</button></div></div>'+
        '<div class="fd-sum" id="fd-sum"></div><div id="fd-checks"></div>'+
        '<div class="fd-split" id="fd-split"></div>'+meals+
        '<p class="note">Values in the food list are typical for that kind of food: check the label on what you buy. “Days” is for foods you only carry on some days (one flavour of dinner, say); leave it empty for every day.</p>'+
        '<div class="toolbar" style="margin-top:12px"><button class="btn" data-fact="shop">Copy shopping list</button><button class="btn ghost" data-fact="tsv">Copy for Google Sheets</button><button class="btn ghost" data-fact="exp">Copy to share</button>'+claudeBtn('Improve this menu with Claude')+'<span class="note" id="fd-msg" role="status"></span></div>'+
        '<textarea id="fd-out" class="code" rows="6" hidden readonly></textarea>'+
        '<div class="adv-ai" data-fdai><button class="btn" data-fact="ai">Ask Claude to check my menu</button><span class="note">Checks energy, balance and practical issues (cooking, cold, fuel) for this trip. Sends your menu only.</span><div class="adv-out" hidden></div></div></div>';
    }
    return head+'<div class="fd-top">'+target+'</div>'+body+'<div class="fd-gas">'+wcard+gas+'</div>';
  }
  function checks(fd,mc){
    var f=L.food, t=+f.kcal||0, out=[], gap=t-fd.kcal, bw=num(f.bw);
    if(mc.noK.length) out.push(['warn','No calories yet for '+mc.noK.join(', ')+'. The totals are low until you add kcal per 100 g from the pack.']);
    if(mc.noG.length) out.push(['warn','No grams yet for '+mc.noG.join(', ')+'.']);
    var wet=fMenu().items.filter(function(i){ var k=num(i.k); return k!=null&&k>0&&k<150&&num(i.g)&&!/fruit|apple|banana|orange/i.test(i.name); });
    if(wet.length) out.push(['warn',wet.map(function(i){return i.name+' ('+fmt(num(i.k))+' kcal per 100 g)';}).join(', ')+(wet.length>1?' look':' looks')+' like the weight with water added. Dry trail food is usually 350 to 600 kcal per 100 g: put in the dry weight and the kcal for that weight (the per-pack numbers on the label), so your pack weight and calories are right.']);
    var dup={}; fMenu().items.forEach(function(i){ var b=String(i.name).toLowerCase().replace(/\(.*?\)/g,'').replace(/\s+/g,' ').trim(); dup[b]=(dup[b]||0)+1; });
    var dd=Object.keys(dup).filter(function(b){return dup[b]>1;}); if(dd.length) out.push(['warn','The menu has '+dd.join(', ')+' more than once. If that\'s by accident, remove the extra row: each row adds its grams to your pack.']);
    if(gap>50) out.push(['warn','Short by about '+fmt(gap)+' kcal a day against your '+fmt(t)+' kcal target. Closing it takes about '+fmt(gap/8.84)+' g of olive oil, '+fmt(gap/6.2)+' g of salted nuts or '+fmt(gap/5.8)+' g of dark chocolate a day (or a mix).']);
    else if(t&&fd.kcal>t*1.15) out.push(['ok','About '+fmt(fd.kcal-t)+' kcal a day over your target. Fine if you tend to be hungry on the hill; otherwise that\'s about '+fmt((fd.kcal-t)/fd.dens*100*fd.days)+' g you could leave out.']);
    else if(t) out.push(['ok','On target: '+fmt(fd.kcal)+' kcal a day against '+fmt(t)+'.']);
    if(fd.dens&&fd.dens<400){
      var low=fMenu().items.filter(function(i){ return i.meal!=='dr'&&num(i.k)!=null&&num(i.g)>=20&&num(i.k)<400; }).sort(function(a,b){ return (num(b.g)*(400-num(b.k)))-(num(a.g)*(400-num(a.k))); }).slice(0,3);
      out.push(['warn','At '+fmt(fd.dens)+' kcal per 100 g the food is on the heavy side. '+(low.length?'The least energy per gram: '+low.map(function(i){return i.name+' ('+fmt(num(i.k))+')';}).join(', ')+'. ':'')+'Nuts, nut butter, oil, chocolate and droëwors bring it up.']);
    } else if(fd.dens>=400) out.push(['ok',fmt(fd.dens)+' kcal per 100 g: '+(fd.dens>=480?'very well packed.':'good for a trek. Above 450 is where the weight savings get noticeable.')]);
    if(mc.kMac>mc.kpd*0.6){ var pc=mc.cpd*4/mc.kMac*100, pf=mc.fpd*9/mc.kMac*100;
      if(pc<40) out.push(['warn','Only about '+fmt(pc)+'% of the energy comes from carbohydrate. On long climbs carbs are the main fuel: oats, wraps, couscous, mash, dried fruit and sweets help.']);
      if(pf>50) out.push(['warn','About '+fmt(pf)+'% of the energy comes from fat. Light to carry, but appetite drops with altitude and very fatty food can be hard to get down: balance it with carbs.']); }
    if(bw&&mc.hasP){ var pk=mc.ppd/bw; if(pk<1.2) out.push(['warn','Protein is about '+fmt(mc.ppd)+' g a day ('+fmt(pk,1)+' g per kg). Trekking guidance is 1.2–2.0 g per kg: biltong, droëwors, cheese, milk powder, Future Life or a recovery shake help.']); }
    if(+f.spare<BUFFER) out.push(['warn','The group plans '+N+' trail days plus '+BUFFER+' buffer days for weather or delays, but you carry food for '+fmt(+f.spare||0,1)+' buffer day'+(+f.spare===1?'':'s')+'.'+(mc.spG?' Your spare day is '+fmt(mc.spG)+' g.':'')+' <button class="linkbtn" data-fact="spare1">Carry '+BUFFER+' buffer days</button>',true]);
    var gc=summary(cur()).consOther, hasDr=fMenu().items.some(function(i){return i.meal==='dr'&&num(i.g);});
    if(gc>0&&hasDr) out.push(['warn','Your gear list also has '+fmt(gc)+' g ticked under Other consumables (drink mixes, coffee). If those are the same drinks as in this menu, untick them in My gear so they aren\'t counted twice.']);
    return out;
  }
  function refresh(){
    if(!$('fd-sum')){ bwNote(); return; }
    var m=fMenu(), fd=food(), mc=fd.menu, f=L.food, t=+f.kcal||0, bw=num(f.bw);
    m.items.forEach(function(it){ var o=$('fk-'+it.id); if(!o) return; var g=num(it.g)||0, k=num(it.k); o.textContent=k==null?'—':fmt(g*k/100)+' kcal'; });
    if(!mc){ $('fd-sum').innerHTML='<p class="empty">Add foods below to see the totals.</p>'; $('fd-checks').innerHTML=''; $('fd-split').innerHTML=''; MEALS.forEach(function(ml){ var e=$('fms-'+ml[0]); if(e) e.textContent=''; }); bwNote(); return; }
    var diff=fd.kcal-t, short=t&&diff< -50, mac=mc.kMac>0;
    $('fd-sum').innerHTML=
      '<div class="tile'+(short?' fd-short':'')+'"><div class="k">Energy a day</div><div class="v">'+fmt(fd.kcal)+'</div><div class="s">kcal · target '+fmt(t)+(t?' · '+(diff>=0?'+':'−')+fmt(Math.abs(diff)):'')+'</div></div>'+
      '<div class="tile"><div class="k">Food a day</div><div class="v">'+fmt(fd.perDay)+' g</div><div class="s">'+fmt(fd.dens)+' kcal per 100 g</div></div>'+
      '<div class="tile"><div class="k">Protein a day</div><div class="v">'+(mc.hasP?fmt(mc.ppd)+' g':'—')+'</div><div class="s">'+(mc.hasP&&bw?fmt(mc.ppd/bw,1)+' g per kg body weight':mc.hasP?'add body weight for g per kg':'add protein per 100 g')+'</div></div>'+
      '<div class="tile"><div class="k">Food to carry</div><div class="v">'+fmt(fd.total/1000,2)+' kg</div><div class="s">'+fmt(fd.days,fd.days%1?1:0)+' days'+(+f.spare>0?' ('+N+' + '+fmt(+f.spare,(+f.spare)%1?1:0)+' buffer'+(fd.ownSpare?', '+fmt(fd.spareDay)+' g each':'')+')':', no buffer days counted')+'</div></div>'+
      (function(){ var b=burnEst(); return '<div class="tile"><div class="k">Body weight by the end</div><div class="v">'+(b?(b.kg>0.05?'−'+fmt(b.kg,1)+' kg':'± 0 kg'):'—')+'</div><div class="s">'+(b?'burning about '+fmt(Math.round(b.perDay/50)*50)+' kcal a day':'add your body weight above')+'</div></div>'; })();
    $('fd-checks').innerHTML=checks(fd,mc).map(function(c){ return '<p class="'+(c[0]==='ok'?'okbox':'warnbox')+'">'+(c[2]?c[1]:esc(c[1]))+'</p>'; }).join('');
    var mx=Math.max.apply(null,MEALS.map(function(ml){return mc.meals[ml[0]].k;}).concat([1]));
    var macro='';
    if(mac){ var pc=mc.cpd*4/mc.kMac*100, pf=mc.fpd*9/mc.kMac*100, pp=Math.max(0,100-pc-pf), cover=mc.kMac/mc.kpd*100;
      macro='<div class="fd-macro"><div class="fd-mbar2" role="img" aria-label="Energy from carbohydrate '+fmt(pc)+'%, fat '+fmt(pf)+'%, protein '+fmt(pp)+'%"><i class="mc" style="width:'+pc.toFixed(1)+'%"></i><i class="mf" style="width:'+pf.toFixed(1)+'%"></i><i class="mp" style="width:'+pp.toFixed(1)+'%"></i></div>'+
        '<div class="fd-mleg"><span><i class="mc"></i>Carbohydrate '+fmt(pc)+'% · '+fmt(mc.cpd)+' g</span><span><i class="mf"></i>Fat '+fmt(pf)+'% · '+fmt(mc.fpd)+' g</span><span><i class="mp"></i>Protein '+fmt(pp)+'% · '+fmt(mc.ppd)+' g'+(bw?' ('+fmt(mc.ppd/bw,1)+' g/kg)':'')+'</span></div>'+
        '<p class="note">Where the energy comes from'+(cover<95?' (for the '+fmt(cover)+'% of calories with full label values)':'')+'. Expedition guidance: carbohydrate as the main fuel, fat around 30–40% to keep weight down, protein 1.2–2.0 g per kg body weight.</p></div>'; }
    var bb=burnEst(), burnNote=bb?'<div class="fd-burn"><h4>Expected weight change</h4><p>On this route, with your pack, you\'ll burn very roughly <b>'+fmt(Math.round(bb.perDay/50)*50)+' kcal a day</b> (about '+fmt(Math.round(bb.total/1000))+',000 over '+N+' days) and eat about <b>'+fmt(fd.kcal)+'</b>. '+
      (bb.kg>0.05?'That gap works out at <b>about '+fmt(bb.kg,1)+' kg</b> of body weight by Bushman\'s Nek (likely '+fmt(Math.max(0,bb.lo),1)+'–'+fmt(bb.hi,1)+' kg). ':'You\'re eating about what you\'ll burn. ')+
      'The scale will show more at first: glycogen and the water stored with it go in the first days and come back within a few days of eating normally.</p>'+
      '<p class="note">Estimate from each day\'s distance, climb and descent, your body weight and your pack weight that day. Hard, trackless ground and cold push the real figure up; rest stops and an easy pace bring it down.</p></div>':'';
    $('fd-split').innerHTML=burnNote+macro+'<table class="t"><thead><tr><th>Meal</th><th class="r">g a day</th><th class="r">kcal a day</th><th class="r">Share</th><th class="fd-barh" aria-hidden="true"></th></tr></thead><tbody>'+
      MEALS.filter(function(ml){return ml[0]!=='sp';}).map(function(ml){ var x=mc.meals[ml[0]]; return '<tr><td>'+ml[1]+'</td><td class="r">'+fmt(x.g)+'</td><td class="r">'+fmt(x.k)+'</td><td class="r">'+(mc.kpd?fmt(x.k/mc.kpd*100):0)+'%</td><td class="fd-barc"><i style="width:'+(x.k/mx*100).toFixed(1)+'%"></i></td></tr>'; }).join('')+
      '</tbody></table>';
    MEALS.forEach(function(ml){ var e=$('fms-'+ml[0]), x=mc.meals[ml[0]]; if(ml[0]==='sp'){ if(e) e.textContent=mc.spG?fmt(mc.spG)+' g, '+fmt(mc.spK)+' kcal per spare day':''; return; } if(e) e.textContent=x.g?fmt(x.g)+' g · '+fmt(x.k)+' kcal':''; });
    bwNote();
  }
  function bwNote(){ var e=$('f-bw'); if(!e) return; var bw=num(L.food.bw);
    if(!bw){ e.innerHTML='<p class="note">Add your body weight for a suggested target and a protein check.</p>'; return; }
    var lo=Math.round(bw*50/100)*100, hi=Math.round((bw*60+400)/100)*100, sug=Math.round((bw*55+300)/100)*100;
    e.innerHTML='<p class="note">At '+fmt(bw)+' kg: expedition guidance puts heavy days at 40–70 kcal per kg, and above 3,000 m adds about 300–500 kcal. For long days with a pack on the escarpment that\'s roughly <b>'+fmt(lo)+'–'+fmt(hi)+' kcal</b>. Most people eat less than they burn on a trek, so aim close rather than for all of it.'+
      (Math.abs(sug-(+L.food.kcal||0))>=100?' <button class="linkbtn" data-fact="usesug" data-v="'+sug+'">Use '+fmt(sug)+' kcal</button>':'')+'</p>'; }
  function input(t){
    if(t.dataset.fq){ pickQ=t.value; redrawPick(); return; }
    var m=fMenu(); if(!m) return;
    if(t.dataset.fd==='mname'){ m.name=t.value; var tn=$('fmn-'+m.id); if(tn) tn.textContent=t.value||'Menu'; persist(); return; }
    var row=t.closest('[data-fid]'); if(!row) return; var it=findIt(row.dataset.fid); if(!it) return; var k=t.dataset.fd;
    if(k==='name') it.name=t.value;
    else { var v=t.value.trim()===''?null:num(t.value); if(v!=null&&v<0) return; it[k]=v; if(k==='k'||k==='g') t.classList.toggle('need',v==null); }
    persist(); refresh();
  }
  function copy(txt,msg){ var out=$('fd-out'), m=$('fd-msg'); out.value=txt;
    try{ navigator.clipboard.writeText(txt).then(function(){ out.hidden=true; m.textContent=msg; },function(){ out.hidden=false; out.select(); m.textContent='Select the text below and copy it.'; }); }catch(_){ out.hidden=false; out.select(); m.textContent='Select the text below and copy it.'; } }
  function totalFor(it){ var f=L.food, sp=+f.spare||0, own=(menuCalc(fMenu())||{}).spG; if(it.meal==='sp') return Math.ceil((num(it.g)||0)*sp/5)*5; var sc2=N?(N+(own?0:sp))/N:1; return Math.ceil((num(it.g)||0)*fDays(it)*sc2/5)*5; }
  function shopText(){ var m=fMenu(), f=L.food, fd=food();
    return 'DGT 2027 food: '+(m.name||'Menu')+'\n'+N+' trail days + '+fmt(+f.spare||0,1)+' buffer · '+fmt(fd.kcal)+' kcal and '+fmt(fd.perDay)+' g a day · '+kg(fd.total)+' in total\n'+
      MEALS.map(function(ml){ var its=m.items.filter(function(i){return i.meal===ml[0]&&num(i.g);}); if(!its.length) return '';
        return '\n'+ml[1]+'\n'+its.map(function(i){ return '- '+i.name+': '+fmt(totalFor(i))+' g ('+fmt(num(i.g))+' g × '+(i.days==null?'every day':fmt(fDays(i))+' days')+')'; }).join('\n'); }).join('')+'\n'; }
  function tsv(){ var m=fMenu(), rows=[['Meal','Food','g a day','Days','kcal per 100 g','Protein per 100 g','Carbs per 100 g','Fat per 100 g','kcal a day','Total to buy (g)']];
    m.items.forEach(function(i){ var g=num(i.g)||0, k=num(i.k); rows.push([MEAL_NAME[i.meal]||i.meal,i.name,g,i.days==null?N:fDays(i),k==null?'':k,i.p==null?'':i.p,i.c==null?'':i.c,i.f==null?'':i.f,k==null?'':Math.round(g*k/100),totalFor(i)]); });
    return rows.map(function(r){ return r.map(function(c){ return String(c).replace(/[\t\n]/g,' ').replace(/^[=+\-@]/,"'$&"); }).join('\t'); }).join('\n'); }
  async function ai(btn){
    if(busy) return; var box=btn.closest('[data-fdai]'), out=box.querySelector('.adv-out'); out.hidden=false;
    var sample=null; try{ sample=window.claude&&claude.use?await claude.use('sample'):null; }catch(e){}
    if(!sample){ out.textContent='Claude\'s menu check isn\'t available here right now. The numbers above work without it.'; return; }
    var m=fMenu(), f=L.food, fd=food(), mc=fd.menu; if(!mc){ out.textContent='Add some foods first.'; return; }
    var lines=m.items.map(function(i){ return (MEAL_NAME[i.meal]||i.meal)+' | '+i.name+' | '+(num(i.g)||0)+' g/day'+(i.days==null?'':' on '+fDays(i)+' of '+N+' days')+' | '+(num(i.k)==null?'kcal unknown':num(i.k)+' kcal/100 g')+(i.p==null?'':' | P'+i.p)+(i.c==null?'':' C'+i.c)+(i.f==null?'':' F'+i.f)+(i.w?' | needs hot water':''); });
    var prompt='You are an expedition nutritionist. Check this hiker\'s daily food plan for the Drakensberg Grand Traverse: about '+fmt(totalKm)+' km and '+fmt(totalUp)+' m of ascent over '+N+' days, unsupported, mostly trackless on the 2,800–3,400 m escarpment in March. Nights can drop below freezing, afternoons often bring storms; water is plentiful. They cook dinner and hot drinks on a shared gas stove and want to keep fuel use sensible.\n\n'+
      'Target '+fmt(+f.kcal||0)+' kcal a day'+(num(f.bw)?', body weight '+num(f.bw)+' kg':'')+', '+fmt(+f.spare||0,1)+' buffer day(s). The plan averages '+fmt(fd.kcal)+' kcal and '+fmt(fd.perDay)+' g a day ('+fmt(fd.dens)+' kcal per 100 g)'+(mc.hasP?', about '+fmt(mc.ppd)+' g protein':'')+(mc.kMac?', '+fmt(mc.cpd)+' g carbohydrate and '+fmt(mc.fpd)+' g fat':'')+', and about '+fmt(mc.wml/1000,1)+' L of boiled water a day.\n\nItems (meal | food | grams | energy | protein/carbs/fat per 100 g):\n'+lines.join('\n')+
      '\n\nAnswer in plain text, no tables, under 280 words: 1) is the energy enough for this trip, and is the target itself sensible; 2) the balance of carbohydrate, fat and protein, and anything missing (salt, fibre, variety); 3) practical issues: food that gets hard, melts, goes off or crumbles, cooking time and fuel, appetite at altitude; 4) the three most useful changes, each with grams and the kcal or weight effect. Flag any kcal values that look wrong for that food.';
    busy=true; btn.disabled=true; out.textContent='Thinking…';
    try{ var r=await sample(prompt,{onText:function(p){ out.textContent=p.text; }}); out.textContent=r.text; }
    catch(e){ if(e&&e.code==='handoff'){ out.innerHTML='<a class="btn primary" href="'+esc(e.url)+'" target="_blank" rel="noopener">Open in Claude</a> <button class="btn ghost" type="button">Copy the question</button><p class="note">Opens a new chat in your own Claude account (the free plan works) with the question and your list filled in. If it opens empty, copy the question and paste it into Claude.</p>';
      var cq=out.querySelector('button'); cq.onclick=function(){ try{ navigator.clipboard.writeText(e.prompt).then(function(){ cq.textContent='Copied'; },function(){}); }catch(_){} }; busy=false; btn.disabled=false; return; }
      out.textContent=e&&e.code==='rate_limited'?'No more Claude checks just now. Try again later.':'Couldn\'t get a check just now.'+(e&&e.text?'\n\n'+e.text:''); }
    busy=false; btn.disabled=false; btn.textContent='Ask again';
  }
  function click(b){
    var a=b.dataset.fact, m=fMenu();
    if(a!=='rm'&&armed){ armed=null; var rb=document.querySelector('[data-fact="rm"]'); if(rb){ rb.textContent='Delete menu'; rb.classList.remove('armed'); } }
    if(a==='new'){ impMsg=''; addMenu(b.dataset.kind); return; }
    if(a==='impopen'){ impOpen=!impOpen; impMsg=''; rerender(); var ti=$('fd-imp-in'); if(ti) ti.focus(); return; }
    if(a==='impcancel'){ impOpen=false; impMsg=''; rerender(); return; }
    if(a==='impgo'){ importMenu(($('fd-imp-in')||{}).value); return; }
    if(a==='exp'){ copy(exportText(),'Menu copied. Anyone can paste it under + New menu, Import.'); return; }
    if(a==='newopen'){ newOpen=!newOpen; rerender(); return; }
    if(a==='menu'){ L.food.active=b.dataset.mid; newOpen=false; pick=null; persist(); rerender(); return; }
    if(a==='usesug'){ L.food.kcal=+b.dataset.v; persist(); rerender(); return; }
    if(!m) return;
    if(a==='rm'){ if(armed!==m.id){ armed=m.id; b.textContent='Tap again to delete “'+(m.name||'Menu')+'”'; b.classList.add('armed'); return; }
      armed=null; L.food.menus=fMenus().filter(function(x){return x.id!==m.id;}); L.food.active=L.food.menus.length?L.food.menus[0].id:null; pick=null; persist(); rerender(); return; }
    if(a==='del'){ var id=b.closest('[data-fid]').dataset.fid; m.items=m.items.filter(function(i){return i.id!==id;}); persist(); var row=b.closest('.fd-row'); row.parentNode.removeChild(row); refresh(); return; }
    if(a==='pick'){ openPick(b.dataset.mealAdd); return; }
    if(a==='pickclose'){ pick=null; creating=false; rerender(); return; }
    if(a==='pickall'||a==='pickrel'){ pickAll=a==='pickall'; b.parentNode.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed',String(x===b)); }); redrawPick(); return; }
    if(a==='newfood'){ creating=true; var el=document.querySelector('.fd-pick'); if(el){ el.outerHTML=pickerHTML(pick); var n=document.querySelector('.fp-new [data-nf="'+(pickQ?'k':'name')+'"]'); if(n) n.focus(); } return; }
    if(a==='nfcancel'){ creating=false; var el2=document.querySelector('.fd-pick'); if(el2) el2.outerHTML=pickerHTML(pick); return; }
    if(a==='usesg'){ var sg=suggestKcal(); if(sg){ L.food.kcal=sg; L.food.kcalSet=true; persist(); document.querySelectorAll('[data-f="kcal"]').forEach(function(x){ x.value=sg; }); updateFood(); } return; }
    if(a==='cgclose'){ var g=$('fd-cgate'); if(g) g.remove(); return; }
    if(a==='spare1'){ L.food.spare=BUFFER; persist(); rerender(); return; }
    if(a==='nfsave'){ saveNew(); return; }
    if(a==='nfmode'){ var bx=b.closest('.fp-new'); if(bx){ bx.dataset.mode=b.dataset.m; bx.querySelectorAll('[data-fact="nfmode"]').forEach(function(x){ x.setAttribute('aria-pressed',String(x===b)); }); } return; }
    if(a==='mdel'){ if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='Remove?'; b.classList.add('armed'); return; } delMine(b.dataset.id); return; }
    if(a==='shop'){ copy(shopText(),'Copied the shopping list.'); return; }
    if(a==='tsv'){ copy(tsv(),'Copied '+m.items.length+' rows. Paste into a sheet at cell A1.'); return; }
    if(a==='ai'){ ai(b); return; }
  }
  function choose(key){ addFromPick(srcObj(key)); }
  async function start(){
    backfill();
    try{ if(!window.claude||!claude.use) return; var db=await claude.use('db'); if(!db) return; dbCol=db.collection('foods');
      dbCol.onSnapshot(function(q){ dbState='ok'; shared=q.docs.filter(function(d){return d.exists;}).map(function(d){ var x=d.data()||{};
          return {src:'grp',key:'g'+d.id,cat:FCAT_NAME[x.cat]?x.cat:'qck',name:String(x.name||'').slice(0,80),k:num(x.k),p:num(x.p),c:num(x.c),f:num(x.f),g:num(x.g)||50,w:num(x.w)||0}; })
          .filter(function(o){ return o.name&&o.k!=null&&!fMine().some(function(m){return m.name===o.name;}); });
        if(pick) redrawPick(); },function(){ dbState='err'; }); }catch(e){}
  }
  return {view:view,refresh:refresh,input:input,click:click,choose:choose,start:start,claudePrompt:claudePrompt,claudeUrl:claudeUrl,missing:claudeMissing,openGate:openGate,gateRefresh:gateRefresh,claudeSent:claudeSent};
})();
/* "Plan my menu with Claude": the link gets the person's prompt at the moment it's tapped */
document.addEventListener('click',function(e){ var a=e.target.closest&&e.target.closest('a[data-claude-menu]'); if(!a) return;
  if(!a.dataset.go&&FOOD.missing().length){ e.preventDefault(); FOOD.openGate(a); return; }
  var r=FOOD.claudeUrl(!!a.dataset.ask); a.href=r.url;
  try{ if(navigator.clipboard) navigator.clipboard.writeText(r.prompt).catch(function(){}); }catch(x){}
  FOOD.claudeSent(r.lvl); },true);
function vFood(){ return FOOD.view(); }
function updateFood(){
  var f=food();
  if($('f-day')){ $('f-day').textContent=fmt(f.perDay)+' g'; $('f-days').textContent=fmt(f.days,1); $('f-total').textContent=kg(f.total); $('f-kcal').textContent=fmt(f.kcal*f.days)+' kcal'; }
  FOOD.refresh();
}

/* ----- trip ----- */
var TYPES=['Flight','Accommodation','Transfer','Other'], STAT=['To book','Booked','Confirmed','Not needed'];
function statCls(s){return s==='Confirmed'?'ok':s==='Booked'?'acc':s==='Not needed'?'':'warn';}
function opt(list,v){return list.map(function(x){return '<option'+(x===v?' selected':'')+'>'+esc(x)+'</option>';}).join('');}
function vTrip(){
  if(editing) return editForm();
  var ev=[], on=datesOn();
  if(on&&T.arrive) ev.push({d:T.arrive,w:'Arrive in South Africa',s:'',cls:'key'});
  if(on) T.bookings.forEach(function(b){ if(b.date) ev.push({d:b.date,w:b.title,s:b.type+(b.details?' · '+b.details:''),cls:''}); });
  if(TS()){ ev.push({d:TS(),w:'Day 1 on the trail',s:PLAN.stages[0].title,cls:'hike'}); ev.push({d:endDate(),w:'Day '+N+': finish at Bushman\'s Nek',s:PLAN.stages[N-1].title,cls:'hike'}); }
  if(on&&T.depart) ev.push({d:T.depart,w:'Fly home',s:'',cls:'key'});
  ev.sort(function(a,b){return a.d<b.d?-1:a.d>b.d?1:0;});
  var booked=T.bookings.filter(function(b){return b.status!=='To book';}).length;
  var rows=T.bookings.map(function(b){
    return '<tr><td><span class="pill">'+esc(b.type)+'</span></td><td><b>'+esc(b.title)+'</b>'+(b.details?'<span class="sub">'+esc(b.details)+'</span>':'')+'</td>'+
      '<td class="r">'+(b.date&&datesOn()?esc(short(b.date)):'<span style="color:var(--faint)">'+(datesOn()?'—':'after the poll')+'</span>')+'</td><td class="r">'+esc(b.cost||'')+'</td><td><span class="pill '+statCls(b.status)+'">'+esc(b.status)+'</span></td></tr>';
  }).join('');
  return (T.datesStatus==='Confirmed'?'<p class="okbox" style="margin-top:14px">Dates locked in: on the trail '+esc(short(TS()))+' – '+esc(short(endDate()))+'.</p>':'<div style="padding-top:12px">'+POLL.card()+'</div>')+'<div class="head" style="padding-top:12px"><div><h2>Dates &amp; bookings</h2><p class="note">'+booked+' of '+T.bookings.length+' sorted. The same for everyone who opens this page.</p></div>'+
    (canEdit?'<button class="btn primary" data-act="edit-trip">Edit trip details</button>':'')+'</div>'+
    '<div class="grid2"><div class="card"><h3 style="margin-bottom:8px">Timeline</h3>'+
    (!on?'<p class="note">The timeline fills in once the dates poll is locked in. Book flights first, then the shuttles and beds around them.</p>':ev.length?'<ul class="timeline">'+ev.map(function(e){return '<li class="'+e.cls+'"><div class="d">'+esc(short(e.d))+'</div><div class="dot"></div><div class="w"><b>'+esc(e.w)+'</b>'+(e.s?'<span>'+esc(e.s)+'</span>':'')+'</div></li>';}).join('')+'</ul>':'<div class="empty">No dates yet.</div>')+
    (on&&(!T.arrive||!T.depart)?'<p class="note">Arrival and departure dates are still to be added.</p>':'')+
    '</div><div class="card"><h3 style="margin-bottom:8px">Flights, accommodation and shuttles</h3><div class="scroll"><table class="t"><thead><tr><th>Type</th><th>What</th><th class="r">Date</th><th class="r">Cost</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div></div></div>'+
    (saveMsg?'<div class="msg '+(saveMsg.indexOf('Saved')===0?'ok':'bad')+'">'+esc(saveMsg)+'</div>':'');
}
function editForm(){
  var d=draft;
  return '<div class="head" style="padding-top:12px"><div><h2>Edit trip details</h2><p class="note">Saving publishes a new version of this page, so everyone sees the change. People\'s own gear and ticks are not affected.</p></div></div>'+
  '<div class="card"><div class="fields">'+
    '<label class="field">Dates status<select data-k="datesStatus">'+opt(['Tentative','Confirmed'],d.datesStatus)+'</select></label>'+
    '<label class="field">Arrive in South Africa<input type="date" data-k="arrive" value="'+esc(d.arrive)+'"></label>'+
    '<label class="field">Day 1 on the trail<input type="date" data-k="start" value="'+esc(d.start)+'"></label>'+
    '<label class="field">Fly home<input type="date" data-k="depart" value="'+esc(d.depart)+'"></label>'+
    '<label class="field">Days on the trail<input type="number" min="'+MIN_DAYS+'" max="'+MAX_DAYS+'" data-k="tripDays" value="'+esc(d.tripDays||ORIG_N)+'"></label>'+
  '</div><label class="field" style="margin-top:10px">Notes for the group<input type="text" data-k="notes" value="'+esc(d.notes)+'"></label>'+
  '<h3 style="margin:18px 0 4px">Bookings</h3>'+
  d.bookings.map(function(b,i){
    return '<div class="edit-row" data-i="'+i+'">'+
      '<label class="field">Type<select data-b="type">'+opt(TYPES,b.type)+'</select></label>'+
      '<label class="field">What<input data-b="title" value="'+esc(b.title)+'"></label>'+
      '<label class="field">Date<input type="date" data-b="date" value="'+esc(b.date)+'"></label>'+
      '<label class="field">Status<select data-b="status">'+opt(STAT,b.status)+'</select></label>'+
      '<label class="field">Details (flight no., address, contact)<input data-b="details" value="'+esc(b.details)+'"></label>'+
      '<label class="field">Cost<input data-b="cost" value="'+esc(b.cost)+'"></label>'+
      '<button class="exp" data-act="del-b" data-i="'+i+'" aria-label="Remove booking" title="Remove">×</button></div>';
  }).join('')+
  '<div class="toolbar" style="margin-top:12px"><button class="btn" data-act="add-b">+ Add booking</button><span style="flex:1"></span>'+
  '<button class="btn ghost" data-act="cancel-edit">Cancel</button><button class="btn primary" data-act="save-trip"'+(saving?' disabled':'')+'>'+(saving?'Saving…':'Save for everyone')+'</button></div>'+
  (saveMsg?'<div class="msg bad">'+esc(saveMsg)+'</div>':'')+'</div>';
}

/* ----- training & prep ----- */
function vTraining(){
  var t=today();
  var rows=S.training.map(function(p){var now=t>=p.from&&t<=p.to;
    return '<tr'+(now?' class="now"':'')+'><td><b>'+esc(p.phase)+'</b>'+(now?' <span class="pill acc">now</span>':'')+'<span class="sub">Weeks '+esc(p.weeks)+' · '+esc(short(p.from))+' – '+esc(short(p.to))+'</span></td><td>'+esc(p.focus)+'</td><td>'+esc(p.long)+'</td></tr>';}).join('');
  return '<div class="head" style="padding-top:12px"><h2>Training</h2></div>'+(t<S.training[0].from?'<p class="note">Training starts '+esc(nice(S.training[0].from,true))+'.</p>':'')+
    '<div class="card scroll"><table class="t"><thead><tr><th>Phase</th><th>Weekly sessions</th><th>Long weekend walk</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function vPrep(){
  var done=S.prep.filter(function(p){return L.prep[p.id];}).length;
  return '<div class="head" style="padding-top:12px"><div><h2>Before you go</h2><p class="note"><span id="prep-n">'+done+'</span> of '+S.prep.length+' done. Ticks are saved in this browser.</p></div></div>'+
    '<div class="card"><ul class="prep">'+S.prep.map(function(p){return '<li><label><input type="checkbox" data-prep="'+p.id+'"'+(L.prep[p.id]?' checked':'')+'><span>'+esc(p.t)+'</span></label></li>';}).join('')+'</ul></div>'+
    '<div class="linkrow"><a href="https://www.vertical-endeavour.com/downloads" target="_blank" rel="noopener">Vertical Endeavour downloads ↗</a><a href="https://www.kznwildlife.com" target="_blank" rel="noopener">Ezemvelo KZN Wildlife ↗</a><a href="https://www.mountainclub.org.za" target="_blank" rel="noopener">Mountain Club of SA ↗</a></div>';
}

/* =========================================================
   Events
   ========================================================= */
function bind(){
  var app=$('app');
  app.addEventListener('change',function(e){
    if(e.target.dataset&&e.target.dataset.act==='prio-sleep'){ ADVICE.setPrio('sleep',e.target.checked); rerender(); return; }
    var t=e.target, row=t.closest('[data-id]');
    if(t.dataset.act==='on'&&row){ var it=findItem(row.dataset.id); wst(cur(),it.id).on=t.checked; row.classList.toggle('off',!t.checked); persist(); updateGear(); }
    else if(t.dataset.act==='pon'){ partSet(t,'on',t.checked); t.closest('.part').classList.toggle('off',!t.checked); }
    else if(t.id==='restore-file'&&t.files&&t.files[0]){ var fr=new FileReader(); fr.onload=function(){ restoreFrom(fr.result); }; fr.readAsText(t.files[0]); t.value=''; }
    else if(t.dataset.prep){ if(t.checked) L.prep[t.dataset.prep]=true; else delete L.prep[t.dataset.prep]; persist(); $('prep-n').textContent=S.prep.filter(function(p){return L.prep[p.id];}).length; }
    else if(t.dataset.act==='rename'){ L.names[t.dataset.k]=t.value.trim()||('Setup '+t.dataset.k); persist(); rerender(); }
    else if(editing&&t.dataset.k){ draft[t.dataset.k]=t.value; }
    else if(editing&&t.dataset.b){ draft.bookings[+t.closest('[data-i]').dataset.i][t.dataset.b]=t.value; }
  });
  app.addEventListener('input',function(e){
    var t=e.target, row=t.closest('[data-id]'), a=t.dataset.act;
    if(a==='mine'){ var itm=findItem(t.closest('[data-pfor]').dataset.pfor), sm=wst(cur(),itm.id); sm.mine=t.value; if(t.value.trim()&&sm.on==null) sm.on=true; persist(); var tt=$('t-'+itm.id); if(tt) tt.textContent=nameOf(itm,sm); var nn=$('n-'+itm.id); if(nn) nn.innerHTML=noteText(itm,sm); var rw=document.querySelector('.item[data-id="'+itm.id+'"]'); if(rw){ rw.classList.toggle('mine',!!t.value.trim()); var cb=rw.querySelector('[data-act="on"]'); if(cb&&sm.on){ cb.checked=true; rw.classList.remove('off'); } } updateGear(); return; }
    if(a==='cname'){ var itc=findItem(t.closest('[data-pfor]').dataset.pfor); itc.name=t.value||itc.name; persist(); var tc=$('t-'+itc.id); if(tc) tc.textContent=itc.name; return; }
    if(a==='pname'){ var bx=t.closest('[data-pfor]'), itp=findItem(bx.dataset.pfor), sp=wst(cur(),itp.id), pid2=t.closest('.part').dataset.pid, xp2=(sp.xp||[]).filter(function(p){return p.id===pid2;})[0];
      if(xp2) xp2.name=t.value; else { sp.p=sp.p||{}; sp.p[pid2]=sp.p[pid2]||{}; sp.p[pid2].name=t.value||null; } persist(); return; }
    if(a==='g'&&row){ var it=findItem(row.dataset.id), s=wst(cur(),it.id), v=num(t.value); s.g=v==null?null:v; s.mode='total'; persist(); refreshItem(it); updateGear(); }
    else if(a==='qty'&&row){ var it2=findItem(row.dataset.id), v2=num(t.value); wst(cur(),it2.id).qty=v2==null?null:Math.max(0,Math.round(v2)); persist(); refreshItem(it2); updateGear(); }
    else if(a==='pg'){ partSet(t,'g',num(t.value)); }
    else if(a==='gsize'){ var gs=num(t.value); if(gs&&gs>=1){ L.groupSize=Math.round(gs); persist(); updateGear(); } }
    else if(a==='spec'){ var sv=t.value===''?null:num(t.value); ADVICE.setSpec(t.dataset.k,sv); ADVICE.refreshFit(); }
    else if(a==='gload'){ var gl=num(t.value); L.groupLoad=t.value===''?null:gl; persist(); updateGear(); }
    else if(a==='days'){ var nd=+t.value; $('days-out').textContent=nd+' days'; clearTimeout(window._dt); window._dt=setTimeout(function(){ L.tripDays=nd===groupDays()?null:nd; persist(); setPlan(myDays()); MAP.replan(); renderRoute(viewEl('route')); var sl=document.querySelector('[data-act="days"]'); if(sl) sl.focus(); },120); }
    else if(t.dataset.fd||t.dataset.fq){ FOOD.input(t); }
    else if(t.dataset.lk&&linkEdit){ var li=+t.closest('[data-li]').dataset.li; if(linkEdit[li]) linkEdit[li][t.dataset.lk]=t.value; }
    else if(t.dataset.f==='bw'&&t.value===''){ delete L.food.bw; persist(); updateFood(); }
    else if(t.dataset.f){ var fv=num(t.value); if(fv!=null&&fv>=0){ L.food[t.dataset.f]=fv; if(t.dataset.f==='kcal') L.food.kcalSet=true; persist(); updateFood(); if(t.dataset.f==='bw') FOOD.gateRefresh(); } }
    else if(editing&&t.dataset.k){ draft[t.dataset.k]=t.value; }
    else if(editing&&t.dataset.b){ draft.bookings[+t.closest('[data-i]').dataset.i][t.dataset.b]=t.value; }
  });
  app.addEventListener('keydown',function(e){
    if(e.key!=='Enter') return; var t=e.target, b=null;
    if(t.dataset.new) b=t.closest('.parts').querySelector('[data-act="padd"]');
    else if(t.dataset.ai) b=t.closest('.addin').querySelector('[data-act="ai-add"]');
    else if(t.dataset.fq) b=document.querySelector('.fd-pick .fp-it')||document.querySelector('.fd-pick [data-fact="newfood"]');
    else if(t.dataset.nf) b=document.querySelector('[data-fact="nfsave"]');
    else if(t.id==='new-cat-name') b=document.querySelector('[data-act="cat-add"]');
    if(b){ e.preventDefault(); b.click(); }
  });
  app.addEventListener('click',function(e){
    var plk=e.target.closest('[data-plock]'); if(plk){ var po=POLL.opts.filter(function(x){return x.id===plk.dataset.plock;})[0]; if(po) lockDates(po,plk); return; }
    var fb=e.target.closest('[data-fact]'); if(fb){ FOOD.click(fb); return; }
    var fpk=e.target.closest('[data-fpick]'); if(fpk){ FOOD.choose(fpk.dataset.fpick); return; }
    var tr=e.target.closest('[data-goday]'); if(tr){ location.hash='#day-'+tr.dataset.goday; var mb=document.querySelector('.mapbox'); if(mb) mb.scrollIntoView({block:'start'}); return; }
    var b=e.target.closest('button'); if(!b||b.closest('.rmap')) return;
    var a=b.dataset.act, row=b.closest('[data-id]')||(b.closest('[data-pfor]')&&{dataset:{id:b.closest('[data-pfor]').dataset.pfor}});
    if(b.dataset.setup){ L.active=b.dataset.setup; persist(); if(b.dataset.go) location.hash='#gear'; else rerender(); return; }
    if(a==='tog'){ var id=row.dataset.id; openIds[id]=!openIds[id]; rerender(); return; }
    if(a==='padd'){ var box=b.closest('.parts'), nm=box.querySelector('[data-new="name"]'), gg=box.querySelector('[data-new="g"]'); var it=findItem(box.dataset.pfor);
      if(!nm.value.trim()){ nm.focus(); return; } var s=wst(cur(),it.id); s.xp=s.xp||[]; s.xp.push({id:'x'+Date.now().toString(36),name:nm.value.trim(),g:num(gg.value)||0});
      if(partsOf(it,s).length===s.xp.length&&s.g==null) s.mode='parts'; persist(); rerender(); return; }
    if(a==='prm'){ var it3=findItem(row.dataset.id), s3=wst(cur(),it3.id), pid=b.closest('.part').dataset.pid; s3.xp=(s3.xp||[]).filter(function(p){return p.id!==pid;}); if(s3.p) delete s3.p[pid]; persist(); rerender(); return; }
    if(a==='slotreset'){ var itr=findItem(row.dataset.id); delete cur().st[itr.id]; persist(); rerender(); return; }
    if(a==='useparts'){ var it4=findItem(row.dataset.id), s4=wst(cur(),it4.id); s4.mode='parts'; s4.g=null; persist(); rerender(); return; }
    if(a==='irm'){ var lo=cur(); lo.custom=lo.custom.filter(function(c){return c.id!==row.dataset.id;}); delete lo.st[row.dataset.id]; persist(); rerender(); return; }
    if(a==='ai-open'){ openAdd={}; openAdd[b.dataset.key]=true; rerender(); var inp=document.querySelector('.addin [data-ai="name"]'); if(inp) inp.focus(); return; }
    if(a==='ai-cancel'){ openAdd={}; rerender(); return; }
    if(a==='ai-add'){ var box2=b.closest('.addin'), n=box2.querySelector('[data-ai="name"]').value.trim(), g=num(box2.querySelector('[data-ai="g"]').value)||0;
      if(!n){ box2.querySelector('[data-ai="name"]').focus(); return; }
      var lo2=cur(); lo2.custom.push({id:'u'+Date.now().toString(36),scope:b.dataset.scope,cat:box2.dataset.addcat,name:n,g:g,essential:false,custom:true});
      persist(); rerender(); var again=document.querySelector('.addin [data-ai="name"]'); if(again) again.focus(); return; }
    if(a==='cat-add'){ var cn=$('new-cat-name').value.trim(); if(!cn){ $('new-cat-name').focus(); return; }
      var lo4=cur(), sc=b.dataset.scope; if(!catList(lo4,sc).some(function(c){return c.name.toLowerCase()===cn.toLowerCase();})) lo4.cats.push({scope:sc,name:cn,kind:$('new-cat-kind').value});
      openAdd={}; openAdd[sc+'|'+cn]=true; persist(); rerender(); var ni=document.querySelector('.addin [data-ai="name"]'); if(ni){ ni.scrollIntoView({block:'center'}); ni.focus(); } return; }
    if(a==='catrm'){ var lo5=cur(); lo5.cats=lo5.cats.filter(function(c){return !(c.name===b.dataset.cat&&c.scope===(view==='group'?'g':'p'));}); persist(); rerender(); return; }
    if(a==='adv-ai'){ ADVICE.ai(b); return; }
    if(a==='prio'){ ADVICE.setPrio('mode',b.dataset.m); rerender(); return; }
    if(a==='sos-copy'){ var txt='DGT emergency numbers\n'+SAFE_NUM.map(function(n){return n[0]+': '+n[1];}).join('\n'); try{ navigator.clipboard.writeText(txt).then(function(){ $('sos-msg').textContent=' Copied.'; },function(){ $('sos-msg').textContent=' '+txt; }); }catch(_){ $('sos-msg').textContent=' '+txt; } return; }
    if(a==='reset-scope'&&!b.dataset.armed){ b.dataset.armed='1'; b.classList.add('armed'); b.textContent='Tap again to reset '+L.names[L.active];
      clearTimeout(b._t); b._t=setTimeout(function(){ if(b.isConnected){ delete b.dataset.armed; b.classList.remove('armed'); b.textContent='Reset this list'; } },5000); return; }
    if(a==='gload-clear'){ L.groupLoad=null; persist(); rerender(); return; }
    if(a==='reset-scope'){ var lo3=cur(), sc2=b.dataset.scope, nm3=L.names[L.active]; items(lo3,sc2).forEach(function(i){ delete lo3.st[i.id]; }); lo3.custom=lo3.custom.filter(function(c){return c.scope!==sc2;}); lo3.cats=lo3.cats.filter(function(c){return c.scope!==sc2;}); if(sc2==='g') L.groupLoad=null; persist(); rerender(); var hd=document.querySelector('[data-view="'+view+'"] .head .note'); if(hd){ var m=document.createElement('p'); m.className='msg ok'; m.textContent=(sc2==='g'?'Group gear':'My gear')+' for '+nm3+' is back to the typical items. The other setup is unchanged.'; hd.after(m); } return; }
    if(a==='copy'){ L.lo[b.dataset.to]=JSON.parse(JSON.stringify(L.lo[b.dataset.from])); persist(); rerender(); return; }
    if(a==='tsv'){ var rowsT=gearRows();
      var tsv=rowsT.map(function(r){return r.map(function(c){return String(c).replace(/[\t\n]/g,' ');}).join('\t');}).join('\n');
      var out2=$('bk-out'); out2.innerHTML='<textarea class="code" readonly id="bk-code" style="margin-top:10px">'+esc(tsv)+'</textarea><div class="msg" id="bk-msg"></div>';
      var ta2=$('bk-code'); try{ navigator.clipboard.writeText(tsv).then(function(){$('bk-msg').textContent='Copied '+(rowsT.length-1)+' rows. In the group gear sheet, click cell A4 of your tab and paste.';},function(){ta2.select();$('bk-msg').textContent='Select the text above and copy it, then paste into cell A4 of your tab in the group gear sheet.';}); }catch(_){ ta2.select(); }
      return; }
    if(a==='backup'){ var code='DGT3:'+btoa(unescape(encodeURIComponent(JSON.stringify(L))));
      var out=$('bk-out'); out.innerHTML='<textarea class="code" readonly id="bk-code" style="margin-top:10px">'+esc(code)+'</textarea><div class="msg" id="bk-msg"></div>';
      var ta=$('bk-code'); try{ navigator.clipboard.writeText(code).then(function(){$('bk-msg').textContent='Copied. Paste it somewhere safe, or into this page on another device.';},function(){ta.select();$('bk-msg').textContent='Select the code above and copy it.';}); }catch(_){ ta.select(); }
      return; }
    if(a==='showrestore'){ $('restore').hidden=!$('restore').hidden; return; }
    if(a==='restore'){ restoreFrom($('restore-in').value); return; }
    if(a==='days-reset'){ L.tripDays=null; persist(); setPlan(myDays()); MAP.replan(); renderRoute(viewEl('route')); return; }
    if(a==='days-save'){ draft=JSON.parse(JSON.stringify(T)); draft.tripDays=N; save(); return; }
    if(a==='links-edit'){ linkMsg=''; linkEdit=JSON.parse(JSON.stringify(T.links||[])); if(!linkEdit.length) linkEdit.push({cat:'Shuttles',title:'',url:'',note:''}); rerender(); return; }
    if(a==='links-add'){ linkEdit.push({cat:'Other',title:'',url:'',note:''}); rerender(); var ins=document.querySelectorAll('.lk-row [data-lk="title"]'); if(ins.length) ins[ins.length-1].focus(); return; }
    if(a==='links-rm'){ linkEdit.splice(+b.closest('[data-li]').dataset.li,1); rerender(); return; }
    if(a==='links-cancel'){ linkEdit=null; rerender(); return; }
    if(a==='links-save'){ var bad=linkEdit.filter(function(l){ return l.url&&!/^https?:\/\/\S+\.\S+/.test(l.url.trim()); })[0];
      if(bad){ linkMsg=('“'+(bad.title||bad.url)+'” needs a full web address starting with https://'); rerender(); return; }
      var next=JSON.parse(JSON.stringify(T)); next.links=linkEdit.filter(function(l){ return (l.url||'').trim(); }).map(function(l){ return {cat:l.cat||'Other',title:(l.title||'').trim().slice(0,120),url:l.url.trim(),note:(l.note||'').trim().slice(0,300)}; });
      rerender(); publishTrip(next).then(function(ok){ if(ok){ linkEdit=null; linkMsg='Saved. Everyone sees the new links.'; } rerender(); }); return; }
    if(a==='edit-trip'){ editing=true; saveMsg=''; draft=JSON.parse(JSON.stringify(T)); rerender(); return; }
    if(a==='cancel-edit'){ editing=false; draft=null; saveMsg=''; rerender(); return; }
    if(a==='add-b'){ draft.bookings.push({id:'b'+Date.now(),type:'Other',title:'',date:'',details:'',status:'To book',cost:''}); rerender(); return; }
    if(a==='del-b'){ draft.bookings.splice(+b.dataset.i,1); rerender(); return; }
    if(a==='save-trip'){ save(); return; }
  });
}
/* rows for the person's tab in the group sheet. Every number is the one the planner counts:
   unweighed lines carry their typical weight (marked), and group gear is what this person carries, not the whole group list */
var EST_MARK=' [typical weight, not weighed yet]';
function gearRows(){ var rowsT=[['Setup','Category','Counts as','Item','Your item','Taking','Qty','Grams each','Total grams']];
  ['A','B'].forEach(function(k){ var lo4=L.lo[k], sm=summary(lo4);
    items(lo4,'p').forEach(function(it){ var st=stOf(lo4,it.id), ci=catInfo(lo4,it.scope,it.cat), u=unitEst(it,st), q=qtyOf(it,st), on=isOn(it,st);
      rowsT.push([L.names[k],it.cat,KIND[ci.kind]||'',it.name,(st.mine||'').trim()+(isEst(it,st)?EST_MARK:''),on?'yes':'no',q,u,on?u*q:0]); });
    var ml=typeof GG!=='undefined'&&GG.mineList?GG.mineList():null;
    if(!sm.ownLoad&&ml&&ml.length) ml.forEach(function(x){ rowsT.push([L.names[k],'Group: you carry',x.fuel?'Consumable':'Carried gear',x.name,'','yes',x.n,x.g,x.g*x.n]); });
    else { var lbl=sm.ownLoad?'Your group load (typed on Group gear)':'Your share of the group list (even split)';
      rowsT.push([L.names[k],'Group: you carry','Carried gear',lbl+', gear','','yes',1,Math.round(sm.shareBase),Math.round(sm.shareBase)]);
      if(sm.shareFuel) rowsT.push([L.names[k],'Group: you carry','Consumable',lbl+', gas','','yes',1,Math.round(sm.shareFuel),Math.round(sm.shareFuel)]); }
  });
  return rowsT; }
window.DGT_gearRows=gearRows;
/* rows for the person's tab in the group sheet: the gear list, then the active food menu (Setup "Food", so the gear totals ignore it) */
function sheetRows(){ var r=gearRows(), m=fMenu(), fd=food(); if(!m||!m.items.length||!fd.menu) return totalsRows(r);
  var sp0=+L.food.spare||0, sc=N?(N+(fd.ownSpare?0:sp0))/N:1;
  r.push(['','','','','','','','','']);
  r.push(['Food','Meal','Counts as','Food','Menu','kcal a day','Days','g a day','Total to carry (g)']);
  m.items.forEach(function(i){ var g=num(i.g)||0, k=num(i.k), d=fDays(i); if(i.meal==='sp'){ r.push(['Food','Spare day','Consumable',i.name,m.name||'Menu','',sp0,g,Math.round(g*sp0)]); return; } r.push(['Food',MEAL_NAME[i.meal]||i.meal,'Consumable',i.name,m.name||'Menu',k==null?'':Math.round(g*k/100*d/N),d,g,Math.round(g*d*sc)]); });
  r.push(['Food','Whole menu','Consumable','Daily average',m.name||'Menu',fd.kcal,fd.days,fd.perDay,fd.total]);
  return totalsRows(r); }
/* the same totals the planner shows, for the setup in use */
function totalsRows(r){ var s=summary(cur()), k=function(g){ return Math.round(g)/1000; }, nm=L.names[L.active];
  r.push(['','','','','','','','','']);
  r.push(['Totals','As in the planner, setup '+nm,'','','','','','','kg']);
  [['Base weight (your gear + group gear you carry)',s.base],['Worn',s.worn],['Food (incl. buffer days)',s.food],['Water carried',s.water],['Gas and other consumables',s.fuel+s.consOther],['Pack at the start',s.pack],['Skin-out (pack + worn)',s.skin]]
    .forEach(function(x){ r.push(['Totals',x[0],'','','','','','',k(x[1])]); });
  if(estList(s).length) r.push(['Totals','Estimate: '+estList(s).join('; ').replace(/&amp;/g,'&'),'','','','','','','']);
  return r; }
window.DGT_sheetRows=sheetRows;
function importSheet(text){
  var rows=String(text).replace(/\r/g,'').split('\n').map(function(l){return l.split('\t');}).filter(function(r){return r.length>=9&&!/^(food|totals)$/i.test(r[0].trim())&&!/^group: you carry$/i.test(r[1].trim());});
  var h=rows[0]&&rows[0][0].trim().toLowerCase()==='setup'?rows.shift():null; if(!rows.length) return 0;
  var KR={'carried gear':'base','worn':'worn','consumable':'cons'}, setups={}, used=[], n=0;
  rows.forEach(function(r){ var sn=r[0].trim(); if(!sn||setups[sn]) return; var k=L.names.A===sn&&used.indexOf('A')<0?'A':L.names.B===sn&&used.indexOf('B')<0?'B':used.indexOf('A')<0?'A':used.indexOf('B')<0?'B':null; if(k){ setups[sn]=k; used.push(k); } });
  used.forEach(function(k){ L.lo[k]=blankSetup(); }); Object.keys(setups).forEach(function(sn){ L.names[setups[sn]]=sn; });
  rows.forEach(function(r){ var k=setups[r[0].trim()]; if(!k) return; var lo=L.lo[k], cat=r[1].trim(), scope='p';
    if(/^group:\s*/i.test(cat)){ scope='g'; cat=cat.replace(/^group:\s*/i,''); }
    var name=r[3].trim(), mine=r[4].trim(), on=/^y/i.test(r[5].trim()), qty=num(r[6]), g=num(r[7]); if(!name) return;
    if(mine.indexOf(EST_MARK.trim())>=0){ mine=mine.replace(EST_MARK.trim(),'').trim(); g=null; }
    var it=S.catalog.filter(function(c){return c.scope===scope&&c.name===name;})[0]||lo.custom.filter(function(c){return c.scope===scope&&c.name===name;})[0];
    if(!it){ if(!catList(lo,scope).some(function(c){return c.name===cat;})) lo.cats.push({scope:scope,name:cat,kind:KR[r[2].trim().toLowerCase()]||'base'});
      lo.custom.push({id:'u'+Date.now().toString(36)+n,scope:scope,cat:cat,name:name,g:g||0,essential:false,custom:true}); it=lo.custom[lo.custom.length-1]; }
    var st=lo.st[it.id]=lo.st[it.id]||{}; st.on=on; if(!it.custom){ st.g=g==null?null:g; st.mode='total'; } if(qty!=null&&qty!==1) st.qty=qty; if(mine) st.mine=mine; n++; });
  persist(); return n;
}
function restoreFrom(text){
  var msg=$('restore-msg');
  if(/\t/.test(String(text))&&/^\s*setup\t/i.test(String(text))){ try{ var n=importSheet(text); msg.className='msg ok'; msg.textContent='Imported '+n+' rows from the sheet. Parts aren\'t in the sheet, so each item now has one total weight.'; setTimeout(rerender,900); }catch(_){ msg.className='msg bad'; msg.textContent='Those rows could not be read. Copy from the Setup header down, all nine columns.'; } return; }
  try{
    var raw=String(text||'').replace(/\s+/g,'').replace(/^[“”"']+|[“”"']+$/g,'');
    raw=raw.replace(/^dgt\d?:/i,'');
    raw=raw.replace(/-/g,'+').replace(/_/g,'/'); while(raw.length%4) raw+='=';
    var o=JSON.parse(decodeURIComponent(escape(atob(raw))));
    if(!o||!o.lo||!o.lo.A) throw 0;
    o.v=3; for(var k in o) L[k]=o[k]; loadFix(); persist();
    msg.className='msg ok'; msg.textContent='Restored. Your gear is now on My gear and Weight.'; setTimeout(rerender,900);
  }catch(_){ msg.className='msg bad'; msg.textContent='That code could not be read. Make sure you pasted all of it, or load the .txt file instead.'; }
}
function loadFix(){ if(!L.buf2){ L.food=L.food||{}; if(!(+L.food.spare>=BUFFER)) L.food.spare=BUFFER; L.buf2=1; } ['A','B'].forEach(function(k){ var lo=L.lo[k]=L.lo[k]||blankSetup(); lo.st=lo.st||{}; lo.custom=lo.custom||[]; lo.cats=lo.cats||[]; }); }
function partSet(t,k,v){
  var box=t.closest('[data-pfor]'), it=findItem(box.dataset.pfor), pid=t.closest('.part').dataset.pid, s=wst(cur(),it.id);
  var xp=(s.xp||[]).filter(function(p){return p.id===pid;})[0];
  if(xp&&k==='g'){ xp.g=v==null?0:v; } else { s.p=s.p||{}; s.p[pid]=s.p[pid]||{}; s.p[pid][k]=v; }
  s.mode='parts'; s.g=null; persist(); refreshItem(it); updateGear();
}
function refreshItem(it){
  var s=stOf(cur(),it.id), row=document.querySelector('.item[data-id="'+it.id+'"]'); if(!row) return;
  var gi=row.querySelector('[data-act="g"]'); if(gi&&document.activeElement!==gi) gi.value=unitOf(it,s)||'';
  var n=$('n-'+it.id); if(n) n.innerHTML=noteText(it,s);
  var m=$('m-'+it.id); if(m) m.innerHTML=modeText(it,s);
}

/* ---------- save for everyone (editors only) ---------- */
function jsonScript(id,obj){ return '<script type="application/json" id="'+id+'">'+JSON.stringify(obj).replace(/</g,'\\u003c')+'<\/script>'; }
function buildDoc(trip){
  var head='<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'+
    ':root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}'+
    '</style></head><body>';
  var scripts=Array.prototype.map.call(document.querySelectorAll('script[data-lib]'),function(s){return '<script src="'+esc(s.getAttribute('src'))+'" data-lib="1"><\/script>';}).join('');
  var content='<title>'+esc(document.title)+'</title><meta name="claude:viewport-fit-sides" content="cover">'+
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'+
    '<link rel="stylesheet" href="'+esc($('dgt-fonts').getAttribute('href'))+'" id="dgt-fonts">'+
    '<style id="dgt-css">'+$('dgt-css').textContent+'</style><div id="app"></div>'+
    '<script type="application/json" id="dgt-static">'+$('dgt-static').textContent+'<\/script>'+
    jsonScript('dgt-trip',trip)+
    '<script type="application/json" id="dgt-3d">'+$('dgt-3d').textContent+'<\/script>'+
    scripts+'<script id="dgt-app">'+$('dgt-app').textContent+'<\/script>';
  return head+content+'</body></html>';
}
function clean(d){
  d.tripDays=Math.max(MIN_DAYS,Math.min(MAX_DAYS,parseInt(d.tripDays,10)||ORIG_N));
  d.bookings=d.bookings.filter(function(b){return b.title.trim()||b.date||b.details.trim();});
  d.bookings.sort(function(a,b){ if(!a.date&&!b.date) return 0; if(!a.date) return 1; if(!b.date) return -1; return a.date<b.date?-1:a.date>b.date?1:0; });
  return d;
}
async function save(){
  if(saving) return; saving=true; saveMsg=''; rerender();
  try{
    var art=await claude.use('artifact'); if(!art) throw {code:'not_granted'};
    var next=clean(JSON.parse(JSON.stringify(draft)));
    await art.publish(buildDoc(next));
    T=next; if(L.tripDays===T.tripDays){ L.tripDays=null; persist(); } setPlan(myDays()); MAP.replan(); editing=false; draft=null; saving=false; saveMsg='Saved. Everyone now sees the new details.'; rerender();
  }catch(err){
    saving=false; var c=err&&err.code;
    if(c==='conflict') saveMsg='Someone else saved at the same moment; the page will reload with their version.';
    else if(c==='not_writer'||c==='not_granted'){ saveMsg='You can view this page but not save changes to it.'; canEdit=false; editing=false; }
    else if(c==='rate_limited') saveMsg='Too many saves in a short time. Wait a minute and try again.';
    else if(c==='too_large') saveMsg='The page got too large to save. Shorten some details.';
    else saveMsg='Saving didn\'t work ('+(c||'unknown error')+'). Try again.';
    rerender();
  }
}

/* =========================================================
   2D route map: shaded relief + contours drawn from the embedded elevation grid
   ========================================================= */
var MAP=(function(){
  var booted=false, pending=0;
  var R=D.route, NR=R.km.length, days, ds, zones, bounds;
  function syncPlan(){ ds=PLAN.stages; days=ds; bounds=ds.map(function(s){return [s.from,s.to];});
    zones=ds.map(function(s){ var c=s.camp; return {day:s.day,t:c.name,r:c.r||0.8,range:c.range||('km '+fmt(c.km,1)),note:c.note||'',x:c.x,z:c.z,lat:c.lat,lon:c.lon}; }); }
  syncPlan();
  var G=D.grid, NX=G.nx, NZ=G.nz, ST=G.step;
  var sel=0, cursorKm=null;
  var cv, ctx, W=0, H=0, dpr=1, cx=0, cz=0, sc=4, relief=null, F=4, need=false;
  var layers={sleep:true,no:true,water:true,streams:true,zones:true,alts:true,labels:true,km:true,grade:false,bail:true,places:true};
  var OG=D.outer||null, outerRelief=null, ODEM=null, me=null, watchId=null, meFirst=false;
  var DEM=null, probe=null, hoverKm=null, measuring=false, mpts=[], full=false;
  /* grade (%) along the GPS track, smoothed over about ±150 m */
  var GRADE=(function(){ var g=new Float32Array(NR); for(var i=0;i<NR;i++){ var a=i,b=i; while(a>0&&R.km[i]-R.km[a]<0.15) a--; while(b<NR-1&&R.km[b]-R.km[i]<0.15) b++; var d=(R.km[b]-R.km[a])*1000; g[i]=d>0?(R.e[b]-R.e[a])/d*100:0; } return g; })();
  var GRADE_CLS=[[6,'#4F9A55','under 6%'],[12,'#B5AE3A','6–12%'],[20,'#E5A13C','12–20%'],[30,'#D9662F','20–30%'],[999,'#A8281C','over 30%']];
  // DGT map palette: Expedition (dark) or Daylight, read from the page's theme tokens
  function mapPal(){
    var dark=cssv('--map-mode')!=='light';
    return dark?{dark:1,ground:'#222324',stops:[[1000,[46,58,44]],[1500,[56,68,52]],[2000,[70,80,64]],[2500,[88,94,80]],[2850,[106,108,96]],[3150,[128,128,118]],[3500,[160,156,144]]],
      shade:[0.5,0.75],c100:'rgba(239,230,208,.13)',c500:'rgba(239,230,208,.30)',halo:'rgba(34,35,36,.92)',ink:'#EFE6D0',muted:'#B9B09C',accent:'#E5A13C',
      casing:'#222324',route:'#D9662F',routeDim:'rgba(217,102,47,.42)',camp:'#E5A13C',campRing:'#222324',zoneFill:'rgba(229,161,60,.07)',zoneSel:'rgba(229,161,60,.16)',zoneLine:'rgba(229,161,60,.55)',
      sleep:'#8DBE78',no:'#E2553F',water:'#6FA8D6',alt:'rgba(185,176,156,.85)',dotRing:'#222324',bail:'#E2553F',bailText:'#F2A08F'}
    :{dark:0,ground:'#F4EDDD',stops:[[1000,[195,205,168]],[1500,[214,216,176]],[2000,[230,221,184]],[2500,[232,214,178]],[2850,[227,210,174]],[3150,[216,204,184]],[3500,[241,235,221]]],
      shade:[0.62,0.52],c100:'rgba(51,68,47,.22)',c500:'rgba(51,68,47,.48)',halo:'rgba(244,237,221,.92)',ink:'#222324',muted:'#5A5548',accent:'#8F4523',
      casing:'#F4EDDD',route:'#D9662F',routeDim:'rgba(217,102,47,.45)',camp:'#E5A13C',campRing:'#222324',zoneFill:'rgba(164,83,42,.06)',zoneSel:'rgba(164,83,42,.14)',zoneLine:'rgba(143,69,35,.6)',
      sleep:'#3B6B35',no:'#B3321F',water:'#2F6E9E',alt:'rgba(90,85,72,.85)',dotRing:'#F4EDDD',bail:'#B3321F',bailText:'#8E2414'};
  }
  var P=null;
  function gradeCol(g){ g=Math.abs(g); for(var i=0;i<GRADE_CLS.length;i++) if(g<GRADE_CLS[i][0]) return GRADE_CLS[i][1]; return '#A8281C'; }
  function elevOuter(x,z){ if(!ODEM) return null; var u=(x-OG.x0)/OG.step, v=(z-OG.z0)/OG.step, n=OG.nx; if(u<0||v<0||u>n-1||v>OG.nz-1) return null;
    var i=Math.min(n-2,Math.floor(u)), j=Math.min(OG.nz-2,Math.floor(v)), fu=u-i, fv=v-j, k=j*n+i; return ODEM[k]*(1-fu)*(1-fv)+ODEM[k+1]*fu*(1-fv)+ODEM[k+n]*(1-fu)*fv+ODEM[k+n+1]*fu*fv; }
  function elevAt(x,z){ if(!DEM) return null; var u=(x-G.x0)/ST, v=(z-G.z0)/ST; if(u<0||v<0||u>NX-1||v>NZ-1) return elevOuter(x,z);
    var i=Math.min(NX-2,Math.floor(u)), j=Math.min(NZ-2,Math.floor(v)), fu=u-i, fv=v-j, k=j*NX+i;
    return DEM[k]*(1-fu)*(1-fv)+DEM[k+1]*fu*(1-fv)+DEM[k+NX]*(1-fu)*fv+DEM[k+NX+1]*fu*fv; }
  function slopeAt(x,z){ var d=0.25, a=elevAt(x-d,z), b=elevAt(x+d,z), c=elevAt(x,z-d), e=elevAt(x,z+d); if(a==null||b==null||c==null||e==null) return null;
    var gx=(b-a)/(2*d*1000), gz=(e-c)/(2*d*1000); return Math.atan(Math.hypot(gx,gz))*180/Math.PI; }
  function nearestRoute(x,z){ var best=0,bd=1e9; for(var i=0;i<NR;i++){ var d=(R.x[i]-x)*(R.x[i]-x)+(R.z[i]-z)*(R.z[i]-z); if(d<bd){bd=d;best=i;} } return {i:best,km:R.km[best],d:Math.sqrt(bd)}; }
  function webZoom(lat){ var mpp=1000/sc; return Math.max(3,Math.min(17,Math.round(Math.log2(156543.03*Math.cos(lat*Math.PI/180)/mpp)))); }
  function extLinks(lat,lon,z){ return {otm:'https://opentopomap.org/#marker='+z+'/'+lat.toFixed(5)+'/'+lon.toFixed(5),
    topo:'https://en-za.topographic-map.com/map-rn8dn/Drakensberg/?center='+lat.toFixed(5)+'%2C'+lon.toFixed(5)+'&zoom='+z,
    sat:'https://www.google.com/maps/@'+lat.toFixed(5)+','+lon.toFixed(5)+','+Math.round(156543.03*Math.cos(lat*Math.PI/180)/Math.pow(2,z)*800)+'m/data=!3m1!1e3'}; }
  function updateExt(){ var a=$('xOtm'); if(!a) return; var g=GEO(cx,cz), z=webZoom(g.lat), u=extLinks(g.lat,g.lon,z); a.href=u.otm; $('xTopo').href=u.topo; $('xSat').href=u.sat; }
  function naismith(dist,up){ var h=dist/4+up/600; return Math.floor(h)+' h '+String(Math.round((h%1)*60)).padStart(2,'0'); }
  function dayOfKm(km){ for(var i=0;i<bounds.length;i++) if(km<=bounds[i][1]+1e-6) return i+1; return bounds.length; }
  function coordStr(lat,lon){return Math.abs(lat).toFixed(5)+'° '+(lat<0?'S':'N')+', '+Math.abs(lon).toFixed(5)+'° '+(lon<0?'W':'E');}
  var TILES=!!window.DGT_CONFIG, base=(function(){ if(!TILES) return 'relief'; try{ return localStorage.getItem('dgt-base')||'otm'; }catch(e){ return 'otm'; } })(), tcache={}, tcount=0;
  function tileImg(z,x,y){ var k=z+'/'+x+'/'+y, t=tcache[k]; if(t) return t;
    if(tcount>500){ tcache={}; tcount=0; }
    var img=new Image(); t=tcache[k]={img:img,ok:false,bad:false}; tcount++;
    img.onload=function(){ t.ok=true; req(); }; img.onerror=function(){ t.bad=true; };
    img.src='https://'+'abc'.charAt((x+y)%3)+'.tile.opentopomap.org/'+k+'.png'; return t; }
  function drawTiles(){
    var p=D.proj, lat0=p.lat0, mpp0=156543.03*Math.cos(lat0*Math.PI/180), dp=window.devicePixelRatio||1;
    var z=Math.max(6,Math.min(17,Math.round(Math.log(sc*dp*mpp0/1000)/Math.LN2)));
    var a=toLL(wx(0),wz(0)), b=toLL(wx(W),wz(H));
    function tx(lon,n){ return Math.floor((lon+180)/360*n); }
    function ty(lat,n){ var r=lat*Math.PI/180; return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n); }
    function lonOf(x,n){ return x/n*360-180; } function latOf(y,n){ return Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI; }
    var n, x0,x1,y0,y1;
    for(;;){ n=Math.pow(2,z); x0=tx(a.lon,n); x1=tx(b.lon,n); y0=ty(a.lat,n); y1=ty(b.lat,n); if((x1-x0+1)*(y1-y0+1)<=48||z<=6) break; z--; }
    for(var y=y0;y<=y1;y++) for(var x=x0;x<=x1;x++){ var t=tileImg(z,x,y); if(!t.ok) continue;
      var lw=lonOf(x,n), le=lonOf(x+1,n), ln=latOf(y,n), ls=latOf(y+1,n);
      var X0=sx((lw-p.lon0)*p.kx), X1=sx((le-p.lon0)*p.kx), Y0=sy(-(ln-p.lat0)*p.ky), Y1=sy(-(ls-p.lat0)*p.ky);
      ctx.drawImage(t.img,X0,Y0,X1-X0+0.5,Y1-Y0+0.5); }
  }
  function setBase(v){ base=v; try{ localStorage.setItem('dgt-base',v); }catch(e){}
    var at=$('mattrib'); if(at) at.innerHTML=v==='otm'?'Map: © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA), data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, SRTM':'Terrain: Copernicus GLO-90 DEM (via Open-Meteo)';
    req(); }
  function sx(x){return (x-cx)*sc+W/2;} function sy(z){return (z-cz)*sc+H/2;}
  function wx(px){return (px-W/2)/sc+cx;} function wz(py){return (py-H/2)/sc+cz;}

  function markup(){
    return '<div class="rmap">'+
      '<div class="dchips" id="chips3" role="toolbar" aria-label="Choose a day"></div>'+
      '<div class="stage2"><div class="mapbox" id="mapbox"><canvas id="map2" tabindex="0" aria-label="Route map. Drag to move, scroll or pinch to zoom, plus and minus keys to zoom, arrow keys to move."></canvas>'+
        '<div class="mscale" id="mscale"></div>'+
        '<div class="mnorth" aria-hidden="true"><svg viewBox="-12 -12 24 24" width="22" height="22"><path d="M0,-9 L4,4 L0,1 L-4,4Z" fill="var(--sunset-gold)"/><text x="0" y="10" text-anchor="middle" font-size="6" fill="var(--ink)" font-family="JetBrains Mono,monospace">N</text></svg></div>'+
        '<div class="mhud"><div class="row"><button class="mb" id="mIn" aria-label="Zoom in">+</button><button class="mb" id="mOut" aria-label="Zoom out">−</button></div>'+
          '<button class="mb" id="mFit" aria-label="Whole route" title="Whole route"><i aria-hidden="true">◱</i><span class="t">Whole route</span></button><button class="mb" id="mLoc" aria-pressed="false" aria-label="Where am I" title="Show where you are (GPS)"><i aria-hidden="true">◎</i><span class="t">Where am I</span></button><button class="mb" id="mMeas" aria-pressed="false" aria-label="Measure" title="Measure distance and climb"><i aria-hidden="true">⟷</i><span class="t">Measure</span></button><button class="mb" id="mLay" aria-pressed="false" aria-label="Layers" title="Layers"><i aria-hidden="true">☰</i><span class="t">Layers</span></button><button class="mb" id="mFull" aria-pressed="false" aria-label="Full screen" title="Full screen"><i aria-hidden="true">⤢</i><span class="t">Full screen</span></button>'+
          '<div class="mlayers" id="mlayers" hidden>'+
            (TILES?'<fieldset class="mbase"><legend>Base map</legend><label><input type="radio" name="mbase" value="otm"'+(base==='otm'?' checked':'')+'> OpenTopoMap (needs a signal)</label><label><input type="radio" name="mbase" value="relief"'+(base!=='otm'?' checked':'')+'> Built-in relief (works offline)</label></fieldset>':'')+
            [['grade','linear-gradient(90deg,#4F9A55,#E5A13C,#A8281C)','Colour the trail by steepness',1],['sleep','var(--good)','Sleeping caves'],['no','var(--danger)','No-camping caves'],['water','var(--water)','Water points from the GPX'],['streams','var(--water)','Likely streams (worked out from the terrain)'],['bail','var(--danger)','Bail-out passes and rough way down'],['zones','var(--sunset-gold)','Daily camp zones'],['alts','var(--ink-muted)','Alternate variants'],['km','var(--ink)','Kilometre marks'],['labels','var(--ink)','Peak names'],['places','var(--ink-muted)','Towns, camps and lodges nearby']]
              .map(function(l){return '<label><input type="checkbox" data-layer="'+l[0]+'"'+(l[3]?'':' checked')+'><span class="sw" style="background:'+l[1]+'"></span>'+l[2]+'</label>';}).join('')+
            (window.DGT_CONFIG?'<div class="mext"><span>For your GPS app</span><a href="#" id="xGpx">Download GPX ↓</a></div>':'')+'<div class="mext"><span>Open this view in</span><a id="xOtm" target="_blank" rel="noopener">OpenTopoMap ↗</a><a id="xTopo" target="_blank" rel="noopener">topographic-map.com ↗</a><a id="xSat" target="_blank" rel="noopener">Satellite (Google Maps) ↗</a></div>'+
            '<div class="mleg"><span>Height</span><i></i><span class="ends"><b>1,000 m</b><b>2,000</b><b>3,000</b><b>3,500</b></span></div>'+
            '<div class="ln">Shaded relief and 100 m contours come from the Copernicus GLO-90 elevation model, sampled about every 600 m within 1.5 km of the route, every 1.2 km a little wider and every 3 km further out, plus the GPS elevations on the line. The surrounding Lesotho highlands and KZN foothills come from a coarser 5 km sample, for orientation only; town and lodge positions are approximate. The walk-in from Sentinel Car Park (2,540 m) and walk-out to Bushman\'s Nek (1,764 m) are pinned to their known heights. Good for reading the shape of each day; navigate with the 1:50,000 sheets and the GPX.</div></div></div>'+
        '<div class="mtip" id="mtip" hidden></div><div class="mgrade" id="mgrade" hidden>'+GRADE_CLS.map(function(c){return '<span><i style="background:'+c[1]+'"></i>'+c[2]+'</span>';}).join('')+'</div>'+
        '<div class="mmeas" id="mmeas" hidden></div>'+
        '<div class="mhint" id="mhint">Tap the map for height · tap the trail for details</div>'+
        '<div class="mpop" id="mpop" hidden></div><div class="mattrib" id="mattrib">Terrain: Copernicus GLO-90 DEM (via Open-Meteo)</div></div>'+
        '</div>'+
      '<div class="dprof"><canvas id="prof3" aria-label="Elevation profile. Tap or drag to move along the route."></canvas><div class="cap"><span id="pcur3">Tap or drag the profile to move along the route</span><span>Elevation from the GPX track</span></div></div>'+
      '<section class="dpanel" id="panel3" aria-live="polite"></section>'+
    '</div>';
  }

  /* ---- relief rasters: the detailed corridor grid, and a 1 km grid of the surroundings underneath it ---- */
  function decode(b64){ var raw=atob(b64),buf=new ArrayBuffer(raw.length),u8=new Uint8Array(buf); for(var i=0;i<raw.length;i++) u8[i]=raw.charCodeAt(i); return new Uint16Array(buf); }
  function raster(HM,NX,NZ,ST,F,zf,feather,fine){
    function h(i,j){ i=i<0?0:i>=NX?NX-1:i; j=j<0?0:j>=NZ?NZ-1:j; return HM[j*NX+i]; }
    var shade=new Float32Array(NX*NZ), az=315*Math.PI/180, alt=45*Math.PI/180, i, j;
    for(j=0;j<NZ;j++) for(i=0;i<NX;i++){
      var dzdx=(h(i+1,j)-h(i-1,j))/(2*ST*1000)*zf, dzdy=(h(i,j+1)-h(i,j-1))/(2*ST*1000)*zf;
      var slope=Math.atan(Math.hypot(dzdx,dzdy)), aspect=Math.atan2(dzdy,-dzdx);
      shade[j*NX+i]=Math.max(0,Math.cos(alt)*Math.cos(slope)+Math.sin(alt)*Math.sin(slope)*Math.cos((Math.PI/2-az)-aspect));
    }
    var stops=P.stops;
    function ramp(m){ for(var k=1;k<stops.length;k++){ if(m<=stops[k][0]){ var a=stops[k-1],b=stops[k],t=Math.max(0,(m-a[0])/(b[0]-a[0])); return [a[1][0]+(b[1][0]-a[1][0])*t,a[1][1]+(b[1][1]-a[1][1])*t,a[1][2]+(b[1][2]-a[1][2])*t]; } } return stops[stops.length-1][1]; }
    var RW=(NX-1)*F+1, RH=(NZ-1)*F+1, c=document.createElement('canvas'); c.width=RW; c.height=RH;
    var g=c.getContext('2d'), img=g.createImageData(RW,RH), d=img.data;
    for(var py=0;py<RH;py++){ var v=py/F, jj=Math.min(NZ-2,Math.floor(v)), fv=v-jj;
      for(var px=0;px<RW;px++){ var u=px/F, ii=Math.min(NX-2,Math.floor(u)), fu=u-ii;
        var k00=jj*NX+ii,k10=k00+1,k01=k00+NX,k11=k01+1;
        var m=HM[k00]*(1-fu)*(1-fv)+HM[k10]*fu*(1-fv)+HM[k01]*(1-fu)*fv+HM[k11]*fu*fv;
        var sh=shade[k00]*(1-fu)*(1-fv)+shade[k10]*fu*(1-fv)+shade[k01]*(1-fu)*fv+shade[k11]*fu*fv;
        var col=ramp(m), f=P.shade[0]+P.shade[1]*sh, o=(py*RW+px)*4;
        d[o]=Math.min(255,col[0]*f); d[o+1]=Math.min(255,col[1]*f); d[o+2]=Math.min(255,col[2]*f);
        d[o+3]=feather?Math.round(255*Math.min(1,Math.min(px,py,RW-1-px,RH-1-py)/feather)):255; } }
    g.putImageData(img,0,0);
    function contour(level,style,width){
      g.beginPath();
      for(var j=0;j<NZ-1;j++) for(var i=0;i<NX-1;i++){
        var a=HM[j*NX+i],b=HM[j*NX+i+1],c2=HM[(j+1)*NX+i+1],d2=HM[(j+1)*NX+i];
        var idx=(a>level?8:0)|(b>level?4:0)|(c2>level?2:0)|(d2>level?1:0); if(idx===0||idx===15) continue;
        function lerp(p,q){return (level-p)/(q-p);}
        var T=[(i+lerp(a,b))*F,j*F], Rr=[(i+1)*F,(j+lerp(b,c2))*F], B=[(i+lerp(d2,c2))*F,(j+1)*F], Lf=[i*F,(j+lerp(a,d2))*F];
        var segs={1:[[Lf,B]],2:[[B,Rr]],3:[[Lf,Rr]],4:[[T,Rr]],5:[[Lf,T],[B,Rr]],6:[[T,B]],7:[[Lf,T]],8:[[Lf,T]],9:[[T,B]],10:[[T,Rr],[Lf,B]],11:[[T,Rr]],12:[[Lf,Rr]],13:[[B,Rr]],14:[[Lf,B]]}[idx];
        segs.forEach(function(s){ g.moveTo(s[0][0],s[0][1]); g.lineTo(s[1][0],s[1][1]); });
      }
      g.strokeStyle=style; g.lineWidth=width; g.stroke();
    }
    if(fine){ for(var lv=1100;lv<=3500;lv+=100){ if(lv%500) contour(lv,P.c100,0.8); } }
    for(lv=500;lv<=3500;lv+=500) contour(lv,P.c500,fine?1.4:1);
    return c;
  }
  function buildRelief(){
    P=mapPal(); DEM=decode(G.h); relief=raster(DEM,NX,NZ,ST,F,2.2,14,true);
    if(OG){ try{ ODEM=decode(OG.h); outerRelief=raster(ODEM,OG.nx,OG.nz,OG.step,3,3.2,0,false); }catch(e){ outerRelief=null; } }
  }

  /* ---- drawing ---- */
  function req(){ if(!need){ need=true; requestAnimationFrame(draw); } }
  function line(xs,zs,from,to){ ctx.beginPath(); var f=true; for(var i=from;i<=to;i++){ var X=sx(xs[i]),Y=sy(zs[i]); if(f){ctx.moveTo(X,Y);f=false;} else ctx.lineTo(X,Y);} }
  function idxRange(a,b){ var i0=idxAtKm(a), i1=idxAtKm(b); return [Math.max(0,i0),Math.min(NR-1,i1)]; }
  var boxes=[];
  var queue=[];
  function label(text,x,y,font,color,align,pri){ queue.push([pri==null?5:pri,text,x,y,font,color,align]); }
  function flushLabels(){ queue.sort(function(a,b){return a[0]-b[0];}); queue.forEach(function(q){ place(q[1],q[2],q[3],q[4],q[5],q[6]); }); queue=[]; }
  function place(text,x,y,font,color,align){ ctx.font=font; var w=ctx.measureText(text).width, h=14, x0=align==='center'?x-w/2:x, b=[x0-2,y-h/2-1,x0+w+2,y+h/2+1];
    for(var i=0;i<boxes.length;i++){ var q=boxes[i]; if(b[0]<q[2]&&b[2]>q[0]&&b[1]<q[3]&&b[3]>q[1]) return false; }
    if(b[2]<0||b[0]>W||b[3]<0||b[1]>H) return false; boxes.push(b); halo(text,x,y,font,color,align); return true; }
  function halo(text,x,y,font,color,align){ ctx.font=font; ctx.textAlign=align||'left'; ctx.textBaseline='middle'; ctx.lineWidth=3.5; ctx.strokeStyle=P.halo; ctx.strokeText(text,x,y); ctx.fillStyle=color; ctx.fillText(text,x,y); }
  function drawRegions(){ if(sc>14) return; ctx.save(); ctx.globalAlpha=sc>8?0.45:0.7; D.places.forEach(function(p){ if(p.c!=='region') return; var X=sx(p.x),Y=sy(p.z);
      ctx.font='600 '+(sc<3?13:15)+'px Oswald,"Arial Narrow",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; var t=p.n.split('').join(' ');
      ctx.lineWidth=3; ctx.strokeStyle=P.halo; ctx.strokeText(t,X,Y); ctx.fillStyle=P.muted; ctx.fillText(t,X,Y); }); ctx.restore(); }
  function drawMe(){ if(!me) return; var X=sx(me.x),Y=sy(me.z), r=Math.max(8,me.acc/1000*sc);
    ctx.beginPath(); ctx.arc(X,Y,r,0,7); ctx.fillStyle=P.dark?'rgba(111,168,214,.18)':'rgba(47,110,158,.16)'; ctx.fill(); ctx.lineWidth=1; ctx.strokeStyle=P.water; ctx.stroke();
    ctx.beginPath(); ctx.arc(X,Y,7,0,7); ctx.fillStyle=P.water; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle='#fff'; ctx.stroke(); }
  function draw(){
    need=false; if(!ctx||!W) return; boxes=[]; queue=[];
    ctx.setTransform(dpr,0,0,dpr,0,0); if(!P) P=mapPal(); ctx.fillStyle=P.ground; ctx.fillRect(0,0,W,H);
    ctx.imageSmoothingEnabled=true;
    if(outerRelief) ctx.drawImage(outerRelief,sx(OG.x0),sy(OG.z0),(OG.nx-1)*OG.step*sc,(OG.nz-1)*OG.step*sc);
    if(relief) ctx.drawImage(relief,sx(G.x0),sy(G.z0),(NX-1)*ST*sc,(NZ-1)*ST*sc);
    if(base==='otm') drawTiles();
    if(layers.places&&D.places&&base!=='otm') drawRegions();
    ctx.lineJoin='round'; ctx.lineCap='round';
    if(layers.alts){ ctx.setLineDash([6,5]); Object.keys(D.alts).forEach(function(k){ var a=D.alts[k]; line(a.x,a.z,0,a.x.length-1); ctx.strokeStyle=P.alt; ctx.lineWidth=2; ctx.stroke(); }); ctx.setLineDash([]); }
    if(layers.zones){ zones.forEach(function(z){ if(z.day===days.length) return; ctx.beginPath(); ctx.arc(sx(z.x),sy(z.z),z.r*sc,0,7);
      ctx.fillStyle=sel===z.day?P.zoneSel:P.zoneFill; ctx.fill(); ctx.setLineDash([5,4]); ctx.strokeStyle=sel===z.day?P.accent:P.zoneLine; ctx.lineWidth=sel===z.day?2:1.4; ctx.stroke(); ctx.setLineDash([]); }); }
    // route casing then days
    line(R.x,R.z,0,NR-1); ctx.strokeStyle=P.casing; ctx.lineWidth=8; ctx.stroke();
    if(layers.grade){ ctx.lineWidth=sc>=20?5:4; for(var gi=1;gi<NR;gi++){ ctx.beginPath(); ctx.moveTo(sx(R.x[gi-1]),sy(R.z[gi-1])); ctx.lineTo(sx(R.x[gi]),sy(R.z[gi])); ctx.strokeStyle=gradeCol(GRADE[gi]); ctx.stroke(); }
      if(sel){ var rr=idxRange(bounds[sel-1][0],bounds[sel-1][1]); ctx.save(); ctx.globalAlpha=.9; ctx.setLineDash([2,6]); line(R.x,R.z,rr[0],rr[1]); ctx.strokeStyle=P.ink; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore(); } }
    else bounds.forEach(function(ab,i){ var r=idxRange(ab[0],ab[1]); line(R.x,R.z,r[0],r[1]);
      ctx.strokeStyle=(sel===0||sel===i+1)?P.route:P.routeDim; ctx.lineWidth=sel===i+1?5:4; ctx.setLineDash(sel===i+1?[]:[14,10]); ctx.stroke(); ctx.setLineDash([]); });
    // day boundaries
    bounds.forEach(function(ab,i){ if(i===bounds.length-1) return; var k=idxAtKm(ab[1]); ctx.beginPath(); ctx.arc(sx(R.x[k]),sy(R.z[k]),5,0,7); ctx.fillStyle=P.camp; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=P.campRing; ctx.stroke(); });
    if(layers.km&&sc>=5){ var step=sc>=25?5:10; for(var km=step;km<D.total;km+=step){ var k=idxAtKm(km), X=sx(R.x[k]), Y=sy(R.z[k]); if(X<-20||Y<-20||X>W+20||Y>H+20) continue; label(String(km),X+7,Y-7,'600 10px "JetBrains Mono",monospace',P.muted,null,4); } }
    // bail-out passes: rough way down (dashed) and a marker at the top
    if(layers.bail&&D.bail){ ctx.save(); D.bail.forEach(function(b){ var p=b.path; ctx.setLineDash([7,5]); line(p.x,p.z,0,p.x.length-1); ctx.strokeStyle=P.casing; ctx.lineWidth=5; ctx.stroke(); ctx.strokeStyle=P.bail; ctx.lineWidth=2.5; ctx.stroke(); ctx.setLineDash([]);
        var ex=sx(p.x[p.x.length-1]), ez=sy(p.z[p.z.length-1]); ctx.beginPath(); ctx.arc(ex,ez,3.5,0,7); ctx.fillStyle=P.bail; ctx.fill(); }); ctx.restore(); }
    // points
    function dot(x,z,r,fill){ var X=sx(x),Y=sy(z); if(X<-10||Y<-10||X>W+10||Y>H+10) return; ctx.beginPath(); ctx.arc(X,Y,r,0,7); ctx.fillStyle=fill; ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle=P.dotRing; ctx.stroke(); }
    var cr=sc>=20?5:sc>=8?4:3;
    if(layers.no) D.caves.forEach(function(c){ if(c.s==='no_camp') dot(c.x,c.z,cr,P.no); });
    if(layers.sleep) D.caves.forEach(function(c){ if(c.s!=='no_camp') dot(c.x,c.z,cr,P.sleep); });
    if(layers.streams&&D.streams) D.streams.forEach(function(w){ var X=sx(w.x),Y=sy(w.z); if(X<-10||Y<-10||X>W+10||Y>H+10) return; ctx.beginPath(); ctx.arc(X,Y,Math.max(3,cr-0.5),0,7); ctx.fillStyle=P.dotRing; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=P.water; ctx.stroke(); });
    if(layers.water) D.pois.forEach(function(p){ if(p.c==='water') dot(p.x,p.z,cr+1,P.water); });
    if(sc>=28&&(layers.sleep||layers.no)) D.caves.forEach(function(c){ if((c.s==='no_camp'&&!layers.no)||(c.s!=='no_camp'&&!layers.sleep)) return; var X=sx(c.x),Y=sy(c.z); if(X<0||Y<0||X>W||Y>H) return; label(c.n,X+8,Y,'11px Inter,sans-serif',P.ink,null,6); });
    D.pois.forEach(function(p){ if(p.c==='water') return; var X=sx(p.x),Y=sy(p.z); if(X<-20||Y<-20||X>W+20||Y>H+20) return;
      if(p.c==='peak'){ ctx.beginPath(); ctx.moveTo(X,Y-8); ctx.lineTo(X+7,Y+5); ctx.lineTo(X-7,Y+5); ctx.closePath(); ctx.fillStyle=P.ink; ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle=P.dotRing; ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(X,Y,7,0,7); ctx.fillStyle=P.route; ctx.fill(); ctx.lineWidth=2.5; ctx.strokeStyle=P.dotRing; ctx.stroke(); }
      if(layers.labels) label(p.n,X+10,Y-2,'600 12px Inter,sans-serif',P.ink,null,p.c==='peak'?1:0); });
    if(layers.bail&&D.bail) D.bail.forEach(function(b){ var X=sx(b.x),Y=sy(b.z); if(X<-20||Y<-20||X>W+20||Y>H+20) return; ctx.beginPath(); ctx.moveTo(X-7,Y-6); ctx.lineTo(X+7,Y-6); ctx.lineTo(X,Y+7); ctx.closePath(); ctx.fillStyle=P.bail; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=P.dotRing; ctx.stroke();
      if(sc>=6) label(b.n.replace(' (approx.)',''),X+10,Y-2,'600 11px Inter,sans-serif',P.bailText,null,1); });
    if(layers.zones&&sc>=4) zones.forEach(function(z){ if(z.day===days.length) return; label('D'+z.day+' camp',sx(z.x),sy(z.z)-z.r*sc-8,'600 11px "JetBrains Mono",monospace',sel===z.day?P.accent:P.muted,'center',sel===z.day?0:2); });
    if(layers.places&&D.places&&sc>=2.2) D.places.forEach(function(p){ if(p.c==='region') return; var X=sx(p.x),Y=sy(p.z); if(X<-40||Y<-20||X>W+40||Y>H+20) return;
      ctx.beginPath(); if(p.c==='town') ctx.rect(X-3.5,Y-3.5,7,7); else ctx.arc(X,Y,3.5,0,7); ctx.fillStyle=p.c==='town'?P.ink:P.dotRing; ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle=p.c==='town'?P.dotRing:P.ink; ctx.stroke();
      label(p.n,X+8,Y,(p.c==='town'?'600 ':'')+'11px Inter,sans-serif',P.muted,null,7); });
    flushLabels();
    drawMe();
    if(cursorKm!=null){ var ci=idxAtKm(cursorKm), CX=sx(R.x[ci]), CY=sy(R.z[ci]); ctx.beginPath(); ctx.arc(CX,CY,9,0,7); ctx.fillStyle=P.dark?'rgba(239,230,208,.25)':'rgba(34,35,36,.25)'; ctx.fill(); ctx.beginPath(); ctx.arc(CX,CY,5,0,7); ctx.fillStyle=P.ink; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=P.dotRing; ctx.stroke(); }
    if(hoverKm!=null&&hoverKm!==cursorKm){ var hi=idxAtKm(hoverKm); ctx.beginPath(); ctx.arc(sx(R.x[hi]),sy(R.z[hi]),5,0,7); ctx.fillStyle=P.dotRing; ctx.fill(); ctx.lineWidth=2.5; ctx.strokeStyle=P.ink; ctx.stroke(); }
    if(probe){ var PX=sx(probe.x),PY=sy(probe.z); ctx.beginPath(); ctx.moveTo(PX,PY); ctx.lineTo(PX-7,PY-16); ctx.arc(PX,PY-20,7.5,Math.PI*0.8,Math.PI*0.2); ctx.closePath(); ctx.fillStyle=P.ink; ctx.fill(); ctx.beginPath(); ctx.arc(PX,PY-20,3,0,7); ctx.fillStyle=P.dotRing; ctx.fill(); }
    if(mpts.length){ ctx.save(); ctx.setLineDash([7,5]); ctx.lineWidth=2.5; ctx.strokeStyle=P.ink; ctx.beginPath(); mpts.forEach(function(m,i){ var X=sx(m.x),Y=sy(m.z); if(i) ctx.lineTo(X,Y); else ctx.moveTo(X,Y); }); ctx.stroke(); ctx.restore();
      mpts.forEach(function(m,i){ var X=sx(m.x),Y=sy(m.z); ctx.beginPath(); ctx.arc(X,Y,8,0,7); ctx.fillStyle=m.km!=null?P.camp:P.ink; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=P.dotRing; ctx.stroke(); ctx.fillStyle=m.km!=null?'#222324':P.dotRing; ctx.font='600 10px "JetBrains Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(i+1),X,Y+0.5); }); }
    updateExt();
    // scale bar
    var target=110/sc, pow=Math.pow(10,Math.floor(Math.log10(target))), nice=[1,2,5,10].map(function(m){return m*pow;}).filter(function(v){return v<=target;}).pop()||pow;
    $('mscale').innerHTML=(nice>=1?fmt(nice)+' km':fmt(nice*1000)+' m')+'<i style="width:'+(nice*sc).toFixed(0)+'px"></i>';
  }

  /* ---- view control ---- */
  var anim=null;
  var userMoved=false, RB=null;
  function routeBox(){ if(!RB) RB={x0:Math.min.apply(null,R.x),x1:Math.max.apply(null,R.x),z0:Math.min.apply(null,R.z),z1:Math.max.apply(null,R.z)}; return RB; }
  function minScale(){ if(OG) return Math.max(W/(OG.nx*OG.step),H/(OG.nz*OG.step))*1.01; var b=routeBox(); return Math.min((W-40)/(b.x1-b.x0),(H-40)/(b.z1-b.z0))*0.9; }
  function coverAxis(c,lo,hi,view){ return hi-lo<=view?(lo+hi)/2:Math.max(lo+view/2,Math.min(hi-view/2,c)); }
  function clampS(s){ return Math.max(minScale(),Math.min(220,s)); }
  function clampAxis(c,lo,hi,view){ var half=view/2, pad=view*0.15;
    if(hi-lo<=view-2*pad){ var mid=(lo+hi)/2, slack=(view-2*pad-(hi-lo))/2; return Math.max(mid-slack,Math.min(mid+slack,c)); }
    return Math.max(lo+half-pad,Math.min(hi-half+pad,c)); }
  function clampC(){ var b=routeBox(); cx=clampAxis(cx,b.x0,b.x1,W/sc); cz=clampAxis(cz,b.z0,b.z1,H/sc);
    if(OG){ var hs=OG.step/2; cx=coverAxis(cx,OG.x0-hs,OG.x0+(OG.nx-1)*OG.step+hs,W/sc); cz=coverAxis(cz,OG.z0-hs,OG.z0+(OG.nz-1)*OG.step+hs,H/sc); } }
  function setView(x,z,s,ms){
    s=clampS(s);
    if(!ms||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)){ cx=x; cz=z; sc=s; clampC(); req(); return; }
    var a={x:cx,z:cz,s:sc}, t0=performance.now(); anim=true;
    (function step(now){ if(anim!==true) return; var t=Math.min(1,(now-t0)/ms), e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
      cx=a.x+(x-a.x)*e; cz=a.z+(z-a.z)*e; sc=Math.exp(Math.log(a.s)+(Math.log(s)-Math.log(a.s))*e); draw(); if(t<1) requestAnimationFrame(step); else anim=null; })(t0);
  }
  function fitBox(x0,x1,z0,z1,ms){ userMoved=false; var pad=40, s=Math.min((W-pad*2)/Math.max(0.5,x1-x0),(H-pad*2)/Math.max(0.5,z1-z0)); setView((x0+x1)/2,(z0+z1)/2,s,ms); }
  function fitAll(ms){ fitBox(Math.min.apply(null,R.x),Math.max.apply(null,R.x),Math.min.apply(null,R.z),Math.max.apply(null,R.z),ms); }
  function fitDay(n,ms){ var r=idxRange(bounds[n-1][0],bounds[n-1][1]),x0=1e9,x1=-1e9,z0=1e9,z1=-1e9; for(var i=r[0];i<=r[1];i++){ x0=Math.min(x0,R.x[i]);x1=Math.max(x1,R.x[i]);z0=Math.min(z0,R.z[i]);z1=Math.max(z1,R.z[i]); } var z=zones[n-1]; if(z){ x0=Math.min(x0,z.x-z.r);x1=Math.max(x1,z.x+z.r);z0=Math.min(z0,z.z-z.r);z1=Math.max(z1,z.z+z.r);} fitBox(x0,x1,z0,z1,ms); }
  function zoomAt(px,py,f){ var x=wx(px),z=wz(py), ns=clampS(sc*f); cx=x-(px-W/2)/ns; cz=z-(py-H/2)/ns; sc=ns; anim=null; userMoved=true; clampC(); req(); }
  function resize(){ var r=cv.getBoundingClientRect(); if(!r.width) return; var first=!W; W=r.width; H=r.height; dpr=Math.min(window.devicePixelRatio||1,2); cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); if(first||!userMoved){ if(sel) fitDay(sel,0); else fitAll(0); } else { sc=clampS(sc); clampC(); req(); } }

  /* ---- panel, popups, profile ---- */
  var sleepCaves=D.caves.filter(function(c){return c.s==='sleep';});
  function nearCaves(a,b){return sleepCaves.filter(function(c){return c.km>=a-0.5&&c.km<=b+0.5&&c.off<=1500;}).sort(function(x,y){return x.km-y.km;});}
  function kindLabel(k,last){ return last?'Finish':{zone:'Camp area',cave:'Sleeping cave',wild:'Wild camp',finish:'Finish'}[k]||'Camp'; }
  function guideParas(gi){ var d=D.days[gi];
    return d.text.split(/\n\n+/).map(function(t){return '<p>'+esc(t.trim())+'</p>';}).join('')+
      ((d.markers||'')?'<h4>Markers to look out for</h4><ul class="marks3">'+d.markers.split(' · ').filter(Boolean).map(function(m){return '<li>'+esc(m)+'</li>';}).join('')+'</ul>':''); }
  function renderPanel(){
    var p=$('panel3'); if(!p) return; var st=PLAN.stages, n=st.length;
    if(sel===0){
      p.innerHTML='<div class="dno">The whole route, '+n+'-day plan</div><h2>'+(n===11?'Eleven':n)+' days along the roof of southern Africa</h2>'+
        '<p>'+(PLAN.original?'Camps follow the route guide.':'Camps are chosen to even out each day\'s effort, preferring known camp areas and sleeping caves. Each day includes the route-guide text for that stretch.')+' Pick a day to zoom to it.</p><h4>Days</h4>'+
        st.map(function(s,i){return '<button class="dayrow3" data-day="'+(i+1)+'"><span class="n">'+String(i+1).padStart(2,'0')+'</span><span class="t">'+esc(PLAN.original?D.days[i].title:s.title)+(TS()?'<small>'+esc(short(stageDate(i)))+'</small>':'')+'</span><span class="d">'+fmt(s.dist,1)+' km, +'+fmt(s.up)+' m</span></button>';}).join('');
      p.innerHTML='<div class="dp-ov">'+p.innerHTML+'</div>';
    } else {
      var s=st[sel-1], z=zones[sel-1], last=sel===n, c=s.camp;
      var water=D.pois.filter(function(w){return w.c==='water'&&w.km>=s.from-0.1&&w.km<=s.to+0.1;});
      var cvs=nearCaves(s.from,s.to), body;
      var facts='', guide='';
      if(PLAN.original){ facts='<h4>Peaks and checkpoints</h4><p>'+esc(D.days[sel-1].high)+'</p>'; guide='<h4>The route guide</h4>'+guideParas(sel-1); }
      else {
        var peaks=D.pois.filter(function(q){return q.c!=='water'&&q.km>=s.from-0.1&&q.km<=s.to+0.1;}).map(function(q){return q.n+' (km '+fmt(q.km,1)+')';});
        facts='<h4>Peaks and checkpoints</h4><p>'+(peaks.length?esc(peaks.join(', ')):'None on this stretch.')+'</p>';
        guide='<h4>The route guide</h4><p class="dp-lead">This day covers parts of guide '+(s.guide.length>1?'days ':'day ')+s.guide.map(function(g){return g+1;}).join(' and ')+'. Read the stretch between km '+fmt(s.from,1)+' and km '+fmt(s.to,1)+'.</p>'+
          s.guide.map(function(gi){var g=D.dstats[gi];return '<details class="gd" open><summary>Guide day '+(gi+1)+': '+esc(D.days[gi].title)+' <i>km '+fmt(g.from,1)+'–'+fmt(g.to,1)+'</i></summary>'+guideParas(gi)+'</details>';}).join('');
      }
      p.innerHTML='<div class="dno">Day '+sel+' of '+n+(TS()?', '+esc(short(stageDate(sel-1))):'')+', km '+fmt(s.from,1)+'–'+fmt(s.to,1)+'</div><h2>'+esc(PLAN.original?D.days[sel-1].title:s.title)+'</h2>'+
        '<div class="dp-grid"><div class="dp-facts"><div class="kv3"><div><span>Distance</span><b>'+fmt(s.dist,1)+' km</b></div><div><span>Ascent</span><b>'+fmt(s.up)+' m</b></div><div><span>Descent</span><b>'+fmt(s.down)+' m</b></div><div><span>High</span><b>'+fmt(s.max)+' m</b></div></div>'+
        '<div class="camp3"><b>'+kindLabel(c.kind,last)+': '+esc(c.name)+'</b> · '+esc(z.range)+(!last&&PLAN.original?' · ±'+z.r+' km':'')+'<br>'+esc(c.note||'')+'</div>'+facts+
        (water.length?'<h4>Water points on the line</h4><ul class="marks3 water">'+water.map(function(w){return '<li>'+esc(w.n)+', km '+fmt(w.km,1)+'</li>';}).join('')+'</ul>':'')+
        (function(){ var st=(D.streams||[]).filter(function(w){return w.km>=s.from-0.1&&w.km<=s.to+0.1;}); return st.length?'<h4>Likely streams (from the terrain)</h4><p>'+st.map(function(w){return 'km '+fmt(w.km,1)+(w.a>=3?' (bigger)':'');}).join(', ')+'. Small ones can be a trickle; check the Slingsby map.</p>':''; })()+
        (cvs.length?'<h4>Sleeping caves within 1.5 km of the line</h4><div>'+cvs.map(function(v){return '<button class="cv3" data-cave="'+esc(v.n)+'"><span>'+esc(v.n)+'</span><i>km '+fmt(v.km,1)+', '+v.off+' m off the line, sleeps '+esc(v.cap||'?')+'</i></button>';}).join('')+'</div>':'')+
        '<div class="dnav"><button class="btn" data-day="'+(sel-1)+'">'+(sel===1?'Whole route':'Day '+(sel-1))+'</button>'+(!last?'<button class="btn" data-day="'+(sel+1)+'">Day '+(sel+1)+'</button>':'')+'</div></div>'+
        '<div class="dp-guide">'+guide+'</div></div>';
    }
    p.scrollTop=0;
  }
  function showPop(html){ var hn=$('mhint'); if(hn&&!measuring) hn.hidden=true; var c=$('mpop'); c.innerHTML='<button class="x" aria-label="Close">×</button>'+html; c.hidden=false; }
  function coordRow(lat,lon){ var u=extLinks(lat,lon,15); return '<div class="coords"><span>'+coordStr(lat,lon)+'</span><button class="mini" data-copy="'+lat.toFixed(5)+', '+lon.toFixed(5)+'">Copy</button></div>'+
    '<div class="xl"><a href="'+u.otm+'" target="_blank" rel="noopener">OpenTopoMap ↗</a><a href="'+u.topo+'" target="_blank" rel="noopener">Topo map ↗</a><a href="'+u.sat+'" target="_blank" rel="noopener">Satellite ↗</a></div>';}
  function showCave(c){ var st=c.s==='sleep'?'Sleeping cave':c.s==='no_camp'?'No camping':'Unverified';
    showPop('<h3>'+esc(c.n)+'</h3><div class="meta">'+st+(c.e?' · '+fmt(c.e)+' m':'')+' · km '+fmt(c.km,1)+' · '+(c.off<1000?c.off+' m':fmt(c.off/1000,1)+' km')+' off route</div>'+(c.cap?'<p>Capacity: '+esc(c.cap)+'</p>':'')+(c.note?'<p>'+esc(c.note)+'</p>':'')+coordRow(c.lat,c.lon)); }
  function showStream(w){ var ll=toLL(w.x,w.z);
    showPop('<h3>Likely stream</h3><div class="meta">km '+fmt(w.km,1)+' · Day '+dayOfKm(w.km)+'</div><p>Worked out from the terrain: about '+fmt(w.a,1)+' km² drains to this point on the line. '+(w.a>=3?'A stream this size usually runs in March.':'Small: in March it is usually a trickle, and can be dry after a dry spell.')+' Check it on the Slingsby map and fill up at the bigger ones.</p>'+coordRow(ll.lat,ll.lon)); }
  function showPoi(p){ var t={peak:'Peak / checkpoint',water:'Water point',start:'Start',finish:'Finish'}[p.c]||''; showPop('<h3>'+esc(p.n)+'</h3><div class="meta">'+t+' · km '+fmt(p.km,1)+' · Day '+dayOfKm(p.km)+'</div>'+coordRow(p.lat,p.lon)); }
  function showBail(b){ showPop('<h3>'+esc(b.n)+'</h3><div class="meta">Bail-out · km '+fmt(b.km,0)+' · Day '+dayOfKm(b.km)+' · top about '+fmt(b.e)+' m</div><p>'+esc(b.note)+'</p>'+
      '<p>Rough way down: about '+fmt(b.len,1)+' km to around '+fmt(b.end)+' m on the KZN side. This line is worked out from the terrain, not a mapped path: follow the pass on the Slingsby map and check where it comes out and how you get a lift from there.</p>'+coordRow(b.lat,b.lon)); }
  function showZone(z){ showPop('<h3>Day '+z.day+' camp: '+esc(z.t)+'</h3><div class="meta">'+esc(z.range)+' · ±'+z.r+' km'+(TS()?' · night of '+esc(short(stageDate(z.day-1))):'')+'</div><p>'+esc(z.note)+'</p>'+coordRow(z.lat,z.lon)); }
  function hitTest(px,py){
    var best=null,bd=14;
    function test(x,z,o){ var d=Math.hypot(sx(x)-px,sy(z)-py); if(d<bd){bd=d;best=o;} }
    D.pois.forEach(function(p){ if(p.c==='water'&&!layers.water) return; test(p.x,p.z,{k:'poi',o:p}); });
    D.caves.forEach(function(c){ if(c.s==='no_camp'?!layers.no:!layers.sleep) return; test(c.x,c.z,{k:'cave',o:c}); });
    if(layers.bail&&D.bail) D.bail.forEach(function(b){ test(b.x,b.z,{k:'bail',o:b}); });
    if(layers.streams&&D.streams) D.streams.forEach(function(w){ test(w.x,w.z,{k:'stream',o:w}); });
    if(best) return best;
    if(layers.zones){ var x=wx(px),z=wz(py); var zz=zones.filter(function(z2){return z2.day<days.length&&Math.hypot(x-z2.x,z-z2.z)<=z2.r;}); if(zz.length) return {k:'zone',o:zz[0]}; }
    return null;
  }

  var pc,pctx,PW=0,PH=0,PAD={l:44,r:10,t:16,b:20},eMin=2400,eMax=3600;
  function px(km){return PAD.l+km/D.total*(PW-PAD.l-PAD.r);}
  function py(e){return PAD.t+(1-(e-eMin)/(eMax-eMin))*(PH-PAD.t-PAD.b);}
  function cssv(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}
  function sizeProfile(){ if(!pc) return; var r=pc.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,2); if(!r.width) return; PW=r.width; PH=r.height; pc.width=Math.round(PW*d); pc.height=Math.round(PH*d); pctx.setTransform(d,0,0,d,0,0); drawProfile(); }
  function idxAtKm(km){var lo=0,hi=NR-1;while(lo<hi){var m=(lo+hi)>>1;if(R.km[m]<km)lo=m+1;else hi=m;}return lo;}
  function drawProfile(){
    if(!PW) return; var g=pctx; g.clearRect(0,0,PW,PH);
    var acc=cssv('--ember'),line=cssv('--line'),f3=cssv('--faint'),ink=cssv('--ink'),soft=cssv('--accent-soft');
    g.font='10px "JetBrains Mono", monospace'; g.textBaseline='middle';
    for(var e=2600;e<=3400;e+=400){ g.strokeStyle=line; g.lineWidth=1; g.beginPath(); g.moveTo(PAD.l,py(e)); g.lineTo(PW-PAD.r,py(e)); g.stroke(); g.fillStyle=f3; g.textAlign='right'; g.fillText(fmt(e)+' m',PAD.l-5,py(e)); }
    bounds.forEach(function(ab,i){ if(sel===i+1){ g.fillStyle=soft; g.fillRect(px(ab[0]),PAD.t,px(ab[1])-px(ab[0]),PH-PAD.t-PAD.b); }
      g.strokeStyle=line; g.beginPath(); g.moveTo(px(ab[1]),PAD.t); g.lineTo(px(ab[1]),PH-PAD.b); g.stroke();
      g.fillStyle=sel===i+1?ink:f3; g.textAlign='center'; g.fillText(String(i+1),(px(ab[0])+px(ab[1]))/2,PH-PAD.b+10); });
    g.beginPath(); g.moveTo(px(0),py(eMin)); for(var i=0;i<NR;i+=2) g.lineTo(px(R.km[i]),py(R.e[i])); g.lineTo(px(D.total),py(eMin)); g.closePath(); g.globalAlpha=.22; g.fillStyle=acc; g.fill(); g.globalAlpha=1;
    g.beginPath(); for(i=0;i<NR;i+=2){ var X=px(R.km[i]),Y=py(R.e[i]); if(i) g.lineTo(X,Y); else g.moveTo(X,Y);} g.strokeStyle=acc; g.lineWidth=sel?1.2:2; g.stroke();
    if(sel){ var ab=bounds[sel-1],f=true; g.beginPath(); for(i=0;i<NR;i++){ if(R.km[i]<ab[0]||R.km[i]>ab[1]) continue; var X2=px(R.km[i]),Y2=py(R.e[i]); if(f){g.moveTo(X2,Y2);f=false;} else g.lineTo(X2,Y2);} g.strokeStyle=acc; g.lineWidth=2.5; g.stroke(); }
    D.pois.filter(function(p){return p.c==='peak';}).forEach(function(p){ var X=px(p.km); g.fillStyle=f3; g.beginPath(); g.moveTo(X,PAD.t+1); g.lineTo(X-4,PAD.t-6); g.lineTo(X+4,PAD.t-6); g.closePath(); g.fill(); });
    if(cursorKm!=null){ var ci=idxAtKm(cursorKm),CX=px(cursorKm),CY=py(R.e[ci]); g.strokeStyle=ink; g.lineWidth=1; g.setLineDash([3,3]); g.beginPath(); g.moveTo(CX,PAD.t); g.lineTo(CX,PH-PAD.b); g.stroke(); g.setLineDash([]); g.fillStyle=ink; g.beginPath(); g.arc(CX,CY,4,0,7); g.fill(); }
  }
  function setCursor(km){
    cursorKm=Math.max(0,Math.min(D.total,km)); var i=idxAtKm(cursorKm);
    $('pcur3').innerHTML='<b>km '+fmt(cursorKm,1)+'</b> · '+fmt(R.e[i])+' m · Day '+dayOfKm(cursorKm);
    drawProfile(); var X=sx(R.x[i]),Y=sy(R.z[i]); if(X<30||Y<30||X>W-30||Y>H-30){ cx=R.x[i]; cz=R.z[i]; } req();
  }
  function selectDay(n,fly){
    sel=Math.max(0,Math.min(days.length,n));
    document.querySelectorAll('.dchip').forEach(function(c){c.setAttribute('aria-pressed',String(+c.dataset.day===sel));});
    renderPanel(); drawProfile(); $('mpop').hidden=true; probe=null;
    var h=sel?'#day-'+sel:'#route'; if(location.hash!==h){ try{ history.replaceState(null,'',h); }catch(_){} }
    if(fly&&W){ if(sel) fitDay(sel,650); else fitAll(650); } else req();
    var chip=document.querySelector('.dchip[data-day="'+sel+'"]'); if(chip){ var cs=chip.parentNode; cs.scrollLeft=chip.offsetLeft-cs.offsetLeft-(cs.clientWidth-chip.offsetWidth)/2; }
  }

  function routeInfo(km){
    var i=idxAtKm(km), g=GRADE[i], d=dayOfKm(km);
    var nextW=D.pois.filter(function(p){return p.c==='water'&&p.km>km+0.05;})[0];
    var st=PLAN.stages[d-1], toCamp=st?st.to-km:0;
    return {i:i,e:R.e[i],g:g,day:d,nextW:nextW,toCamp:toCamp,last:d===PLAN.stages.length};
  }
  function gradeWord(g){ var a=Math.abs(g); return a<3?'flat':(g>0?'climbing ':'descending ')+fmt(a)+'%'; }
  function showRoutePoint(km){
    var r=routeInfo(km), gg=GEO(R.x[r.i],R.z[r.i]);
    cursorKm=km; drawProfile(); $('pcur3').innerHTML='<b>km '+fmt(km,1)+'</b> · '+fmt(r.e)+' m · Day '+r.day;
    showPop('<h3>km '+fmt(km,1)+' · '+fmt(r.e)+' m</h3><div class="meta">On the trail · Day '+r.day+(TS()?' · '+esc(short(stageDate(r.day-1))):'')+'</div>'+
      '<div class="mgrid"><div><span>Here</span><b><i class="gdot" style="background:'+gradeCol(r.g)+'"></i>'+gradeWord(r.g)+'</b></div>'+
      '<div><span>'+(r.last?'To the finish':'To tonight\'s camp')+'</span><b>'+fmt(Math.max(0,r.toCamp),1)+' km</b></div>'+
      '<div><span>Next water</span><b>'+(r.nextW?fmt(r.nextW.km-km,1)+' km':'none listed')+'</b></div>'+
      '<div><span>Done so far</span><b>'+fmt(km,1)+' of '+fmt(D.total,0)+' km</b></div></div>'+
      (r.nextW?'<p>Next water: '+esc(r.nextW.n)+' at km '+fmt(r.nextW.km,1)+'.</p>':'')+coordRow(gg.lat,gg.lon));
    req();
  }
  function showProbe(x,z){
    var e=elevAt(x,z); if(e==null){ $('mpop').hidden=true; probe=null; req(); return; }
    probe={x:x,z:z}; var s=slopeAt(x,z), nr=nearestRoute(x,z), gg=GEO(x,z);
    showPop('<h3>'+fmt(e)+' m</h3><div class="meta">Terrain height here · from the elevation model</div>'+
      '<div class="mgrid"><div><span>Slope (approx.)</span><b>'+(s!=null?fmt(s)+'°':'–')+'</b></div>'+
      '<div><span>Nearest trail</span><b>'+(nr.d<1?fmt(nr.d*1000,0)+' m':fmt(nr.d,1)+' km')+' away</b></div>'+
      '<div><span>Trail there</span><b>km '+fmt(nr.km,1)+' · '+fmt(R.e[nr.i])+' m</b></div>'+
      '<div><span>Height difference</span><b>'+(e-R.e[nr.i]>=0?'+':'−')+fmt(Math.abs(e-R.e[nr.i]))+' m</b></div></div>'+
      '<p class="fine">The model is sampled every 600 m near the trail (up to 3 km further out), so heights are smoothed and cliffs look gentler than they are.</p>'+coordRow(gg.lat,gg.lon));
    req();
  }
  function hoverAt(e){
    var r=cv.getBoundingClientRect(), tx=e.clientX-r.left, ty=e.clientY-r.top, x=wx(tx), z=wz(ty), tip=$('mtip');
    var nr=nearestRoute(x,z), txt;
    if(nr.d*sc<=12){ var ri=routeInfo(nr.km); hoverKm=nr.km; txt='<b>km '+fmt(nr.km,1)+'</b> · '+fmt(ri.e)+' m · '+gradeWord(ri.g); $('pcur3').innerHTML='<b>km '+fmt(nr.km,1)+'</b> · '+fmt(ri.e)+' m · Day '+ri.day; }
    else { hoverKm=null; var el=elevAt(x,z); if(el==null){ tip.hidden=true; drawProfile(); req(); return; } txt=fmt(el)+' m'; }
    tip.innerHTML=txt; tip.hidden=false; tip.style.left=Math.min(W-tip.offsetWidth-6,tx+14)+'px'; tip.style.top=Math.max(6,ty-30)+'px';
    drawProfileHover(); req();
  }
  function drawProfileHover(){ var keep=cursorKm; if(hoverKm!=null){ cursorKm=hoverKm; drawProfile(); cursorKm=keep; } else drawProfile(); }
  function toggleMeasure(on){ measuring=on; $('mMeas').setAttribute('aria-pressed',String(on)); $('mhint').hidden=false; $('mhint').textContent=on?'Measure: tap points on the map · points on the trail snap to it':'Tap the map for height · tap the trail for details';
    if(on){ probe=null; $('mpop').hidden=true; } else mpts=[]; renderMeasure(); req(); }
  function addMeasure(tx,ty){ var x=wx(tx), z=wz(ty), nr=nearestRoute(x,z), p;
    if(nr.d*sc<=16) p={x:R.x[nr.i],z:R.z[nr.i],km:nr.km,e:R.e[nr.i]}; else { var el=elevAt(x,z); p={x:x,z:z,km:null,e:el}; }
    mpts.push(p); renderMeasure(); req(); }
  function renderMeasure(){
    var box=$('mmeas'); if(!measuring){ box.hidden=true; return; } box.hidden=false;
    var html='<div class="mm-h"><b>Measure</b><span>'+(mpts.length?mpts.length+' point'+(mpts.length>1?'s':''):'Tap the map to add points')+'</span></div>';
    if(mpts.length>1){
      var dist=0, up=0, dn=0;
      for(var i=1;i<mpts.length;i++){ var a=mpts[i-1], b=mpts[i], L=Math.hypot(b.x-a.x,b.z-a.z), n=Math.max(1,Math.ceil(L/0.1)), prev=elevAt(a.x,a.z);
        dist+=L; for(var k=1;k<=n;k++){ var t=k/n, el=elevAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t); if(el!=null&&prev!=null){ if(el>prev) up+=el-prev; else dn+=prev-el; } prev=el; } }
      html+='<div class="mm-r"><span>Straight line</span><b>'+fmt(dist,2)+' km</b><span>↑ '+fmt(up)+' m ↓ '+fmt(dn)+' m (terrain estimate)</span></div>';
      var f=mpts[0], l=mpts[mpts.length-1];
      if(f.km!=null&&l.km!=null&&Math.abs(l.km-f.km)>0.05){ var a2=Math.min(f.km,l.km), b2=Math.max(f.km,l.km), s=segStats(a2,b2), rev=f.km>l.km;
        html+='<div class="mm-r on"><span>Along the trail, km '+fmt(f.km,1)+' → '+fmt(l.km,1)+'</span><b>'+fmt(s.dist,1)+' km</b><span>↑ '+fmt(rev?s.down:s.up)+' m ↓ '+fmt(rev?s.up:s.down)+' m · about '+naismith(s.dist,rev?s.down:s.up)+' walking (Naismith)</span></div>'; }
      else html+='<p class="fine">Start and end on the trail (orange points) to get the trail distance, climb and walking time between them.</p>';
    }
    html+='<div class="mm-b"><button class="mini" data-m="undo"'+(mpts.length?'':' disabled')+'>Undo</button><button class="mini" data-m="clear"'+(mpts.length?'':' disabled')+'>Clear</button><button class="mini" data-m="done">Done</button></div>';
    box.innerHTML=html;
  }
  function toggleFull(on){
    var mb=$('mapbox'), done=false; full=on; $('mFull').setAttribute('aria-pressed',String(on)); $('mFull').innerHTML=on?'<i aria-hidden="true">✕</i><span class="t">Close</span>':'<i aria-hidden="true">⤢</i><span class="t">Full screen</span>'; $('mFull').setAttribute('aria-label',on?'Close full screen':'Full screen');
    if(on&&mb.requestFullscreen){ try{ mb.requestFullscreen().then(function(){ done=true; }).catch(function(){ mb.classList.add('full'); document.documentElement.classList.add('mapfull'); }); }catch(_){ mb.classList.add('full'); document.documentElement.classList.add('mapfull'); } }
    else if(on){ mb.classList.add('full'); document.documentElement.classList.add('mapfull'); }
    else { if(document.fullscreenElement){ try{ document.exitFullscreen(); }catch(_){} } mb.classList.remove('full'); document.documentElement.classList.remove('mapfull'); }
    setTimeout(function(){ resize(); if(!userMoved){ if(sel) fitDay(sel,0); else fitAll(0); } },60);
  }
  document.addEventListener('fullscreenchange',function(){ if(!document.fullscreenElement&&full&&!($('mapbox')&&$('mapbox').classList.contains('full'))){ full=false; var b=$('mFull'); if(b){ b.setAttribute('aria-pressed','false'); b.innerHTML='<i aria-hidden="true">⤢</i><span class="t">Full screen</span>'; b.setAttribute('aria-label','Full screen'); } setTimeout(resize,60); } });
  function buildChips(){ $('chips3').innerHTML='<button class="dchip" data-day="0">Whole route</button>'+days.map(function(d,i){return '<button class="dchip" data-day="'+(i+1)+'">Day '+(i+1)+(TS()?'<small>'+esc(dm(stageDate(i)))+'</small>':'')+'</button>';}).join(''); }
  /* ---- where am I (GPS) ---- */
  function toXZ(lat,lon){ var p=D.proj; return {x:(lon-p.lon0)*p.kx, z:-(lat-p.lat0)*p.ky}; }
  function toLL(x,z){ var p=D.proj; return {lat:p.lat0-z/p.ky, lon:p.lon0+x/p.kx}; }
  function bearing(dx,dz){ var a=(Math.atan2(dx,-dz)*180/Math.PI+360)%360; return ['N','NE','E','SE','S','SW','W','NW'][Math.round(a/45)%8]; }
  function distStr(km){ return km<1?fmt(Math.round(km*100)*10)+' m':fmt(km,km<10?1:0)+' km'; }
  function nearest(list,x,z){ var b=null,bd=1e9; list.forEach(function(o){ var d=Math.hypot(o.x-x,o.z-z); if(d<bd){bd=d;b=o;} }); return b?{o:b,d:bd,dir:bearing(b.x-x,b.z-z)}:null; }
  function meInfo(){ if(!me) return; var nr=nearestRoute(me.x,me.z), day=dayOfKm(nr.km), e=elevAt(me.x,me.z),
      w=nearest(D.pois.filter(function(p){return p.c==='water';}),me.x,me.z), cv2=nearest(sleepCaves,me.x,me.z), bl=D.bail?nearest(D.bail,me.x,me.z):null;
    var off=nr.d<0.05?'On the route':distStr(nr.d)+' from the route';
    showPop('<h3>You are here</h3><div class="meta">'+off+' · near km '+fmt(nr.km,1)+' (day '+day+' of the plan)'+(e!=null?' · ground about '+fmt(e)+' m':'')+' · GPS ±'+fmt(me.acc)+' m</div>'+
      '<p>'+fmt(nr.km,1)+' km done, '+fmt(D.total-nr.km,1)+' km to Bushman\'s Nek.</p>'+
      '<ul class="melist">'+(w?'<li><b>Named water point</b> '+esc(w.o.n)+' · '+distStr(w.d)+' '+w.dir+'</li>':'')+(cv2?'<li><b>Sleeping cave</b> '+esc(cv2.o.n)+' · '+distStr(cv2.d)+' '+cv2.dir+'</li>':'')+(bl?'<li><b>Bail-out pass</b> '+esc(bl.o.n.replace(' (approx.)',''))+' · '+distStr(bl.d)+' '+bl.dir+'</li>':'')+'</ul>'+
      '<p class="fine">Streams are common on the escarpment in March, so water is usually closer than this. Straight-line distances. Check the ground and your map before you commit to a way down.</p>'+coordRow(me.lat,me.lon)); }
  function locate(btn){
    if(watchId!=null){ try{ navigator.geolocation.clearWatch(watchId); }catch(e){} watchId=null; me=null; btn.setAttribute('aria-pressed','false'); $('mpop').hidden=true; req(); return; }
    if(!navigator.geolocation){ showPop('<h3>Location not available</h3><p>This browser can\'t share its location.</p>'); return; }
    btn.setAttribute('aria-pressed','true'); meFirst=true;
    showPop('<h3>Finding you…</h3><p>Waiting for a GPS fix. On the escarpment this works without phone signal; the first fix can take a minute.</p>');
    try{ watchId=navigator.geolocation.watchPosition(function(pos){ var c=pos.coords, xz=toXZ(c.latitude,c.longitude);
        me={x:xz.x,z:xz.z,lat:c.latitude,lon:c.longitude,acc:Math.round(c.accuracy||0)};
        if(meFirst){ meFirst=false;
          if(elevAt(me.x,me.z)==null){ showPop('<h3>You\'re not on the Drakensberg yet</h3><p>Your position is outside this map. On the trail, this button shows where you are on the route and the nearest water, sleeping cave and bail-out pass.</p>');
            try{ navigator.geolocation.clearWatch(watchId); }catch(e){} watchId=null; me=null; btn.setAttribute('aria-pressed','false'); req(); return; }
          var s2=Math.max(sc,40); setView(me.x,me.z+H*0.22/s2,s2,600); }
        meInfo(); req(); },
      function(err){ watchId=null; me=null; btn.setAttribute('aria-pressed','false'); req();
        showPop('<h3>Location not available</h3><p>'+(err&&err.code===1?(window.DGT_CONFIG?'Location is blocked for this site. Allow it for this page in your browser settings, then try again.':'The Claude app doesn\'t let this page use GPS. Open the website version of the planner on your phone and tap “Where am I” there.'):'No GPS fix yet. Step into the open and try again.')+'</p>'); },
      {enableHighAccuracy:true,maximumAge:15000,timeout:30000}); }
    catch(e){ btn.setAttribute('aria-pressed','false'); showPop('<h3>Location not available</h3><p>This page isn\'t allowed to use location here.</p>'); }
  }
  /* ---- GPX for phone GPS apps (website edition) ---- */
  function gpxDownload(){
    function x(s){ return String(s).replace(/[<>&"]/g,function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c];}); }
    function wpt(lat,lon,name,sym,desc,ele){ return '<wpt lat="'+(+lat).toFixed(6)+'" lon="'+(+lon).toFixed(6)+'">'+(ele?'<ele>'+Math.round(ele)+'</ele>':'')+'<name>'+x(name)+'</name>'+(desc?'<desc>'+x(desc)+'</desc>':'')+'<sym>'+sym+'</sym></wpt>\n'; }
    function trk(name,xs,zs,es){ var o='<trk><name>'+x(name)+'</name><trkseg>\n'; for(var i=0;i<xs.length;i++){ var ll=toLL(xs[i],zs[i]); o+='<trkpt lat="'+ll.lat.toFixed(6)+'" lon="'+ll.lon.toFixed(6)+'">'+(es?'<ele>'+es[i]+'</ele>':'')+'</trkpt>\n'; } return o+'</trkseg></trk>\n'; }
    var g='<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="DGT 2027 planner" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>Drakensberg Grand Traverse 2027</name></metadata>\n';
    zones.forEach(function(z){ if(z.lat!=null) g+=wpt(z.lat,z.lon,'D'+z.day+' camp: '+z.t,'Campground',(z.range||'')+(z.note?' · '+z.note:'')); });
    D.pois.forEach(function(p){ g+=wpt(p.lat,p.lon,p.n,p.c==='water'?'Drinking Water':p.c==='peak'?'Summit':'Flag, Blue',''); });
    (D.streams||[]).forEach(function(w){ var ll=toLL(w.x,w.z); g+=wpt(ll.lat,ll.lon,'Likely stream km '+fmt(w.km,1),'Drinking Water','From the terrain, about '+fmt(w.a,1)+' km2 catchment. Check on the map; small ones can be dry.'); });
    D.caves.forEach(function(c){ g+=wpt(c.lat,c.lon,c.n+(c.s==='no_camp'?' (no camping)':''),'Lodge',(c.cap?'Capacity '+c.cap+'. ':'')+(c.note||''),c.e); });
    if(D.bail) D.bail.forEach(function(b){ g+=wpt(b.lat,b.lon,'Bail-out: '+b.n.replace(' (approx.)',''),'Danger Area',b.note||'',b.e); });
    g+=trk('DGT main route',R.x,R.z,R.e);
    Object.keys(D.alts).forEach(function(k){ g+=trk('Alternate: '+k,D.alts[k].x,D.alts[k].z); });
    if(D.bail) D.bail.forEach(function(b){ g+=trk('Bail-out (rough line): '+b.n.replace(' (approx.)',''),b.path.x,b.path.z); });
    g+='</gpx>\n';
    try{ var url=URL.createObjectURL(new Blob([g],{type:'application/gpx+xml'})), a=document.createElement('a'); a.href=url; a.download='DGT-2027.gpx'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); },2000); }catch(e){}
  }
  window.DGT_GPX=gpxDownload;
  function boot(){
    booted=true; if(TILES) setTimeout(function(){ setBase(base); },0);
    cv=$('map2'); ctx=cv.getContext('2d');
    try{ buildRelief(); }catch(e){ relief=null; }
    var retheme=function(){ var m=cssv('--map-mode'); if(P&&((P.dark&&m==='light')||(!P.dark&&m!=='light'))){ try{ buildRelief(); }catch(e){} req(); try{ drawProfile(); }catch(e){} } };
    try{ window.matchMedia('(prefers-color-scheme: light)').addEventListener('change',function(){ setTimeout(retheme,30); }); }catch(e){}
    try{ new MutationObserver(function(){ setTimeout(retheme,30); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']}); }catch(e){}
    buildChips();
    $('chips3').addEventListener('click',function(e){var b=e.target.closest('[data-day]'); if(b) selectDay(+b.dataset.day,true);});
    $('panel3').addEventListener('click',function(e){
      var b=e.target.closest('[data-day]'); if(b){ selectDay(+b.dataset.day,true); return; }
      var c=e.target.closest('[data-cave]'); if(c){ var cave=D.caves.filter(function(x){return x.n===c.dataset.cave;})[0]; if(cave){ showCave(cave); setView(cave.x,cave.z,Math.max(sc,45),600);} } });
    $('mpop').addEventListener('click',function(e){
      if(e.target.closest('.x')){ $('mpop').hidden=true; probe=null; req(); return; }
      var cp=e.target.closest('[data-copy]'); if(cp){ var t=cp.dataset.copy; try{ navigator.clipboard.writeText(t).then(function(){cp.textContent='Copied';setTimeout(function(){cp.textContent='Copy';},1400);},function(){}); }catch(_){} } });
    $('mIn').addEventListener('click',function(){ setView(cx,cz,sc*1.6,250); });
    $('mOut').addEventListener('click',function(){ setView(cx,cz,sc/1.6,250); });
    $('mFit').addEventListener('click',function(){ selectDay(0,true); });
    $('mLoc').addEventListener('click',function(){ locate(this); });
    var gx=$('xGpx'); if(gx) gx.addEventListener('click',function(e){ e.preventDefault(); gpxDownload(); });
    $('mLay').addEventListener('click',function(){ var l=$('mlayers'); l.hidden=!l.hidden; this.setAttribute('aria-pressed',String(!l.hidden)); });
    $('mlayers').addEventListener('change',function(e){ if(e.target.name==='mbase'){ setBase(e.target.value); return; } var k=e.target.dataset.layer; if(k){ layers[k]=e.target.checked; $('mgrade').hidden=!layers.grade; req(); } });
    // pan, pinch, tap
    var pts={}, last=null, moved=0, pinch=null;
    cv.addEventListener('pointerdown',function(e){ cv.setPointerCapture(e.pointerId); pts[e.pointerId]={x:e.clientX,y:e.clientY}; anim=null; moved=0; cv.classList.add('drag');
      var ids=Object.keys(pts); if(ids.length===2){ var a=pts[ids[0]],b=pts[ids[1]]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y),s:sc}; } });
    cv.addEventListener('pointermove',function(e){ var p=pts[e.pointerId]; if(!p) return; var dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY; moved+=Math.abs(dx)+Math.abs(dy);
      var ids=Object.keys(pts);
      if(ids.length===2&&pinch){ var a=pts[ids[0]],b=pts[ids[1]], r=cv.getBoundingClientRect(), d=Math.hypot(a.x-b.x,a.y-b.y); zoomAt((a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top,(pinch.s*d/pinch.d)/sc); cx-=dx/2/sc; cz-=dy/2/sc; clampC(); }
      else if(ids.length===1){ cx-=dx/sc; cz-=dy/sc; userMoved=true; clampC(); req(); } });
    function up(e){ var had=pts[e.pointerId]; delete pts[e.pointerId]; if(Object.keys(pts).length<2) pinch=null; if(!Object.keys(pts).length) cv.classList.remove('drag');
      if(had&&moved<6&&!Object.keys(pts).length){ var r=cv.getBoundingClientRect(), hit=hitTest(e.clientX-r.left,e.clientY-r.top);
        var tx=e.clientX-r.left, ty=e.clientY-r.top;
        if(measuring){ addMeasure(tx,ty); return; }
        if(hit&&hit.k!=='zone'){ probe=null; if(hit.k==='cave') showCave(hit.o); else if(hit.k==='bail') showBail(hit.o); else if(hit.k==='stream') showStream(hit.o); else showPoi(hit.o); req(); return; }
        var nr=nearestRoute(wx(tx),wz(ty)); if(nr.d*sc<=14){ probe=null; showRoutePoint(nr.km); return; }
        if(hit){ probe=null; showZone(hit.o); req(); return; }
        showProbe(wx(tx),wz(ty)); } }
    cv.addEventListener('pointerup',up);
    cv.addEventListener('pointermove',function(e){ if(e.pointerType!=='mouse'||Object.keys(pts).length) return; hoverAt(e); });
    cv.addEventListener('pointerleave',function(){ $('mtip').hidden=true; if(hoverKm!=null){ hoverKm=null; drawProfile(); req(); } });
    cv.addEventListener('keydown',function(e){ var k=e.key, s=60/sc;
      if(k==='+'||k==='='){ setView(cx,cz,sc*1.5,200); } else if(k==='-'||k==='_'){ setView(cx,cz,sc/1.5,200); }
      else if(k==='ArrowLeft'){ cx-=s; } else if(k==='ArrowRight'){ cx+=s; } else if(k==='ArrowUp'){ cz-=s; } else if(k==='ArrowDown'){ cz+=s; }
      else if(k==='Escape'){ if(measuring) toggleMeasure(false); else if(full) toggleFull(false); return; } else return;
      e.preventDefault(); userMoved=true; clampC(); req(); });
    $('mMeas').addEventListener('click',function(){ toggleMeasure(!measuring); });
    $('mFull').addEventListener('click',function(){ toggleFull(!full); });
    $('mmeas').addEventListener('click',function(e){ var b=e.target.closest('[data-m]'); if(!b) return; var m=b.dataset.m;
      if(m==='undo'){ mpts.pop(); } else if(m==='clear'){ mpts=[]; } else if(m==='done'){ toggleMeasure(false); return; } renderMeasure(); req(); }); cv.addEventListener('pointercancel',function(e){ delete pts[e.pointerId]; pinch=null; cv.classList.remove('drag'); });
    cv.addEventListener('wheel',function(e){ e.preventDefault(); var r=cv.getBoundingClientRect(); zoomAt(e.clientX-r.left,e.clientY-r.top,Math.exp(-e.deltaY*0.0015)); },{passive:false});
    cv.addEventListener('dblclick',function(e){ var r=cv.getBoundingClientRect(); zoomAt(e.clientX-r.left,e.clientY-r.top,2); });
    new ResizeObserver(resize).observe(cv);
    // profile
    pc=$('prof3'); pctx=pc.getContext('2d'); var pdrag=false;
    function profKm(ev){var r=pc.getBoundingClientRect();return (ev.clientX-r.left-PAD.l)/(PW-PAD.l-PAD.r)*D.total;}
    pc.addEventListener('pointerdown',function(e){ pdrag=true; pc.setPointerCapture(e.pointerId); setCursor(profKm(e)); });
    pc.addEventListener('pointermove',function(e){ if(pdrag) setCursor(profKm(e)); else if(e.pointerType==='mouse'){ var k=Math.max(0,Math.min(D.total,profKm(e))), i=idxAtKm(k); hoverKm=k; $('pcur3').innerHTML='<b>km '+fmt(k,1)+'</b> · '+fmt(R.e[i])+' m · '+gradeWord(GRADE[i])+' · Day '+dayOfKm(k); drawProfileHover(); req(); } });
    pc.addEventListener('pointerleave',function(){ if(!pdrag&&hoverKm!=null){ hoverKm=null; drawProfile(); req(); } });
    pc.addEventListener('pointerup',function(e){ if(!pdrag) return; pdrag=false; var d=dayOfKm(Math.max(0,Math.min(D.total,profKm(e)))); if(d!==sel) selectDay(d,false); });
    new ResizeObserver(sizeProfile).observe(pc);
    if(window.matchMedia){ try{ matchMedia('(prefers-color-scheme: dark)').addEventListener('change',drawProfile); }catch(_){} }
    selectDay(pending,false);
  }
  return {
    markup:markup,
    replan:function(){ syncPlan(); if(!booted) return; buildChips(); var s=Math.min(sel,days.length); sel=-1; selectDay(s,false); },
    show:function(day){ if(!booted){ pending=day; requestAnimationFrame(boot); } else { if(day!==sel) selectDay(day,true); else if(!userMoved){ if(sel) fitDay(sel,0); else fitAll(0); } sizeProfile(); } }
  };
})();


/* =========================================================
   Dates poll: everyone marks which start week works for them.
   Answers live in the artifact's shared data (collection "datepoll", one document per person).
   ========================================================= */
var POLL=(function(){
  var OPTS=[
    {id:'a',title:'Week of 15 March',meet:'Meet in Johannesburg Sat 13 or Sun 14 March',start:'2027-03-15'},
    {id:'b',title:'Week of 22 March',meet:'Meet in Johannesburg Sat 20 or Sun 21 March',start:'2027-03-22'}];
  var ANS=[['yes','Works','✓'],['maybe','If need be','~'],['no','Can\'t make it','✕']];
  var NAME_KEY='dgt-poll-name';
  var db=null, col=null, rows=[], state='loading', canDel=false, ro=false;
  var form={name:'',a:null,b:null,note:''}, busy=false, msg='', msgCls='';
  try{ form.name=localStorage.getItem(NAME_KEY)||''; }catch(e){}
  function slug(s){ return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40); }
  function clean(d,id){ d=d||{}; var ok=function(v){return v==='yes'||v==='maybe'||v==='no'?v:null;};
    return {id:id,name:String(d.name||'').slice(0,40),a:ok(d.a),b:ok(d.b),note:String(d.note||'').slice(0,140),at:String(d.at||'')}; }
  function mine(){ var s=slug(form.name); return s?rows.filter(function(r){return r.id===s;})[0]:null; }
  function prefill(){ var r=mine(); if(r){ form.a=r.a; form.b=r.b; form.note=r.note; } }
  function tally(o){ var t={yes:0,maybe:0,no:0}; rows.forEach(function(r){ if(r[o.id]) t[r[o.id]]++; }); return t; }
  function trail(o){ return short(o.start)+' – '+short(addDays(o.start,N-1)); }

  function results(){
    var tt=OPTS.map(tally), lead=-1;
    if(rows.length){ var sc=tt.map(function(t){return t.yes*10+t.maybe;}); if(sc[0]!==sc[1]) lead=sc[0]>sc[1]?0:1; }
    var head='<p class="pl-sum">'+(state==='loading'?'Loading answers…':state==='nodb'?'Answers are shown to people signed in to Claude.':state==='err'?'Couldn\'t load the answers just now.':
      !rows.length?'No answers yet. Be the first.':(rows.length+' '+(rows.length===1?'person has':'people have')+' answered. '+(lead<0?'It\'s a tie so far.':'<b>'+esc(OPTS[lead].title)+'</b> is ahead.')))+'</p>';
    var opts='<div class="pl-opts">'+OPTS.map(function(o,i){ var t=tt[i], n=rows.length||1;
      var who=rows.filter(function(r){return r[o.id];}).map(function(r){ var a=ANS.filter(function(x){return x[0]===r[o.id];})[0]; return '<span class="pl-who '+r[o.id]+'" title="'+esc(a[1])+'">'+a[2]+' '+esc(r.name)+'</span>'; }).join('');
      return '<div class="pl-opt'+(i===lead?' lead':'')+'"><div class="pl-t">'+esc(o.title)+(i===lead?'<span class="pill acc">Ahead</span>':'')+'</div>'+
        '<div class="pl-m">'+esc(o.meet)+'</div><div class="pl-d mono">Trail '+trail(o)+' · '+N+' days</div>'+
        (state!=='ok'?'':'<div class="pl-bar" aria-hidden="true"><i class="yes" style="width:'+(t.yes/n*100)+'%"></i><i class="maybe" style="width:'+(t.maybe/n*100)+'%"></i><i class="no" style="width:'+(t.no/n*100)+'%"></i></div>'+
        '<div class="pl-n mono"><span>'+t.yes+' works</span><span>'+t.maybe+' if need be</span><span>'+t.no+' can\'t</span></div>')+
        (who?'<div class="pl-whos">'+who+'</div>':'')+'</div>'; }).join('')+'</div>';
    var notes=rows.filter(function(r){return r.note;});
    var nl=notes.length?'<ul class="pl-notes">'+notes.map(function(r){return '<li><b>'+esc(r.name)+':</b> '+esc(r.note)+'</li>';}).join('')+'</ul>':'';
    var del=canDel&&rows.length?'<details class="gd"><summary>Remove an answer</summary>'+rows.map(function(r){return '<button class="btn ghost" data-pdel="'+esc(r.id)+'">Remove '+esc(r.name)+'</button> ';}).join('')+'</details>':'';
    var answered={}; rows.forEach(function(r){ answered[slug(r.name)]=1; });
    var missing=state==='ok'?GROUP_NAMES.filter(function(n){ return !answered[slug(n)]; }):[];
    var wait=state==='ok'&&rows.length?'<p class="pl-wait">'+(missing.length?'Still to answer: <b>'+missing.map(esc).join(', ')+'</b>.':'Everyone has answered.')+'</p>':'';
    var lock=state==='ok'&&rows.length&&canEdit?'<div class="pl-lock"><h4>Set the date</h4><p class="note">Locking in moves the trail dates and the booking dates to that week, closes the poll and shows the dates as confirmed for everyone. You can reopen it under Edit trip details.</p><div class="toolbar">'+
      OPTS.map(function(o,i){ return '<button class="btn'+(i===lead?' primary':'')+'" data-plock="'+o.id+'">Lock in '+esc(o.title.replace(/^Week/,'the week'))+'</button>'; }).join('')+'</div></div>'
      :(state==='ok'&&rows.length&&!missing.length?'<p class="note">Leon will lock in the dates.</p>':'');
    return head+opts+wait+nl+lock+del;
  }
  function seg(o){ return '<div class="seg" role="group" aria-label="'+esc(o.title)+'">'+ANS.map(function(a){ return '<button type="button" data-pans="'+o.id+':'+a[0]+'" aria-pressed="'+(form[o.id]===a[0])+'">'+a[1]+'</button>'; }).join('')+'</div>'; }
  function formHTML(){
    var r=mine(), can=state==='ok'&&!ro;
    return '<div class="pl-form"><h4>Your answer</h4>'+
      '<label class="field">Your name<input list="dgt-names" autocomplete="off" class="pl-name" maxlength="40" autocomplete="given-name" value="'+esc(form.name)+'" placeholder="First name"></label>'+
      OPTS.map(function(o){ return '<div class="pl-row"><span>'+esc(o.title)+'<small>'+esc(o.meet.replace('Meet in Johannesburg ',''))+'</small></span>'+seg(o)+'</div>'; }).join('')+
      '<label class="field">Note (optional)<input class="pl-note" maxlength="140" value="'+esc(form.note)+'" placeholder="e.g. can only fly in on the Sunday"></label>'+
      '<div class="toolbar" style="margin-top:10px">'+
        (can?'<button class="btn primary" data-psave'+(busy?' disabled':'')+'>'+(r?'Update my answer':'Save my answer')+'</button>':'')+
        '<button class="btn'+(can?' ghost':' primary')+'" data-pcopy>Copy my answer</button></div>'+
      '<p class="msg '+msgCls+'" data-pmsg>'+esc(msg)+'</p>'+
      (can?'':'<p class="note">'+(state==='loading'?'Connecting…':ro?'Your access to this page is view-only, so answers can\'t be saved from here. Copy yours and send it to the group chat; Leon will add it.':'Saving here needs a Claude sign-in. Without one, copy your answer and send it to the group chat; Leon will add it.')+'</p>')+
      '</div>';
  }
  function card(){ return '<div class="card dpoll" data-poll><div class="eyebrow">Dates poll</div><h3>When do we start?</h3>'+
    '<p class="note">Both options are '+N+' days on the trail from Sentinel Car Park. Mark every week that could work for you.</p>'+
    '<div class="pl-grid"><div class="pl-res" data-pres>'+results()+'</div>'+formHTML()+'</div></div>'; }
  function paint(){ document.querySelectorAll('[data-pres]').forEach(function(el){ el.innerHTML=results(); }); }
  function paintForm(){ document.querySelectorAll('[data-poll] .pl-form').forEach(function(el){ var w=document.createElement('div'); w.innerHTML=formHTML(); el.replaceWith(w.firstChild); }); }
  function setMsg(t,c){ msg=t; msgCls=c||''; document.querySelectorAll('[data-pmsg]').forEach(function(el){ el.textContent=t; el.className='msg '+(c||''); }); }
  function answerText(){ return 'DGT dates — '+(form.name||'(name)')+': '+OPTS.map(function(o){ var a=ANS.filter(function(x){return x[0]===form[o.id];})[0]; return o.title+': '+(a?a[1].toLowerCase():'no answer'); }).join('; ')+(form.note?' — '+form.note:''); }

  async function save(){
    var name=form.name.trim(), id=slug(name);
    if(!id){ setMsg('Add your name first.','bad'); return; }
    if(!form.a&&!form.b){ setMsg('Mark at least one week.','bad'); return; }
    busy=true; paintForm();
    try{ await col.doc(id).set({name:name,a:form.a,b:form.b,note:form.note.trim(),at:new Date().toISOString()});
      try{ localStorage.setItem(NAME_KEY,name); }catch(e){}
      busy=false; paintForm(); setMsg('Saved. Thanks, '+name+'!','ok');
    }catch(e){ busy=false; paintForm(); setMsg(e&&e.code==='invalid_argument'?'You don\'t have permission to save here. Copy your answer and send it to the group.':'Couldn\'t save just now. Try again in a moment.','bad'); }
  }
  function bind(){
    document.addEventListener('click',function(e){
      var b=e.target.closest('[data-pans]'); if(b){ var p=b.dataset.pans.split(':'); form[p[0]]=form[p[0]]===p[1]?null:p[1];
        document.querySelectorAll('[data-pans^="'+p[0]+':"]').forEach(function(x){ x.setAttribute('aria-pressed',String(x.dataset.pans===p[0]+':'+form[p[0]])); }); return; }
      if(e.target.closest('[data-psave]')){ save(); return; }
      if(e.target.closest('[data-pcopy]')){ var t=answerText();
        try{ navigator.clipboard.writeText(t).then(function(){ setMsg('Copied: '+t,'ok'); },function(){ setMsg(t,''); }); }catch(_){ setMsg(t,''); } return; }
      var d=e.target.closest('[data-pdel]'); if(d&&col){ col.doc(d.dataset.pdel).delete().catch(function(){ setMsg('Couldn\'t remove that answer.','bad'); }); }
    });
    document.addEventListener('input',function(e){
      if(e.target.classList.contains('pl-name')){ form.name=e.target.value; var r=mine();
        if(r){ form.a=r.a; form.b=r.b; form.note=r.note; OPTS.forEach(function(o){ document.querySelectorAll('[data-pans^="'+o.id+':"]').forEach(function(x){ x.setAttribute('aria-pressed',String(x.dataset.pans===o.id+':'+form[o.id])); }); });
          document.querySelectorAll('.pl-note').forEach(function(n){ n.value=form.note; }); document.querySelectorAll('[data-psave]').forEach(function(s){ s.textContent='Update my answer'; }); }
        document.querySelectorAll('.pl-name').forEach(function(n){ if(n!==e.target) n.value=form.name; }); }
      if(e.target.classList.contains('pl-note')){ form.note=e.target.value; }
    });
  }
  async function start(){
    bind();
    var to=setTimeout(function(){ if(state==='loading'){ state='nodb'; paint(); paintForm(); } },11000);
    try{
      if(!window.claude||!claude.use){ state='nodb'; clearTimeout(to); paint(); paintForm(); return; }
      db=await claude.use('db'); clearTimeout(to);
      if(!db){ state='nodb'; paint(); paintForm(); return; }
      col=db.collection('datepoll');
      col.onSnapshot(function(qs){ rows=qs.docs.filter(function(d){return d.exists;}).map(function(d){return clean(d.data(),d.id);}).filter(function(r){return r.name;});
          rows.sort(function(x,y){return x.name.localeCompare(y.name);});
          var first=state!=='ok'; state='ok'; if(first){ prefill(); paintForm(); } paint(); ME.refresh(); },
        function(){ state='err'; paint(); paintForm(); });
      try{ var u=await claude.use('user'); if(u){ if(await u.canEdit()){ canDel=true; paint(); } if(u.can&&(await u.can('data.write'))===false){ ro=true; paintForm(); } } }catch(e){}
    }catch(e){ state='nodb'; paint(); paintForm(); }
  }
  return {card:card,start:start,opts:OPTS,mine:function(){ return state==='ok'?(mine()||false):null; }};
})();

/* =========================================================
   Who brings what: shared group-gear sign-up.
   Shared data: gclaims/<item>~<person> {item,name,n,at} · gitems/<id> {name,cat,need,g,at} · gneed/<item> {n}
   ========================================================= */
var GG=(function(){
  var NAME_KEY='dgt-poll-name';
  var col={}, claims=[], extra=[], need={}, state='loading', canEditGG=false, ro=false, me='', msg='', msgCls='', adding=false;
  try{ me=localStorage.getItem(NAME_KEY)||''; }catch(e){}
  function slug(s){ return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40); }
  function str(v,n){ return String(v==null?'':v).slice(0,n); }
  function int(v,lo,hi,d){ v=Math.round(+v); return isFinite(v)?Math.max(lo,Math.min(hi,v)):d; }
  function list(){ // catalog group items, then shared extras
    var cat=S.catalog.filter(function(i){return i.scope==='g';}).map(function(i){ return {id:i.id,name:i.name,cat:i.cat,need:need[i.id]!=null?need[i.id]:(i.qty||1),essential:!!i.essential,g:i.g||0,note:i.note||''}; });
    return cat.concat(extra.map(function(x){ return {id:x.id,name:x.name,cat:x.cat,need:need[x.id]!=null?need[x.id]:x.need,essential:false,g:x.g,note:'Added by the group',extra:1}; }));
  }
  function cats(){ var seen={},out=[]; S.cats.filter(function(c){return c.scope==='g';}).forEach(function(c){ seen[c.name]=1; out.push(c.name); });
    extra.forEach(function(x){ if(!seen[x.cat]){ seen[x.cat]=1; out.push(x.cat); } }); return out; }
  function claimsOf(id){ return claims.filter(function(c){return c.item===id;}); }
  function have(id){ return claimsOf(id).reduce(function(a,c){return a+c.n;},0); }
  function mineIds(){ var s=slug(me); return claims.filter(function(c){return slug(c.name)===s;}); }
  function unitG(i){ var c=S.catalog.filter(function(x){return x.id===i.id&&x.scope==='g';})[0]; if(c){ var u=unitOf(c,stOf(cur(),c.id)); return u||c.g||c.typ||0; } return i.g||0; }
  function mineList(){ var L2=list(), by={}; L2.forEach(function(i){ by[i.id]=i; });
    return mineIds().map(function(c){ var i=by[c.item]||{id:c.item,name:c.item,g:0}, cat=S.catalog.filter(function(x){return x.id===i.id&&x.scope==='g';})[0];
      var fuel=cat?(!!cat.fuel||catInfo(cur(),'g',cat.cat).kind==='cons'):/\b(gas|fuel|canister)\b/i.test(i.name);
      return {id:i.id,name:i.name,n:c.n,g:unitG(i),fuel:fuel,cat:!!cat}; }); }
  function mySplit(){ return mineList().reduce(function(a,x){ if(x.fuel) a.fuel+=x.g*x.n; else a.base+=x.g*x.n; return a; },{base:0,fuel:0}); }
  function myLoad(){ return mineList().reduce(function(a,x){ return a+x.g*x.n; },0); }

  function required(){
    var all=list(), ess=[], opt=[];
    all.forEach(function(i){ var h=have(i.id); if(h>=i.need) return; (i.essential||i.extra?ess:opt).push([i,i.need-h,h]); });
    var row=function(x){ var i=x[0]; return '<li><b>'+esc(i.name)+'</b> <span class="mono">'+(x[2]?x[2]+' of '+i.need+' covered · ':'')+x[1]+' more needed</span>'+(can()?' <button class="linkbtn" data-gclaim="'+esc(i.id)+'">I\'ll bring '+(x[1]>1?'one':'it')+'</button>':'')+'</li>'; };
    return '<div class="gg-req"><h4>Still required</h4>'+(ess.length?'<ul>'+ess.map(row).join('')+'</ul>':'<p class="okbox" style="margin:0">Every essential item has someone bringing it.</p>')+
      (opt.length?'<details class="gd"><summary>Optional items nobody has taken <i>'+opt.length+'</i></summary><ul>'+opt.map(row).join('')+'</ul></details>':'')+'</div>';
  }
  function itemRow(i){
    var cs=claimsOf(i.id), h=have(i.id), ok=h>=i.need, meS=slug(me), mine=cs.filter(function(c){return slug(c.name)===meS;})[0];
    return '<div class="gg-row'+(ok?' ok':'')+'"><div class="gg-n"><span>'+esc(i.name)+(i.essential?' <span class="pill">essential</span>':'')+'</span>'+
      '<small class="mono">'+(i.g?fmt(i.g)+' g each · ':'')+'need '+(canEditGG?'<input class="gg-need" type="number" min="0" max="20" inputmode="numeric" data-gneed="'+esc(i.id)+'" value="'+i.need+'" aria-label="How many needed">':i.need)+'</small></div>'+
      '<div class="gg-who">'+cs.map(function(c){ return '<span class="gg-chip'+(slug(c.name)===meS?' me':'')+'">'+esc(c.name)+(c.n>1?' ×'+c.n:'')+(can()&&(slug(c.name)===meS||canEditGG)?'<button data-gun="'+esc(c.id)+'" aria-label="Remove '+esc(c.name)+'">×</button>':'')+'</span>'; }).join('')+
        (can()?(mine?'<button class="gg-add" data-gclaim="'+esc(i.id)+'">+1</button>':'<button class="gg-add" data-gclaim="'+esc(i.id)+'">I\'ll bring '+(i.need-h>1?'one':'it')+'</button>'):'')+
      '</div><div class="gg-st mono">'+h+'/'+i.need+'</div></div>';
  }
  function can(){ return state==='ok'&&!ro; }
  function body(){
    if(state==='loading') return '<p class="note">Loading who brings what…</p>';
    if(state!=='ok') return '<p class="note">'+(state==='err'?'Couldn\'t load the shared list just now.':'The shared list of who brings what is shown to people signed in to Claude. Ask in the group chat, or open this page signed in.')+'</p>';
    var all=list(), mine=mineIds(), ml=myLoad();
    var meBox='<div class="gg-me"><label class="field">Your name<input list="dgt-names" autocomplete="off" class="gg-name pl-name" maxlength="40" value="'+esc(me)+'" placeholder="First name"></label>'+
      (me&&mine.length?'<p class="note">You\'re bringing '+mine.length+' item'+(mine.length>1?'s':'')+', about '+kg(ml)+'. They show under <a href="#gear">My gear</a> and count in your pack weight.</p>':
        me?'<p class="note">Tap “I\'ll bring it” on anything you can take.</p>':'<p class="note">Add your name, then tap “I\'ll bring it” on anything you can take.</p>')+
      (ro?'<p class="note">Your access to this page is view-only, so you can see the list but not sign up here.</p>':'')+'</div>';
    var byCat=cats().map(function(c){ var its=all.filter(function(i){return i.cat===c;}); if(!its.length) return '';
      return '<div class="gg-cat"><h4>'+esc(c)+'</h4>'+its.map(itemRow).join('')+'</div>'; }).join('');
    var add=can()?(adding?'<div class="gg-addform"><input class="gg-in-name" maxlength="60" placeholder="Item, e.g. Water filter"><select class="gg-in-cat">'+cats().map(function(c){return '<option>'+esc(c)+'</option>';}).join('')+'<option value="__new">Other (new group)</option></select>'+
        '<input class="gg-in-need" type="number" min="1" max="20" value="1" aria-label="How many needed"><input class="gg-in-g" type="number" min="0" placeholder="grams" aria-label="Grams each"><button class="btn" data-gadd>Add</button><button class="btn ghost" data-gaddx>Cancel</button></div>'
      :'<button class="addbtn" style="padding-left:0" data-gaddopen>+ Add something the group needs</button>'):'';
    return meBox+required()+'<div class="gg-list">'+byCat+'</div>'+add+'<p class="msg '+msgCls+'" data-ggmsg>'+esc(msg)+'</p>';
  }
  function card(){ return '<div class="card gg" data-gg><div class="eyebrow">Shared with the group</div><h3>Who brings what</h3><div data-ggb>'+body()+'</div></div>'; }
  function paint(){ var a=document.activeElement, focusName=a&&a.classList&&a.classList.contains('gg-name'), pos=focusName?a.selectionStart:0;
    document.querySelectorAll('[data-ggb]').forEach(function(el){ el.innerHTML=body(); });
    if(focusName){ var n=document.querySelector('.gg-name'); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} } } }
  function say(t,c){ msg=t; msgCls=c||''; document.querySelectorAll('[data-ggmsg]').forEach(function(el){ el.textContent=t; el.className='msg '+(c||''); }); }
  function fail(e){ say(e&&e.code==='invalid_argument'?'You don\'t have permission to change the shared list.':'Couldn\'t save just now. Try again in a moment.','bad'); }

  async function claim(item){
    var name=me.trim(), s=slug(name); if(!s){ say('Add your name first.','bad'); var n=document.querySelector('.gg-name'); if(n) n.focus(); return; }
    var id=item+'~'+s, cur=claims.filter(function(c){return c.id===id;})[0];
    try{ await col.c.doc(id).set({item:item,name:name,n:cur?Math.min(20,cur.n+1):1,at:new Date().toISOString()}); say('',''); }catch(e){ fail(e); }
  }
  function bind(){
    document.addEventListener('click',function(e){
      var t;
      if((t=e.target.closest('[data-gclaim]'))){ claim(t.dataset.gclaim); return; }
      if((t=e.target.closest('[data-gun]'))){ var c=claims.filter(function(x){return x.id===t.dataset.gun;})[0]; if(!c) return;
        (c.n>1?col.c.doc(c.id).set({item:c.item,name:c.name,n:c.n-1,at:new Date().toISOString()}):col.c.doc(c.id).delete()).catch(fail); return; }
      if((t=e.target.closest('[data-guse]'))){ L.groupLoad=+t.dataset.guse; persist(); updateGear(); var gl=document.querySelector('[data-act="gload"]'); if(gl) gl.value=L.groupLoad; say('Set as the group gear you carry ('+kg(L.groupLoad)+'), in this browser.','ok'); return; }
      if(e.target.closest('[data-gaddopen]')){ adding=true; paint(); var f=document.querySelector('.gg-in-name'); if(f) f.focus(); return; }
      if(e.target.closest('[data-gaddx]')){ adding=false; paint(); return; }
      if(e.target.closest('[data-gadd]')){ var box=e.target.closest('.gg-addform'), nm=box.querySelector('.gg-in-name').value.trim(), ct=box.querySelector('.gg-in-cat').value;
        if(!nm){ say('Name the item first.','bad'); return; }
        if(ct==='__new') ct='Other';
        var id='x-'+slug(nm).slice(0,30)+'-'+Date.now().toString(36);
        col.i.doc(id).set({name:nm.slice(0,60),cat:ct.slice(0,40),need:int(box.querySelector('.gg-in-need').value,1,20,1),g:int(box.querySelector('.gg-in-g').value,0,20000,0),by:me.slice(0,40),at:new Date().toISOString()})
          .then(function(){ adding=false; paint(); say('Added '+nm+'.','ok'); },fail); return; }
    });
    document.addEventListener('change',function(e){
      var t=e.target; if(t.dataset&&t.dataset.gneed){ col.n.doc(t.dataset.gneed).set({n:int(t.value,0,20,1)}).catch(fail); }
    });
    document.addEventListener('input',function(e){
      if(e.target.classList.contains('pl-name')){ me=e.target.value; try{ localStorage.setItem(NAME_KEY,me.trim()); }catch(_){} clearTimeout(bind.t); bind.t=setTimeout(paint,500); }
    });
  }
  async function start(){
    bind();
    var to=setTimeout(function(){ if(state==='loading'){ state='nodb'; paint(); } },11000);
    try{
      if(!window.claude||!claude.use){ clearTimeout(to); state='nodb'; paint(); return; }
      var db=await claude.use('db'); clearTimeout(to);
      if(!db){ state='nodb'; paint(); return; }
      col={c:db.collection('gclaims'),i:db.collection('gitems'),n:db.collection('gneed')};
      var got=0, ready=function(){ if(++got>=3&&state!=='ok'){ state='ok'; } paint(); ME.refresh(); if(view==='overview'){ var og=$('ov-gg'); if(og) og.innerHTML=ovGG(); } if(view==='gear'||view==='group'){ var el=$('g-claimed'); if(el) el.innerHTML=claimedHTML(); updateGear(); } }, err=function(){ state='err'; paint(); };
      col.c.onSnapshot(function(q){ setTimeout(function(){ if(view==='safety') rerender(); },0); claims=q.docs.filter(function(d){return d.exists;}).map(function(d){ var x=d.data()||{}; return {id:d.id,item:str(x.item,60),name:str(x.name,40),n:int(x.n,1,20,1)}; }).filter(function(c){return c.item&&c.name;}); ready(); },err);
      col.i.onSnapshot(function(q){ extra=q.docs.filter(function(d){return d.exists;}).map(function(d){ var x=d.data()||{}; return {id:d.id,name:str(x.name,60),cat:str(x.cat,40)||'Other',need:int(x.need,0,20,1),g:int(x.g,0,20000,0)}; }).filter(function(x){return x.name;}); ready(); },err);
      col.n.onSnapshot(function(q){ need={}; q.docs.forEach(function(d){ if(d.exists){ var x=d.data()||{}; need[d.id]=int(x.n,0,20,1); } }); ready(); },err);
      try{ var u=await claude.use('user'); if(u){ if(await u.canEdit()){ canEditGG=true; paint(); } if(u.can&&(await u.can('data.write'))===false){ ro=true; paint(); } } }catch(e){}
    }catch(e){ state='nodb'; paint(); }
  }
  return {card:card,start:start,paint:paint,mineList:function(){ return state==='ok'?(slug(me)?mineList():[]):null; },state:function(){ return state; },load:function(){ return state==='ok'&&slug(me)?myLoad():null; },split:function(){ return state==='ok'&&slug(me)?mySplit():null; },me:function(){ if(state!=='ok') return null; var all=list(), by={}; all.forEach(function(i){ by[i.id]=i; });
      return {items:mineIds().map(function(c){ return ((by[c.item]||{}).name||c.item)+(c.n>1?' ×'+c.n:''); }),g:myLoad(),open:all.filter(function(i){ return (i.essential||i.extra)&&have(i.id)<i.need; }).length}; },who:function(id){ if(state!=='ok') return null; return claimsOf(id).map(function(c){return c.name+(c.n>1?' ×'+c.n:'');}); }};
})();

/* =========================================================
   Weight advice and trip fit.
   Weight ideas respect the person's priorities (lightest / balanced / comfort first, sleep system protected),
   never flag safety kit as "too heavy", and sit beside checks against the March weather on the escarpment.
   ========================================================= */
var ADVICE=(function(){
  var BENCH={p01:[1100,750,'pack'],p04:[1100,700,'tent (your share)'],p06:[950,800,'sleeping bag'],p07:[450,350,'sleeping mat'],
    p10:[300,200,'waterproof jacket'],p11:[220,130,'overtrousers'],p12:[350,250,'insulated jacket'],p13:[300,200,'mid layer'],
    p18:[200,120,'camp shoes'],p24:[450,330,'pair of poles'],p19:[900,650,'pair of boots or shoes'],p32:[250,180,'power bank and cables'],p03:[100,60,'set of dry bags']};
  var SAFETY={p28:1,p31:1,p33:1,p34:1,p35:1,p36:1,p37:1,p41:1,p10:1,p11:1};
  var MODES=[['light','Lightest pack'],['balanced','Balanced'],['comfort','Comfort first']];
  function prio(){ var p=L.prio||{}; return {mode:p.mode||'balanced',sleep:!!p.sleep}; }
  function spec(lo){ return lo.spec||{}; }
  function analyse(lo){
    var s=summary(lo), pr=prio(), tips=[], kept=[], unweighed=[], optional=[], weighed=0, thr=pr.mode==='light'?1.15:pr.mode==='comfort'?1.6:1.3;
    items(lo,'p').forEach(function(it){
      var st=stOf(lo,it.id); if(!isOn(it,st)) return;
      var u=unitOf(it,st), q=qtyOf(it,st), w=u*q, nm=nameOf(it,st), ci=catInfo(lo,'p',it.cat), sleep=it.cat==='Sleep';
      if(!u){ if(!/built into|included/i.test(nm)) unweighed.push(nm); return; } weighed++;
      var minG=pr.mode==='light'?30:pr.mode==='comfort'?150:80;
      var push=function(t){ if(t.g<minG) return; if(sleep&&pr.sleep){ kept.push(t); } else tips.push(t); };
      if(!it.essential&&!it.custom&&ci.kind!=='cons'){ if(sleep&&pr.sleep) kept.push({g:w,k:'leave',t:nm,x:'Optional, kept because you protect your sleep system.'}); else optional.push([nm,w]); }
      var b=BENCH[it.id];
      if(b&&!(pr.mode==='comfort'&&!it.essential)){ var target=pr.mode==='light'?b[1]:b[0];
        if(u>target&&(pr.mode!=='comfort'||u>b[0]*1.25)) push({g:(u-target)*q,k:ci.kind==='worn'?'worn':'swap',t:nm,
          x:'Yours is '+fmt(u)+' g. A lightweight '+b[2]+' is about '+fmt(b[0])+' g, an ultralight one about '+fmt(b[1])+' g.'+(sleep?' Lighter sleep kit usually means thinner, colder or less comfortable: only worth it if you sleep well on it.':'')+(it.id==='p04'?' Make sure a lighter shelter still copes with the 60–90 km/h gusts seen up there.':'')+(ci.kind==='worn'?' This is worn weight, so it doesn\'t change your base weight.':'')}); }
      else if(!b&&!SAFETY[it.id]&&it.essential&&it.typ&&u>it.typ*thr&&u-it.typ>=60) push({g:(u-it.typ)*q,k:ci.kind==='worn'?'worn':'over',t:nm,x:'Yours is '+fmt(u)+' g against a typical '+fmt(it.typ)+' g.'});
      if(modeOf(it,st)==='parts'&&pr.mode!=='comfort'){ partsOf(it,st).forEach(function(p){ if(p.on&&/rain cover|stuff sack|pockets?|compression/i.test(p.name)&&+p.g>=40) push({g:+p.g*q,k:'part',t:p.name+' ('+nm+')',x:'Often left at home: a pack liner already keeps things dry, and loose items can share one bag.'}); }); }
    });
    if(optional.length){ var og=optional.reduce(function(a,o){return a+o[1];},0);
      tips.push({g:og,k:'leave',t:'Optional extras you\'re taking',x:optional.sort(function(a,b){return b[1]-a[1];}).map(function(o){return o[0]+' '+fmt(o[1])+' g';}).join(' · ')+'. Not on the essential list: keep the ones that earn their place.'}); }
    var f=L.food, fd=food();
    if(fd.dens&&fd.dens<500){ var lighter=Math.round(fd.kcal/500*100)*fd.days; if(fd.total-lighter>0) tips.push({g:fd.total-lighter,k:'food',t:'Food energy density',
      x:'At '+fmt(fd.dens)+' kcal per 100 g, '+fmt(fd.kcal)+' kcal a day weighs '+fmt(fd.perDay)+' g. At 500 kcal per 100 g (more nuts, oils, nut butter, chocolate, dried meat) it would weigh '+fmt(Math.round(fd.kcal/500*100))+' g a day.'+(fd.menu?' Your menu is on the Food & fuel tab.':'')}); }
    if(+f.spare>BUFFER) tips.push({g:(+f.spare-BUFFER)*fd.spareDay,k:'food',t:'Buffer food',x:'You\'re carrying '+fmt(f.spare)+' buffer days; the group plans '+BUFFER+'. Each extra day is '+fmt(fd.spareDay)+' g.'});
    if(!fd.ownSpare&&+f.spare>0&&fd.perDay>650) tips.push({g:Math.round((fd.perDay-550)*f.spare),k:'food',t:'Lighter buffer days',x:'Your '+fmt(f.spare)+' buffer days are counted as full days ('+fmt(fd.perDay)+' g each). A compact spare day of dense food (nuts, chocolate, dried meat, a cold-soak meal) is about 550 g. Add it under Spare day in your menu.'});
    if(+f.water>1.5) tips.push({g:(+f.water-1)*1000,k:'water',t:'Water at the start',x:'You start with '+fmt(f.water,1)+' L. Water is plentiful in March; carrying 1 L between sources saves '+fmt((+f.water-1)*1000)+' g.'});
    var gs=Math.max(1,+L.groupSize||1), even=s.group/gs;
    if(L.groupLoad!=null&&s.share>even*1.2&&s.share-even>=150) tips.push({g:s.share-even,k:'group',t:'Your share of group gear',x:'You carry '+kg(s.share)+' of group kit; an even split is '+kg(even)+'. Fine if agreed, but it\'s the easiest weight to hand on.'});
    tips.sort(function(a,b){return b.g-a.g;});
    var next=null; for(var i=0;i<CLASSES.length;i++){ if(s.base<CLASSES[i][0]){ if(i>0) next={name:CLASSES[i-1][1],gap:s.base-CLASSES[i-1][0]}; break; } }
    return {s:s,tips:tips,kept:kept,unweighed:unweighed,weighed:weighed,next:next,big3pct:s.big3pct,pr:pr,fit:fit(lo,s)};
  }
  /* checks against the weather (see the Weather tab) and the route */
  function fit(lo,s){
    var out=[], sp=spec(lo), on=function(id){ var it=findItem(id); return it&&isOn(it,stOf(lo,id)); };
    var cold=Math.min(WX.A.coldest,WX.B.coldest), low=Math.round((WX.A.tmin+WX.B.tmin)/2);
    if(on('p06')){ var c=sp.bag;
      if(c==null||c==='') out.push(['info','Sleeping bag','Add its comfort rating below to check it against the nights.']);
      else if(c<=cold) out.push(['ok','Sleeping bag','Comfort rating '+fmt(c,0)+' °C covers the coldest night in ten years ('+fmt(cold,1)+' °C).']);
      else if(c<=low) out.push(['warn','Sleeping bag','Comfort '+fmt(c,0)+' °C is fine for a typical night (about '+low+' °C) but not the frosty ones ('+fmt(cold,1)+' °C, colder in hollows). Sleep in your thermals and down jacket on cold nights; a liner adds a few degrees for 150–250 g.']);
      else out.push(['bad','Sleeping bag','Comfort '+fmt(c,0)+' °C is warmer than typical nights up there (about '+low+' °C). Plan to sleep in your insulated jacket every night, add a liner, or choose a warmer bag.']); }
    else out.push(['bad','Sleeping bag','No sleeping bag ticked.']);
    if(on('p07')){ var r=sp.mat;
      if(r==null||r==='') out.push(['info','Sleeping mat','Add its R-value below.']);
      else if(r>=4) out.push(['ok','Sleeping mat','R '+fmt(r,1)+' is right for frosty ground.']);
      else if(r>=3) out.push(['warn','Sleeping mat','R '+fmt(r,1)+' is on the cool side for nights near freezing; a thin foam pad underneath adds warmth and puncture insurance.']);
      else out.push(['bad','Sleeping mat','R '+fmt(r,1)+' will feel cold on frosty ground. Aim for R 4 or more.']); }
    out.push([on('p10')&&on('p11')?'ok':'bad','Rain protection',on('p10')&&on('p11')?'Jacket and overtrousers ticked: rain fell on about half the days in past years.':'Take both a waterproof jacket and overtrousers: rain fell on about half the days in past years.']);
    out.push([on('p12')?'ok':'warn','Warm layer',on('p12')?'Insulated jacket ticked for cold evenings and as a bag booster.':'An insulated jacket is the main warmth for evenings at 3,000 m.']);
    out.push(['info','Tent in wind','Gusts of 60 km/h or more came on about one day in ten, up to about 95 km/h. Pick sheltered pitches, use every guyline, and add trekking poles as an extra arch if your tent allows.']);
    if(s.pack>18000) out.push(['warn','Starting load','Your pack starts at '+kg(s.pack)+'. Check your pack\'s rated load and that the hip belt carries it comfortably.']);
    else if(s.pack>0) out.push(['ok','Starting load','Pack at the start is '+kg(s.pack)+'.']);
    return out;
  }
  function checks(fl){ return fl.map(function(f){ return '<li class="'+f[0]+'"><span class="pill '+(f[0]==='ok'?'ok':f[0]==='bad'?'bad':f[0]==='warn'?'warn':'')+'">'+FLAB[f[0]]+'</span><div><b>'+esc(f[1])+'</b><p>'+esc(f[2])+'</p></div></li>'; }).join(''); }
  var KLAB={swap:'Lighter option',over:'Heavier than typical',part:'Part to drop',leave:'Leave at home?',food:'Food',water:'Water',group:'Group gear',worn:'Worn weight'};
  var FLAB={ok:'Good',warn:'Check',bad:'Fix',info:'Note'};
  function card(){
    var lo=cur(), a=analyse(lo), s=a.s, pr=a.pr, sp=spec(lo);
    var prioUI='<div class="adv-prio"><span class="note" style="margin:0">What matters most</span><div class="seg" role="group" aria-label="Priority">'+MODES.map(function(m){ return '<button type="button" data-act="prio" data-m="'+m[0]+'" aria-pressed="'+(pr.mode===m[0])+'">'+m[1]+'</button>'; }).join('')+'</div>'+
      '<label class="adv-chk"><input type="checkbox" data-act="prio-sleep"'+(pr.sleep?' checked':'')+'> Keep my sleep system as it is</label></div>';
    var fitUI='<div class="adv-fit"><h4>Fit for the DGT in March</h4><div class="adv-specs"><label class="field">Bag comfort rating (°C)<input type="number" step="0.5" data-act="spec" data-k="bag" value="'+(sp.bag!=null?sp.bag:'')+'" placeholder="e.g. 3"></label>'+
      '<label class="field">Mat R-value<input type="number" step="0.1" min="0" data-act="spec" data-k="mat" value="'+(sp.mat!=null?sp.mat:'')+'" placeholder="e.g. 4.1"></label></div>'+
      '<ul class="adv-checks">'+checks(a.fit)+'</ul>'+
      '<p class="note">Against ten years of weather on these dates; see <a href="#weather">Weather</a>.</p></div>';
    if(a.weighed<5) return '<div class="card adv"><div class="eyebrow">Gear check · '+esc(L.names[L.active])+'</div><h3>Weight, comfort and trip fit</h3>'+prioUI+fitUI+'<p class="note">Weigh your kit on <a href="#gear">My gear</a> for weight ideas: '+(a.weighed?'only '+a.weighed+' items have a weight so far.':'nothing has a weight yet.')+'</p></div>';
    var base=a.tips.filter(function(t){return t.k!=='worn'&&t.k!=='food'&&t.k!=='water';}).reduce(function(x,t){return x+t.g;},0);
    var cons=a.tips.filter(function(t){return t.k==='food'||t.k==='water';}).reduce(function(x,t){return x+t.g;},0);
    var head='<div class="adv-sum">'+
      '<div><span>Base weight</span><b>'+kg(s.base)+'</b><small>'+esc(s.cls)+'</small></div>'+
      '<div><span>Could come off base</span><b>'+kg(base)+'</b><small>if you took every idea below</small></div>'+
      (cons?'<div><span>Off consumables</span><b>'+kg(cons)+'</b><small>food and water at the start</small></div>':'')+
      (a.next?'<div><span>To '+esc(a.next.name.toLowerCase())+'</span><b>'+kg(a.next.gap)+'</b><small>under '+kg(CLASSES.filter(function(c){return c[1]===a.next.name;})[0][0])+' base</small></div>':'')+'</div>';
    var list=a.tips.length?'<ol class="adv-list">'+a.tips.slice(0,12).map(function(t){ return '<li><div class="adv-g mono">−'+fmt(t.g)+' g</div><div><span class="kindpill">'+KLAB[t.k]+'</span><b>'+esc(t.t)+'</b><p>'+esc(t.x)+'</p></div></li>'; }).join('')+'</ol>'
      :'<p class="okbox">Nothing stands out for your priorities.</p>';
    var kept=a.kept.length?'<details class="gd"><summary>Sleep system ideas you\'ve set aside <i>'+a.kept.length+'</i></summary><ol class="adv-list">'+a.kept.map(function(t){ return '<li><div class="adv-g mono">'+(t.k==='leave'?'':'−'+fmt(t.g)+' g')+'</div><div><b>'+esc(t.t)+'</b><p>'+esc(t.x)+'</p></div></li>'; }).join('')+'</ol></details>':'';
    var warn=a.unweighed.length?'<p class="warnbox">'+a.unweighed.length+' ticked item'+(a.unweighed.length>1?'s have':' has')+' no weight yet ('+esc(a.unweighed.slice(0,6).join(', '))+(a.unweighed.length>6?'…':'')+'), so the totals are low.</p>':'';
    return '<div class="card adv"><div class="eyebrow">Gear check · '+esc(L.names[L.active])+'</div><h3>Weight, comfort and trip fit</h3>'+prioUI+fitUI+
      '<h4>Where you could save weight</h4>'+head+warn+list+kept+
      '<p class="note">Estimates against common lightweight gear. Safety kit (first aid, light, rain gear, navigation) is never counted as too heavy.</p>'+
      '<div class="adv-ai" data-advai><button class="btn" data-act="adv-ai">Ask Claude for a full review</button><span class="note">Rates your main items for weight, comfort, reliability and fit for this trip, with your priorities. Sends item names and weights only. Needs a Claude sign-in.</span><div class="adv-out" hidden></div></div></div>';
  }
  var busy=false;
  async function ai(btn){
    if(busy) return; var box=btn.closest('[data-advai]'), out=box.querySelector('.adv-out'); out.hidden=false;
    var sample=null; try{ sample=window.claude&&claude.use?await claude.use('sample'):null; }catch(e){}
    if(!sample){ out.textContent='A written review needs a Claude sign-in on this page. The checks above work without one.'; return; }
    var lo=cur(), a=analyse(lo), s=a.s, pr=a.pr, sp=spec(lo), rows=[];
    items(lo,'p').forEach(function(it){ var st=stOf(lo,it.id); if(!isOn(it,st)) return; var u=unitOf(it,st); rows.push(it.cat+' | '+nameOf(it,st)+(st.mine&&st.mine.trim()?' ('+it.name+')':'')+' | '+(u?u*qtyOf(it,st)+' g':'not weighed')+(it.essential?'':' | optional')); });
    var W=WX, wx='Weather on these dates 2016–2025 (ERA5, 3,000–3,200 m): day highs about '+fmt((W.A.tmax+W.B.tmax)/2,0)+' °C, nights about '+fmt((W.A.tmin+W.B.tmin)/2,0)+' °C, coldest '+fmt(Math.min(W.A.coldest,W.B.coldest),1)+' °C (real hollows colder), rain on '+W.B.wet+'–'+W.A.wet+'% of days mostly as afternoon storms, gusts of 60 km/h+ on about 1 day in 10.';
    var prompt='You are an experienced backpacking gear adviser. Review this hiker\'s kit for the Drakensberg Grand Traverse: about '+fmt(totalKm)+' km, '+fmt(totalUp)+' m of ascent, '+N+' days, unsupported, mostly trackless on the 2,800–3,400 m escarpment (Lesotho/South Africa), March. '+wx+'\n\n'+
      'Their priority: '+({light:'lightest pack',balanced:'a balance of weight and comfort',comfort:'comfort first'})[pr.mode]+(pr.sleep?'; they will carry extra weight for a comfortable sleep system and do not want it cut':'')+'.'+(sp.bag!=null?' Bag comfort rating '+sp.bag+' °C.':'')+(sp.mat!=null?' Mat R-value '+sp.mat+'.':'')+
      ' Base weight '+kg(s.base)+', worn '+kg(s.worn)+', pack at start '+kg(s.pack)+'.\n\nItems (category | item | weight | optional?):\n'+rows.join('\n')+
      '\n\nFor the pack, shelter, sleeping bag, mat, rain jacket, rain trousers, insulated jacket and footwear: give a line "Item — Weight x/5 · Comfort x/5 · Reliability x/5 · Trip fit x/5" and one sentence of reasoning that uses what you know about that specific model where you know it (say so if you don\'t). Then rank the 3 changes that would most improve the kit for this trip given their priorities (weight saved or comfort/safety gained). Then one line on anything that must not be cut. Plain text, no tables, under 320 words.';
    busy=true; btn.disabled=true; out.textContent='Thinking…';
    try{ var r=await sample(prompt,{onText:function(p){ out.textContent=p.text; }}); out.textContent=r.text; }
    catch(e){ if(e&&e.code==='handoff'){ out.innerHTML='<a class="btn primary" href="'+esc(e.url)+'" target="_blank" rel="noopener">Open in Claude</a> <button class="btn ghost" type="button">Copy the question</button><p class="note">Opens a new chat in your own Claude account (the free plan works) with the question and your list filled in. If it opens empty, copy the question and paste it into Claude.</p>';
      var cq=out.querySelector('button'); cq.onclick=function(){ try{ navigator.clipboard.writeText(e.prompt).then(function(){ cq.textContent='Copied'; },function(){}); }catch(_){} }; busy=false; btn.disabled=false; return; }
      out.textContent=e&&e.code==='not_granted'?'The review wasn\'t allowed on this page.':e&&e.code==='rate_limited'?'Too many requests just now. Try again in a minute.':'Couldn\'t get a review just now.'+(e&&e.text?'\n\n'+e.text:''); }
    busy=false; btn.disabled=false; btn.textContent='Ask again';
  }
  function setPrio(k,v){ L.prio=L.prio||{}; L.prio[k]=v; persist(); }
  function setSpec(k,v){ var lo=cur(); lo.spec=lo.spec||{}; lo.spec[k]=v; persist(); }
  function refreshFit(){ var el=document.querySelector('.adv-checks'); if(el){ var lo=cur(); el.innerHTML=checks(fit(lo,summary(lo))); } }
  return {card:card,ai:ai,setPrio:setPrio,setSpec:setSpec,refreshFit:refreshFit};
})();

/* =========================================================
   Account sync: signed-in viewers also keep their gear in their own private space
   (data/users/<their id>), so it follows them to other devices and survives cleared browsers.
   ========================================================= */
var SYNC=(function(){
  var doc=null, on=false, t=null;
  function push(){ if(!doc) return; clearTimeout(t); t=setTimeout(function(){
    doc.set({json:JSON.stringify(L),savedAt:L.savedAt||''}).then(function(){ on=true; showSaved(); },function(){ on=false; showSaved(); }); },1500); }
  async function start(){
    try{
      if(!window.claude||!claude.use) return;
      var db=await claude.use('db'), u=await claude.use('user'); if(!db||!u) return;
      var id=await u.id(); if(!id) return;
      doc=db.collection('data/users/'+id).doc('planner');
      var snap=await doc.get();
      if(snap.exists){
        var d=snap.data()||{}, o=null; try{ o=JSON.parse(d.json); }catch(e){}
        if(o&&o.lo&&o.lo.A&&(!L.savedAt||String(d.savedAt||'')>String(L.savedAt||''))){
          o.v=3; for(var k in o) L[k]=o[k]; loadFix();
          try{ localStorage.setItem(LS_KEY,JSON.stringify(L)); }catch(e){}
          setPlan(myDays()); try{ MAP.replan(); }catch(e){} on=true; rerender(); showSaved(); return;
        }
        on=true; if(String(L.savedAt||'')>String(d.savedAt||'')) push();
      } else if(L.savedAt){ push(); }
      else on=true;
      showSaved();
    }catch(e){ doc=null; on=false; }
  }
  return {push:push,start:start,on:function(){return on;}};
})();

/* =========================================================
   Weather: what mid-to-late March has looked like on the escarpment, 2016–2025.
   Data: ERA5 reanalysis via Open-Meteo, two points on the escarpment (Mont-aux-Sources area at 3,000 m,
   Mafadi/Injasuti area at 3,200 m), 13 March – 2 April each year.
   ========================================================= */
var WX=__WX__;
function wxDate(i){ var d=new Date(Date.UTC(2027,2,13+i)); return d.getUTCDate()+' '+MON[d.getUTCMonth()]; }
function wxOpt(o,label,sub,cls){
  var yrs=o.years, mx=Math.max.apply(null,yrs.map(function(y){return y[1];}).concat([1]));
  return '<div class="card wx-opt '+cls+'"><div class="eyebrow">'+label+'</div><h3>'+sub+'</h3>'+
    '<div class="wx-kv">'+
      '<div><span>Day high</span><b>'+fmt(o.tmax,0)+' °C</b><small>average · warmest '+fmt(o.warmest,0)+' °C</small></div>'+
      '<div><span>Night low</span><b>'+fmt(o.tmin,0)+' °C</b><small>average · coldest '+fmt(o.coldest,1)+' °C</small></div>'+
      '<div><span>Rain days</span><b>'+o.wet+'%</b><small>of days with 1 mm or more</small></div>'+
      '<div><span>Heavy rain</span><b>'+o.heavy+'%</b><small>of days with 10 mm or more</small></div>'+
      '<div><span>Wet hours</span><b>'+fmt(o.wethrs,1)+' h</b><small>with rain, on an average day</small></div>'+
      '<div><span>Strong gusts</span><b>'+o.windy+'%</b><small>of days gusting 60 km/h+</small></div></div>'+
    '<h4>Rain over the ten trail days, year by year</h4>'+
    '<div class="wx-years" role="img" aria-label="Rain total over the trail days in each year">'+yrs.map(function(y){ return '<div title="'+y[0]+': '+y[1]+' mm, '+y[2]+' rain days"><i style="height:'+Math.max(3,y[1]/mx*64)+'px"></i><b class="mono">'+y[1]+'</b><span class="mono">’'+y[0].slice(2)+'</span></div>'; }).join('')+'</div>'+
    '<p class="note">Millimetres of rain across the trail days. Average '+o.rainTotal+' mm.</p></div>';
}
function wxChart(){
  var c=WX.curve, W=720, H=230, L=40, R=12, T=14, B=26, n=c.length, bw=(W-L-R)/n;
  var tmin=Math.min.apply(null,c.map(function(x){return x.cold;})), tmax=Math.max.apply(null,c.map(function(x){return x.tmax;}));
  var lo=Math.floor(Math.min(-2,tmin)/2)*2, hi=Math.ceil((tmax+1)/2)*2;
  function X(i){return L+bw*(i+0.5);} function Y(v){return T+(1-(v-lo)/(hi-lo))*(H-T-B);}
  var band=function(a,b,cls,lab){ return '<rect class="'+cls+'" x="'+(L+bw*a)+'" y="'+T+'" width="'+bw*(b-a+1)+'" height="'+(H-T-B)+'"/><text class="wx-bl" x="'+(L+bw*a+4)+'" y="'+(T+12)+'">'+lab+'</text>'; };
  var grid=''; for(var v=lo;v<=hi;v+=2){ grid+='<line class="wx-g" x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v)+'" y2="'+Y(v)+'"/><text class="wx-ax" x="'+(L-6)+'" y="'+(Y(v)+3)+'" text-anchor="end">'+v+'°</text>'; }
  var zero='<line class="wx-zero" x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(0)+'" y2="'+Y(0)+'"/>';
  var path=function(k){ return c.map(function(x,i){return (i?'L':'M')+X(i).toFixed(1)+','+Y(x[k]).toFixed(1);}).join(''); };
  var xl=c.map(function(x,i){ return i%3===0?'<text class="wx-ax" x="'+X(i)+'" y="'+(H-8)+'" text-anchor="middle">'+wxDate(i)+'</text>':''; }).join('');
  var dots=function(k,cls){ return c.map(function(x,i){ return '<circle class="'+cls+'" cx="'+X(i)+'" cy="'+Y(x[k])+'" r="3"><title>'+wxDate(i)+': '+fmt(x[k],1)+' °C</title></circle>'; }).join(''); };
  var temp='<svg viewBox="0 0 '+W+' '+H+'" class="wx-svg" role="img" aria-label="Average day high, night low and coldest night for each date">'+band(2,11,'wx-wa','Week of 15 Mar')+band(9,18,'wx-wb','Week of 22 Mar')+grid+zero+
    '<path class="wx-hi" d="'+path('tmax')+'"/><path class="wx-lo" d="'+path('tmin')+'"/><path class="wx-co" d="'+path('cold')+'"/>'+dots('tmax','wx-hid')+dots('tmin','wx-lod')+xl+'</svg>';
  var RH=130, RT=10, RB=24; function RY(p){return RT+(1-p/100)*(RH-RT-RB);}
  var rg=''; [0,50,100].forEach(function(p){ rg+='<line class="wx-g" x1="'+L+'" x2="'+(W-R)+'" y1="'+RY(p)+'" y2="'+RY(p)+'"/><text class="wx-ax" x="'+(L-6)+'" y="'+(RY(p)+3)+'" text-anchor="end">'+p+'%</text>'; });
  var bars=c.map(function(x,i){ var h=RY(0)-RY(x.wet); return '<rect class="wx-rain" x="'+(L+bw*i+2)+'" y="'+RY(x.wet)+'" width="'+(bw-4)+'" height="'+h+'" rx="2"><title>'+wxDate(i)+': rain on '+x.wet+'% of past days, '+fmt(x.pr,1)+' mm on average</title></rect>'; }).join('');
  var xl2=c.map(function(x,i){ return i%3===0?'<text class="wx-ax" x="'+X(i)+'" y="'+(RH-8)+'" text-anchor="middle">'+wxDate(i)+'</text>':''; }).join('');
  var rain='<svg viewBox="0 0 '+W+' '+RH+'" class="wx-svg" role="img" aria-label="Chance of a rain day for each date">'+rg+bars+xl2+'</svg>';
  return '<div class="card"><h3>Day by day, 13 March to 2 April</h3>'+
    '<div class="legend" style="margin:8px 0 2px"><span><i style="background:var(--sunset-gold)"></i>Average day high</span><span><i style="background:var(--c3)"></i>Average night low</span><span><i style="background:var(--ink-muted)"></i>Coldest night in ten years</span></div>'+
    '<div class="scroll">'+temp+'</div><h4 style="margin-top:10px">Chance of a rain day (1 mm or more)</h4><div class="scroll">'+rain+'</div></div>';
}
function vWeather(){
  var A=WX.A, B=WX.B, drier=A.wet>B.wet?'B':'A', colder=A.tmin>B.tmin?'B':'A';
  return '<div class="head" style="padding-top:12px"><div><h2>Weather</h2><p class="note">What the escarpment has been like on these dates over the last ten years (2016–2025), for the two start weeks in the dates poll. Figures are for 3,000–3,200 m, the height you spend most days at.</p></div></div>'+
    '<div class="card wx-take"><div class="eyebrow">In short</div><p>Expect cool days around <b>'+fmt((A.tmax+B.tmax)/2,0)+' °C</b>, nights around <b>'+fmt((A.tmin+B.tmin)/2,0)+' °C</b>, and rain on roughly half the days, mostly as afternoon showers. The week of 22 March has been <b>'+(drier==='B'?'drier':'wetter')+'</b> ('+B.wet+'% rain days against '+A.wet+'%, about '+B.rainTotal+' mm against '+A.rainTotal+' mm over the trail days) and '+(colder==='B'?'a little colder at night (coldest '+fmt(B.coldest,1)+' °C against '+fmt(A.coldest,1)+' °C)':'a little milder at night')+'. Both weeks have had very wet spells, as in 2018.</p>'+
    '<p class="note">Clear nights in sheltered hollows and on the high plateau get colder than these figures; plan your sleep system for frost.</p></div>'+
    '<div class="grid2">'+wxOpt(A,'Option 1','Trail 15–24 March','a')+wxOpt(B,'Option 2','Trail 22–31 March','b')+'</div>'+
    wxChart()+
    '<div class="card"><h3>What this means for packing</h3><ul class="wx-list">'+
      '<li><b>Rain gear every day.</b> Waterproof jacket and overtrousers, a pack liner, and a dry set of sleep clothes.</li>'+
      '<li><b>Nights near freezing.</b> A bag rated to about −5 °C comfort and an insulated mat (R 4 or more) cover the coldest nights seen.</li>'+
      '<li><b>Storms build in the afternoon.</b> Start early and aim to be off exposed ridges and passes by early afternoon. See <a href="#safety">Safety</a>.</li>'+
      '<li><b>Wind.</b> On about one day in ten gusts reached 60 km/h or more: pitch low and use every guyline.</li></ul></div>'+
    '<div class="card"><h3>Closer to the time</h3><p class="note">Ten years of history tells you what to pack, not what next week will bring. Check a mountain forecast for the escarpment a few days before the start, and again at Sentinel if you have signal.</p>'+
      '<div class="linkrow"><a href="https://www.yr.no" target="_blank" rel="noopener">yr.no ↗</a><a href="https://www.mountain-forecast.com" target="_blank" rel="noopener">mountain-forecast.com ↗</a><a href="https://www.weathersa.co.za" target="_blank" rel="noopener">SA Weather Service ↗</a></div>'+
      '<p class="note" style="margin-top:10px">Source: ERA5 reanalysis (ECMWF) via the Open-Meteo historical weather API, daily values for 13 March – 2 April, 2016–2025, at two escarpment points adjusted to 3,000 m and 3,200 m. Reanalysis smooths out thunderstorms and the coldest hollows, so treat extremes as a floor, not a ceiling.</p></div>';
}
/* =========================================================
   Safety: emergency contacts, who carries the safety kit, bail-out options by day, hazards, admin.
   Contacts checked against the Mountain Club of South Africa's emergency listing (correct as of January 2026)
   and UK FCDO travel advice for Lesotho, on 22 November 2026.
   ========================================================= */
var SAFE_NUM=[
  ['KZN mountain rescue (EMS)','0800 205 334','Primary line for a Drakensberg mountain rescue. Say “mountain rescue emergency”. Mountain Club of South Africa, January 2026.'],
  ['EMS duty cell','072 139 4091','If the primary line doesn\'t answer.'],
  ['South Africa, from a mobile','112','General emergency. Give province, mountain area and what happened.'],
  ['South Africa ambulance / police','10177 · 10111',''],
  ['Lesotho, all services','112','Most of the route is in Lesotho. South African short codes may not work there.'],
  ['Satellite SOS','inReach / satellite device','The only reliable link on large parts of the escarpment. Agree who carries it and test it before the trip.']];
var SAFE_BAIL=[
  [2,'Rwanqa Pass','Steep pass down to the Mnweni side; Fangs Cave, a few hundred metres down Fangs Pass, is emergency shelter only.'],
  [4,'Ship\'s Prow Pass','The highest pass on the route (3,300 m): very steep, loose rock. Only in good conditions.'],
  [6,'Langalibalele and Giant\'s Castle passes','Down to the Giant\'s Castle side.'],
  [7,'Lotheni Pass','Down to the Lotheni side; broad camping area at the top.'],
  [8,'Mkhomazi Pass','Campsite options at the top; down to the Mkhomazi side.'],
  [9,'Sani Pass road','The best bail-out on the route: road, border post (normally 06:00–18:00) and Sani Top, with food, a bar, showers and 4x4 transport down. The only resupply.'],
  [10,'Mzimkhulu and Mashai passes','Loose and steep; Mashai Shelter and campsite.'],
  [11,'Thamathu Pass','The final checkpoint, down towards Bushman\'s Nek.']];
function safeWho(id){ try{ return GG.who(id); }catch(e){ return null; } }
function vSafety(){
  var kit=[['g56','Satellite communicator'],['g59','Group first-aid kit'],['g60','Emergency bivvy bag'],['g54','Map set, 1:50,000'],['g55','Compass']];
  var kitRows=kit.map(function(k){ var w=safeWho(k[0]); return '<div class="sum-row"><span>'+k[1]+'</span><b>'+(w==null?'<span class="note">sign in to see</span>':w.length?esc(w.join(', ')):'<span class="pill bad">Nobody yet</span>')+'</b></div>'; }).join('');
  var bail=(D.bail||[]).map(function(b){ var st=0; PLAN.stages.forEach(function(g,i){ if(b.km>=g.from&&b.km<=g.to) st=i+1; }); return '<tr><td class="mono">'+(st?'Day '+st:'')+'<span class="sub">km '+fmt(b.km,0)+'</span></td><td><b>'+esc(b.n)+'</b><span class="sub">'+esc(b.note)+' Rough way down about '+fmt(b.len,1)+' km to around '+fmt(b.end)+' m.</span></td></tr>'; }).join('');
  return '<div class="head" style="padding-top:12px"><div><h2>Safety</h2><p class="note">Who to call, who carries what, how to get off the escarpment, and what to sort before leaving home. Save the numbers in your phone and on paper; there\'s no signal on much of the route.</p></div></div>'+
    '<div class="grid2">'+
      '<div class="card"><div class="eyebrow">Emergency numbers</div><h3>Who to call</h3><div class="sos">'+SAFE_NUM.map(function(n){ return '<div><span>'+esc(n[0])+'</span><b class="mono">'+esc(n[1])+'</b>'+(n[2]?'<small>'+esc(n[2])+'</small>':'')+'</div>'; }).join('')+'</div>'+
        '<button class="btn" data-act="sos-copy" style="margin-top:10px">Copy the numbers</button><span class="msg" id="sos-msg"></span>'+
        '<p class="note" style="margin-top:8px">Sources: <a href="https://mcsa.org.za/activities/mountain-rescue/emergency-phone-numbers/" target="_blank" rel="noopener">Mountain Club of South Africa</a>, <a href="https://www.gov.uk/foreign-travel-advice/lesotho/getting-help" target="_blank" rel="noopener">UK travel advice for Lesotho</a>. Check them again a week before you leave.</p></div>'+
      '<div class="card"><div class="eyebrow">On the call</div><h3>What to say</h3><p class="sos-say">“This is a <b>Drakensberg mountain rescue emergency</b> near <b>[landmark]</b>. <b>[Number]</b> people need help because <b>[what happened]</b>. Our coordinates are <b>[read them out]</b>. My callback number is <b>[number]</b>.”</p>'+
        '<ul class="wx-list"><li>Give the injured person\'s position, not the caller\'s, if they differ.</li><li>Read coordinates exactly as your device shows them and ask for them to be read back.</li><li>Stay put once you\'ve given a position; tell rescue before moving.</li><li>Keep one phone free for the callback and save its battery.</li></ul>'+
        '<h4>Safety kit and who carries it</h4>'+kitRows+'<p class="note">From <a href="#group">Who brings what</a>.</p></div>'+
    '</div>'+
    '<div class="card"><div class="eyebrow">Getting off the escarpment</div><h3>Bail-out options</h3><p class="note">Passes along the route, with the day of your current '+N+'-day plan they fall on. They\'re on the <a href="#route">Route map</a> as red markers with a dashed rough way down, worked out from the terrain rather than a mapped path. Before the trip, mark each one on the Slingsby maps and check where it comes out and how you\'d get a lift from there: some lead into remote valleys far from a road.</p>'+
      '<div class="scroll"><table class="t"><tbody>'+bail+'</tbody></table></div></div>'+
    '<div class="grid2">'+
      '<div class="card"><h3>Hazards to plan for</h3><ul class="wx-list">'+
        '<li><b>Lightning.</b> Afternoon storms are common in March. Start early, be off ridges and passes by early afternoon, and spread out if caught in the open.</li>'+
        '<li><b>Mist and navigation.</b> Visibility can drop to metres. Carry the GPX on two devices plus map and compass, and know the day\'s line before it closes in.</li>'+
        '<li><b>Cold and wet.</b> Hypothermia is the main risk on wet, windy days. Stop early, get into the tent and dry clothes.</li>'+
        '<li><b>Rivers after rain.</b> Streams rise fast. Wait for them to drop rather than cross in spate.</li>'+
        '<li><b>Dogs at herders\' kraals.</b> They can be territorial. Stay calm, don\'t run, keep the group together; shepherds usually call them off.</li>'+
        '<li><b>Gear left outside.</b> Hikers have lost boots and jackets left outside tents overnight. Keep everything inside.</li></ul></div>'+
      '<div class="card"><h3>Before you leave home</h3><ul class="wx-list">'+
        '<li><b>Ezemvelo KZN Wildlife permit for the whole traverse</b>, bought in advance at a Drakensberg Ezemvelo office (for example Royal Natal). Rescue may ask for proof.</li>'+
        '<li><b>Witsieshoek permit</b> for the Sentinel path and chain ladders, sold at Witsieshoek or Sentinel Car Park.</li>'+
        '<li><b>Mountain rescue register</b> filled in at the start, and signed out at the end.</li>'+
        '<li><b>Passports.</b> Most of the route is in Lesotho and you finish at a border post.</li>'+
        '<li><b>Travel insurance</b> that covers mountain rescue and helicopter evacuation in South Africa and Lesotho.</li>'+
        '<li><b>Trip plan with someone at home</b>: route, camps, group list and the time to raise the alarm.</li>'+
        '<li><b>Offline maps and the GPX</b> on at least two phones; practise reading your coordinates.</li></ul>'+
        '<p class="note">Sources: <a href="https://community.hikingsouthafrica.co.za/t/drakensberg-grand-traverse-permits-and-maps/4167" target="_blank" rel="noopener">Hiking South Africa forum</a>, <a href="https://drakensberghikes.com/drakensberg-mountain-rescue-emergency-contacts" target="_blank" rel="noopener">Drakensberg Hikes</a>. Permits and fees change: confirm with Ezemvelo before you go.</p></div>'+
    '</div>';
}
/* =========================================================
   Group & travel: who's coming and how they get to Johannesburg. Shared: people/<person> {...}
   ========================================================= */
var PEOPLE=(function(){
  var NAME_KEY='dgt-poll-name', col=null, rows=[], state='loading', ro=false, canDel=false, msg='', msgCls='';
  var F=[['from','Travelling from','e.g. Berlin'],['inDate','Lands in Johannesburg','','date'],['inTime','Landing time','','time'],['inFlight','Flight in','e.g. LH 572'],
    ['outDate','Leaves Johannesburg','','date'],['outTime','Departure time','','time'],['outFlight','Flight out',''],['notes','Notes','e.g. can drive; arriving a day early']];
  var form={}; try{ form.name=localStorage.getItem(NAME_KEY)||''; }catch(e){ form.name=''; }
  function slug(s){ return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40); }
  function str(v,n){ return String(v==null?'':v).slice(0,n); }
  function clean(d,id){ d=d||{}; var o={id:id,name:str(d.name,40)}; F.forEach(function(f){ o[f[0]]=str(d[f[0]],f[0]==='notes'?200:40); }); o.lift=d.lift==='yes'?'yes':d.lift==='no'?'no':''; o.status=['in','maybe','out'].indexOf(d.status)>=0?d.status:'in'; return o; }
  function mine(){ var s=slug(form.name); return s?rows.filter(function(r){return r.id===s;})[0]:null; }
  function load(){ var r=mine(); if(r){ F.forEach(function(f){ form[f[0]]=r[f[0]]; }); form.lift=r.lift; form.status=r.status; } }
  function iso2(d){ return /^\d{4}-\d{2}-\d{2}$/.test(d)?d:''; }
  function summary(){
    if(state!=='ok') return '<p class="note">'+(state==='loading'?'Loading the group…':state==='err'?'Couldn\'t load the group list just now.':'The group list is shown to people signed in to Claude.')+'</p>';
    if(!rows.length) return '<p class="note">Nobody has added themselves yet.</p>';
    var going=rows.filter(function(r){return r.status!=='out';}), ins=going.map(function(r){return iso2(r.inDate);}).filter(Boolean).sort(), lifts=going.filter(function(r){return r.lift==='yes';}).length;
    var tiles='<div class="adv-sum"><div><span>Coming</span><b>'+rows.filter(function(r){return r.status==='in';}).length+'</b><small>'+rows.filter(function(r){return r.status==='maybe';}).length+' maybe</small></div>'+
      '<div><span>Arrivals</span><b>'+(ins.length?esc(short(ins[0]))+(ins.length>1&&ins[ins.length-1]!==ins[0]?' – '+esc(short(ins[ins.length-1])):''):'—')+'</b><small>'+ins.length+' of '+going.length+' flights known</small></div>'+
      '<div><span>Need a lift</span><b>'+lifts+'</b><small>from Johannesburg to the Berg</small></div>'+
      (TS()?'<div><span>Trail starts</span><b>'+esc(short(TS()))+'</b><small>at Sentinel Car Park</small></div>':'')+'</div>';
    var list=rows.slice().sort(function(a,b){ return (iso2(a.inDate)||'9')+a.inTime<(iso2(b.inDate)||'9')+b.inTime?-1:1; });
    var late=TS()?list.filter(function(r){ return r.status!=='out'&&iso2(r.inDate)&&daysBetween(r.inDate,TS())<2; }):[];
    var warn=late.length?'<p class="warnbox">'+esc(late.map(function(r){return r.name;}).join(', '))+(late.length>1?' land':' lands')+' less than two days before the trail starts. The drive from Johannesburg to the Berg takes most of a day.</p>':'';
    var table='<div class="scroll"><table class="t pp"><thead><tr><th>Who</th><th>From</th><th>Lands in Jo\'burg</th><th>Leaves</th><th>Lift</th>'+(canDel?'<th></th>':'')+'</tr></thead><tbody>'+list.map(function(r){
      return '<tr class="'+r.status+'"><td><b>'+esc(r.name)+'</b>'+(r.status!=='in'?' <span class="pill '+(r.status==='out'?'bad':'warn')+'">'+(r.status==='out'?'not coming':'maybe')+'</span>':'')+(r.notes?'<span class="sub">'+esc(r.notes)+'</span>':'')+'</td>'+
        '<td>'+esc(r.from)+'</td><td class="mono">'+(iso2(r.inDate)?esc(short(r.inDate)):'')+(r.inTime?' '+esc(r.inTime):'')+(r.inFlight?'<span class="sub">'+esc(r.inFlight)+'</span>':'')+'</td>'+
        '<td class="mono">'+(iso2(r.outDate)?esc(short(r.outDate)):'')+(r.outTime?' '+esc(r.outTime):'')+(r.outFlight?'<span class="sub">'+esc(r.outFlight)+'</span>':'')+'</td>'+
        '<td>'+(r.lift==='yes'?'Needs one':r.lift==='no'?'Sorted':'')+'</td>'+(canDel?'<td><button class="x2" data-ppdel="'+esc(r.id)+'" aria-label="Remove '+esc(r.name)+'">×</button></td>':'')+'</tr>'; }).join('')+'</tbody></table></div>';
    return tiles+warn+table;
  }
  function formHTML(){
    var can=state==='ok'&&!ro, r=mine();
    if(!can) return '<p class="note">'+(state==='loading'?'Connecting…':ro?'Your access to this page is view-only, so you can see the group but not add yourself here. Send your details to Leon.':'Adding yourself needs a Claude sign-in. Without one, send your travel details to the group chat.')+'</p>';
    var seg=function(k,opts){ return '<div class="seg" role="group">'+opts.map(function(o){ return '<button type="button" data-ppseg="'+k+':'+o[0]+'" aria-pressed="'+((form[k]||(k==='status'?'in':''))===o[0])+'">'+o[1]+'</button>'; }).join('')+'</div>'; };
    return '<div class="pp-form"><h4>'+(r?'Your details':'Add yourself')+'</h4><div class="fields">'+
      '<label class="field">Your name<input list="dgt-names" autocomplete="off" class="pl-name pp-name" maxlength="40" value="'+esc(form.name||'')+'" placeholder="First name"></label>'+
      F.map(function(f){ return '<label class="field"'+(f[0]==='notes'?' style="grid-column:1/-1"':'')+'>'+f[1]+'<input data-pp="'+f[0]+'" type="'+(f[3]||'text')+'" maxlength="'+(f[0]==='notes'?200:40)+'" value="'+esc(form[f[0]]||'')+'" placeholder="'+esc(f[2]||'')+'"></label>'; }).join('')+'</div>'+
      '<div class="toolbar" style="margin-top:10px"><span class="note" style="margin:0">Coming?</span>'+seg('status',[['in','Yes'],['maybe','Maybe'],['out','No']])+'<span class="note" style="margin:0 0 0 8px">Lift to the Berg?</span>'+seg('lift',[['yes','Need one'],['no','Sorted']])+'</div>'+
      '<div class="toolbar" style="margin-top:10px"><button class="btn primary" data-ppsave>'+(r?'Update':'Add me')+'</button></div><p class="msg '+msgCls+'" data-ppmsg>'+esc(msg)+'</p>'+
      '<p class="note">Everyone with access to this page can see these details. Don\'t add passport numbers or anything private.</p></div>';
  }
  function view(){
    return '<div class="head" style="padding-top:12px"><div><h2>Group &amp; travel</h2><p class="note">Who\'s coming, when they land in Johannesburg and who needs a lift to the mountains. Shared with the group.</p></div></div>'+
      (datesOn()?'':'<p class="warnbox">Hold off on flights: the trail dates are confirmed once the dates poll is locked in. Add your flights here after that.</p>')+
      '<div class="card"><div data-ppsum>'+summary()+'</div></div><div class="card" data-ppform>'+formHTML()+'</div>'+
      '<div class="card"><h3>Getting to the start</h3><ul class="wx-list"><li>The trail starts at <b>Sentinel Car Park</b> above Witsieshoek, reached by road through Phuthaditjhaba in the Free State.</li><li>Allow most of a day for the drive from Johannesburg, and aim to sleep near Witsieshoek the night before Day 1.</li><li>The finish is at <b>Bushman\'s Nek</b>, far to the south: book the shuttle back early (see <a href="#trip">Dates &amp; bookings</a>).</li></ul></div>';
  }
  function paint(){ document.querySelectorAll('[data-ppsum]').forEach(function(el){ el.innerHTML=summary(); }); }
  function paintForm(){ document.querySelectorAll('[data-ppform]').forEach(function(el){ el.innerHTML=formHTML(); }); }
  function say(t,c){ msg=t; msgCls=c||''; document.querySelectorAll('[data-ppmsg]').forEach(function(el){ el.textContent=t; el.className='msg '+(c||''); }); }
  function bind(){
    document.addEventListener('input',function(e){ var t=e.target;
      if(t.dataset&&t.dataset.pp){ form[t.dataset.pp]=t.value; }
      if(t.classList&&t.classList.contains('pp-name')){ form.name=t.value; var r=mine(); if(r){ load(); clearTimeout(bind.t); bind.t=setTimeout(function(){ var a=document.activeElement, p=a&&a.selectionStart; paintForm(); var n=document.querySelector('.pp-name'); if(n){ n.focus(); try{ n.setSelectionRange(p,p); }catch(_){} } },400); } }
      else if(t.classList&&t.classList.contains('pl-name')){ form.name=t.value; } });
    document.addEventListener('click',function(e){ var b;
      if((b=e.target.closest('[data-ppseg]'))){ var p=b.dataset.ppseg.split(':'); form[p[0]]=p[1]; b.parentNode.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed',String(x===b)); }); return; }
      if(e.target.closest('[data-ppsave]')){ var name=(form.name||'').trim(), id=slug(name); if(!id){ say('Add your name first.','bad'); return; }
        var o={name:name,lift:form.lift||'',status:form.status||'in',at:new Date().toISOString()}; F.forEach(function(f){ o[f[0]]=str(form[f[0]],f[0]==='notes'?200:40).trim(); });
        col.doc(id).set(o).then(function(){ try{ localStorage.setItem(NAME_KEY,name); }catch(_){} say('Saved. Thanks, '+name+'!','ok'); },function(err){ say(err&&err.code==='invalid_argument'?'You don\'t have permission to save here.':'Couldn\'t save just now. Try again in a moment.','bad'); }); return; }
      if((b=e.target.closest('[data-ppdel]'))&&col){ col.doc(b.dataset.ppdel).delete().catch(function(){}); } });
  }
  async function start(){
    bind();
    var to=setTimeout(function(){ if(state==='loading'){ state='nodb'; paint(); paintForm(); } },11000);
    try{
      if(!window.claude||!claude.use){ clearTimeout(to); state='nodb'; paint(); paintForm(); return; }
      var db=await claude.use('db'); clearTimeout(to); if(!db){ state='nodb'; paint(); paintForm(); return; }
      col=db.collection('people');
      col.onSnapshot(function(q){ rows=q.docs.filter(function(d){return d.exists;}).map(function(d){return clean(d.data(),d.id);}).filter(function(r){return r.name;});
        var first=state!=='ok'; state='ok'; if(first){ load(); paintForm(); } paint(); ME.refresh(); },function(){ state='err'; paint(); paintForm(); });
      try{ var u=await claude.use('user'); if(u){ if(await u.canEdit()){ canDel=true; paint(); } if(u.can&&(await u.can('data.write'))===false){ ro=true; paintForm(); } } }catch(e){}
    }catch(e){ state='nodb'; paint(); paintForm(); }
  }
  return {view:view,start:start,count:function(){ return rows.length; },mine:function(){ return state==='ok'?(mine()||false):null; }};
})();

/* =========================================================
   Start
   ========================================================= */
shell(); bind();
var h0=parseHash(); show(h0.v,h0.day);
POLL.start();
GG.start();
window.DGT_SYNC=SYNC;
SYNC.start();
PEOPLE.start(); FOOD.start();
(async function(){
  try{ if(!window.claude||!claude.use) return; var u=await claude.use('user');
    if(u&&await u.canEdit()){ canEdit=true; if(view==='trip'&&!editing) rerender(); } }catch(e){}
})();
})();
