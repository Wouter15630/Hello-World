// build.mjs — merge every data source into ONE self-contained dist/index.html.
// No runtime dependencies, no API calls, everything (data, photos, CSS, JS) inlined.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(root, p), 'utf8');
const rj = (p) => JSON.parse(rd(p));

// ---- inputs -------------------------------------------------------------
const config = rj('config.json');
const seed = rj('data/places.seed.json');
const live = rj('data/places.live.json');
const routes = rj('data/routes.json');
const photos = existsSync(join(root, 'data/photos.manifest.json')) ? rj('data/photos.manifest.json') : {};
const credits = existsSync(join(root, 'photos/commons/credits.json')) ? rj('photos/commons/credits.json') : {};
const packs = { en: rj('i18n/en.json'), nl: rj('i18n/nl.json'), de: rj('i18n/de.json'), it: rj('i18n/it.json') };

// ---- merge places by id -------------------------------------------------
const places = seed.places.map((s) => {
  const l = live.places[s.id] || {};
  const r = routes.routes[s.id] || {};
  return {
    id: s.id, cat: s.cat, name: s.name,
    rating: l.rating ?? null, votes: l.votes ?? null, price: l.price ?? null,
    phone: l.phone ?? null, hours: l.hours ?? null, bs: l.businessStatus || 'OPERATIONAL',
    km: r.km ?? null, min: r.min ?? null, brg: r.brg ?? null,
    maps: s.maps, nav: s.nav, photo: !!photos[s.id],
  };
});
// English place text lives in the seed; give i18n.en a matching .places map so
// the client can always read DATA.i18n[lang].places[id] uniformly.
packs.en.places = Object.fromEntries(seed.places.map((s) => [s.id, { sub: s.sub, note: s.note, flag: s.flag }]));

// Practical-item labels, injected into every pack (kept out of the AI-translated
// packs to avoid drift). The client reads L.practicals.<key>.
const practicalLabels = {
  en: { emergency: 'Emergency (all services)', pharmacy: 'Nearest pharmacy', hospital: 'Nearest hospital', shop: 'Village shop', fuel: 'Nearest fuel', cash: 'Nearest cash machine' },
  nl: { emergency: 'Noodgeval (alle diensten)', pharmacy: 'Dichtstbijzijnde apotheek', hospital: 'Dichtstbijzijnde ziekenhuis', shop: 'Dorpswinkel', fuel: 'Dichtstbijzijnd tankstation', cash: 'Dichtstbijzijnde geldautomaat' },
  de: { emergency: 'Notruf (alle Dienste)', pharmacy: 'Nächste Apotheke', hospital: 'Nächstes Krankenhaus', shop: 'Dorfladen', fuel: 'Nächste Tankstelle', cash: 'Nächster Geldautomat' },
  it: { emergency: 'Emergenze (tutti i servizi)', pharmacy: 'Farmacia più vicina', hospital: 'Ospedale più vicino', shop: 'Negozio del paese', fuel: 'Distributore più vicino', cash: 'Bancomat più vicino' },
};
for (const k of Object.keys(packs)) Object.assign(packs[k].practicals, practicalLabels[k]);

// Short label for the sticky-bar clock ("Italy" / "Italië" / ...).
const clockLabel = { en: 'Italy', nl: 'Italië', de: 'Italien', it: 'Italia' };
for (const k of Object.keys(packs)) packs[k].ui.clockLabel = clockLabel[k];

// Checked date, formatted per language at runtime; pass ISO + a friendly default.
const checkedISO = live.checkedAt;

// Some Commons uploaders stuff a wall of licence boilerplate into the Artist
// field. Keep just the name/handle.
function cleanAuthor(raw) {
  let a = String(raw || '').replace(/\s+/g, ' ').trim();
  a = a.split(/(?:Create the proper|You are free|This file is licensed|Attribution:|CC BY|CC0)/i)[0].trim();
  a = a.replace(/[·|,;]\s*$/, '').trim();
  if (a.length > 60) a = a.slice(0, 57).replace(/\s\S*$/, '') + '…';
  return a || 'Wikimedia Commons contributor';
}
const cleanCredits = Object.fromEntries(Object.entries(credits).map(([k, c]) => [k, { ...c, author: cleanAuthor(c.author) }]));

const DATA = {
  places,
  i18n: packs,
  meta: {
    checkedAt: checkedISO,
    house: config.house,
    host: config.host,
    wifi: config.wifi,
    practicals: config.practicals,
    credits: cleanCredits,
  },
};

// ---- opennow module, inlined (strip ESM exports) ------------------------
const openNowSrc = rd('scripts/opennow.mjs').replace(/^export\s+/gm, '');

// ---- helpers ------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- CSS ----------------------------------------------------------------
const css = /* css */ `
:root{
  --notte:#01271A; --bosco:#034325; --foglia:#0A5231; --crema:#FEE7C2;
  --oro:#E9B949; --mare:#8BB6C6;
  --line:rgba(254,231,194,.14); --dim:rgba(254,231,194,.62); --faint:rgba(254,231,194,.42);
  --cat-see:#8BB6C6; --cat-lunch:#E9B949; --cat-dinner:#FEE7C2; --cat-easy:#79B58C;
  --disp:'Bodoni Moda','Didot','Bodoni MT',Georgia,'Times New Roman',serif;
  --body:'Poppins',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --mono:'DM Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{margin:0;background:var(--notte);color:var(--crema);font-family:var(--body);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden}
h1,h2,h3{font-family:var(--disp);font-weight:600;line-height:1.05;margin:0}
a{color:inherit}
.mono{font-family:var(--mono)}
.wrap{max-width:1180px;margin:0 auto;padding:0 18px}
.rule{height:1px;background:var(--line);border:0;margin:0}
:focus-visible{outline:2px solid var(--oro);outline-offset:2px;border-radius:3px}
.skip{position:absolute;left:-9999px;top:0;background:var(--crema);color:var(--notte);padding:8px 14px;z-index:100}
.skip:focus{left:8px;top:8px}

/* hero */
.hero{position:relative;min-height:78vh;display:flex;flex-direction:column;justify-content:flex-end;padding:0 0 34px;overflow:hidden}
.hero-bg{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.02)}
.hero-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(1,39,26,.55) 0%,rgba(1,39,26,.35) 42%,rgba(1,39,26,.92) 100%)}
.hero-in{position:relative;z-index:1}
.hero .kick{font-family:var(--mono);text-transform:uppercase;letter-spacing:.28em;font-size:11px;color:var(--crema);opacity:.85;margin-bottom:14px}
.hero h1{font-size:clamp(58px,20vw,150px);letter-spacing:-.01em}
.hero h1 .it{font-style:italic;display:block;font-weight:500}
.hero .tag{margin-top:12px;font-size:clamp(15px,4.6vw,21px);color:var(--crema);max-width:22ch}
.hstats{display:flex;gap:26px;margin-top:26px;flex-wrap:wrap}
.hstat{display:flex;flex-direction:column}
.hstat b{font-family:var(--mono);font-size:26px;font-weight:500;line-height:1}
.hstat span{font-size:12px;color:var(--dim);margin-top:4px;text-transform:lowercase;letter-spacing:.04em}
.hstat.on b{color:var(--oro)}

/* section frame */
.sec{padding:52px 0}
.sec-tag{font-family:var(--mono);font-size:12px;letter-spacing:.2em;color:var(--faint);text-transform:uppercase}
.sec h2{font-size:clamp(30px,7vw,46px);margin:8px 0 10px}
.sec .lede{max-width:56ch;color:var(--dim);font-size:15px}

/* compass */
.bussola{display:grid;grid-template-columns:1fr;gap:22px;margin-top:26px}
@media(min-width:840px){.bussola{grid-template-columns:minmax(0,440px) 1fr;align-items:start}}
.bussola-fig{width:100%;max-width:440px;margin:0 auto}
svg .bussola-ring{fill:none;stroke:var(--line)}
svg .bussola-spoke{stroke:var(--line);stroke-width:1}
svg .bussola-rlabel{fill:var(--faint);font-family:var(--mono);font-size:9px}
svg .bussola-clabel{fill:var(--mare);font-family:var(--mono);font-size:10px;letter-spacing:.14em}
svg .bussola-house{fill:var(--crema)}
svg .bussola-htext{fill:var(--crema);font-family:var(--mono);font-size:9px;letter-spacing:.12em}
svg .bussola-dot{cursor:pointer;transition:r .18s ease,opacity .18s ease;stroke:rgba(1,39,26,.55);stroke-width:1}
svg .bussola-dot:focus-visible{outline:none;stroke:var(--crema);stroke-width:1.6}
.readout{border:1px solid var(--line);border-radius:4px;padding:18px 18px 16px;min-height:200px;background:rgba(10,82,49,.28)}
.readout .now{font-family:var(--mono);font-size:11px;letter-spacing:.14em;color:var(--dim);text-transform:uppercase;margin-bottom:14px}
.digest-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--line);align-items:baseline}
.digest-row:first-of-type{border-top:0}
.digest-row .k{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--faint);text-transform:uppercase}
.digest-row .v{font-family:var(--disp);font-size:19px}
.digest-row .m{font-family:var(--mono);font-size:13px;color:var(--dim);white-space:nowrap}
.rdo-name{font-family:var(--disp);font-size:24px;margin-bottom:2px}
.rdo-sub{color:var(--dim);font-size:13px;margin-bottom:12px}
.rdo-line{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.rdo-note{font-size:14px;color:var(--crema);opacity:.9}
.rdo-back{margin-top:12px;font-family:var(--mono);font-size:12px;color:var(--faint);background:none;border:0;padding:0;cursor:pointer}
.legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:14px;font-family:var(--mono);font-size:11px;color:var(--dim)}
.legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}

/* sticky bar */
.bar{position:sticky;top:0;z-index:40;background:rgba(1,39,26,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.bar-in{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:11px 18px;max-width:1180px;margin:0 auto}
.chip{font-family:var(--mono);font-size:12.5px;color:var(--crema);background:transparent;border:1px solid var(--line);border-radius:999px;padding:6px 13px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s}
.chip:hover{border-color:var(--dim)}
.chip[aria-pressed="true"]{background:var(--oro);color:var(--notte);border-color:var(--oro)}
.chip.cat[aria-pressed="true"]{background:var(--crema);border-color:var(--crema)}
.bar .sep{width:1px;height:22px;background:var(--line)}
.bar .clock{font-family:var(--mono);font-size:12.5px;color:var(--dim);white-space:nowrap}
.bar .count{font-family:var(--mono);font-size:12.5px;color:var(--oro);margin-left:auto;white-space:nowrap}
.search{font-family:var(--mono);font-size:12.5px;color:var(--crema);background:transparent;border:1px solid var(--line);border-radius:999px;padding:6px 13px;min-width:130px}
.search::placeholder{color:var(--faint)}
.langs{display:flex;gap:2px}
.lang{font-family:var(--mono);font-size:12px;color:var(--faint);background:none;border:0;padding:4px 6px;cursor:pointer;border-radius:3px}
.lang[aria-pressed="true"]{color:var(--oro);font-weight:600}

/* cards */
.cards{display:grid;grid-template-columns:1fr;gap:14px;margin-top:24px}
@media(min-width:720px){.cards{grid-template-columns:1fr 1fr}}
.card{display:flex;gap:0;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--foglia);scroll-margin-top:80px}
.card.flash{animation:flash 1.1s ease}
@keyframes flash{0%,100%{box-shadow:0 0 0 0 rgba(233,185,73,0)}18%{box-shadow:0 0 0 2px var(--oro)}}
@media (prefers-reduced-motion:reduce){.card.flash{animation:none;box-shadow:0 0 0 2px var(--oro)}}
.card-photo{flex:0 0 96px;width:96px;background:var(--bosco);position:relative}
@media(min-width:480px){.card-photo{flex-basis:132px;width:132px}}
.card-photo img{width:100%;height:100%;object-fit:cover;display:block}
.card-tile{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:var(--disp);font-size:64px;color:rgba(254,231,194,.16);background:var(--foglia)}
.card-body{flex:1;min-width:0;padding:13px 14px 12px}
.card-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.card-name{font-size:20px}
.card-rating{font-family:var(--mono);font-size:13px;color:var(--oro);white-space:nowrap;flex-shrink:0}
.card-rating small{color:var(--faint)}
.card-sub{font-family:var(--mono);font-size:11.5px;color:var(--faint);margin:2px 0 9px;text-transform:uppercase;letter-spacing:.05em}
.pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px}
.pill{font-family:var(--mono);font-size:11.5px;padding:3px 8px;border-radius:999px;border:1px solid var(--line);color:var(--dim);white-space:nowrap}
.pill.state.open{background:rgba(121,181,140,.18);color:#B7E0C4;border-color:rgba(121,181,140,.4)}
.pill.state.opens{background:rgba(233,185,73,.16);color:var(--oro);border-color:rgba(233,185,73,.4)}
.pill.state.closed{color:var(--faint)}
.pill.state.unknown{color:var(--faint);font-style:italic}
.pill.state.perm{background:rgba(200,90,70,.18);color:#E7A794;border-color:rgba(200,90,70,.4)}
.card-note{font-size:14px;margin:0 0 8px}
.card-flag{font-size:13px;color:var(--oro);margin:0 0 9px;display:flex;gap:6px}
.card-flag::before{content:"\\2691";flex-shrink:0}
.hours{margin:2px 0 11px;border-top:1px solid var(--line)}
.hours summary{font-family:var(--mono);font-size:12px;color:var(--dim);padding:8px 0 0;cursor:pointer;list-style:none}
.hours summary::-webkit-details-marker{display:none}
.hours summary::before{content:"+ ";color:var(--faint)}
.hours[open] summary::before{content:"– "}
.htable{font-family:var(--mono);font-size:12px;margin:8px 0 2px;width:100%;border-collapse:collapse}
.htable td{padding:2px 0;color:var(--dim);vertical-align:top}
.htable td.d{width:38px;color:var(--faint)}
.htable tr.now td{color:var(--crema)}
.htable tr.now td.d{color:var(--oro)}
.actions{display:flex;gap:8px;margin-top:2px}
.btn{font-family:var(--mono);font-size:13px;text-decoration:none;padding:8px 14px;border-radius:4px;background:var(--oro);color:var(--notte);font-weight:600;flex:1;text-align:center;transition:opacity .15s}
.btn:hover{opacity:.9}
.btn.ghost{background:transparent;color:var(--crema);border:1px solid var(--line);font-weight:400}
.is-hidden{display:none!important}
.empty{color:var(--faint);font-size:14px;padding:8px 0}

/* practicals */
.prac{display:grid;grid-template-columns:1fr;gap:12px;margin-top:24px}
@media(min-width:640px){.prac{grid-template-columns:1fr 1fr}}
.pcard{border:1px solid var(--line);border-radius:6px;padding:15px 16px;background:rgba(10,82,49,.22)}
.pcard .pk{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.pcard .pv{font-family:var(--disp);font-size:22px;margin:5px 0 3px}
.pcard .pn{font-size:13px;color:var(--dim)}
.pcard a.pv{text-decoration:none;color:var(--oro)}
.pcard .todo{color:var(--oro);font-style:italic}
.big{grid-column:1/-1;text-align:center;background:rgba(233,185,73,.1);border-color:rgba(233,185,73,.35)}
.big .pv{font-size:38px;color:var(--oro)}

/* footer */
footer{padding:44px 0 64px;border-top:1px solid var(--line);margin-top:20px}
footer .fnote{color:var(--dim);font-size:14px;max-width:60ch}
footer .checked{font-family:var(--mono);color:var(--oro);font-size:13px;margin-bottom:10px}
footer .credits{margin-top:20px;font-size:11.5px;color:var(--faint);line-height:1.7}
footer .credits a{color:var(--dim)}
noscript .ns{padding:16px;border:1px solid var(--oro);border-radius:6px;margin:16px 0;color:var(--crema)}
`;

// ---- client app ---------------------------------------------------------
const app = /* js */ `
${openNowSrc}
const DATA = __DATA__;
const PHOTOS = __PHOTOS__;
const CAT_ORDER = ['see','lunch','dinner','easy'];

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const SVGNS='http://www.w3.org/2000/svg';
function svg(name,attrs){const e=document.createElementNS(SVGNS,name);for(const k in attrs)e.setAttribute(k,attrs[k]);return e;}
function tpl(str,vars){return String(str).replace(/\\{(\\w+)\\}/g,(_,k)=>vars[k]!=null?vars[k]:'');}

let lang = detectLang();
const filters = { open:false, near:0, cats:new Set(), q:'' };

function detectLang(){
  let saved=null; try{saved=localStorage.getItem('ap_lang');}catch(e){}
  if(saved&&DATA.i18n[saved])return saved;
  const n=(navigator.language||'en').slice(0,2).toLowerCase();
  return DATA.i18n[n]?n:'en';
}
function L(){return DATA.i18n[lang];}
function txt(id){return L().places[id]||{};}

const sortedPlaces = DATA.places.slice().sort((a,b)=>{
  const am=a.min==null?1e9:a.min, bm=b.min==null?1e9:b.min; return am-bm;
});

// ---- open state helpers ----
function nowRome(){return romeNow();}
function stateOf(p){
  if(p.bs==='CLOSED_PERMANENTLY')return{state:'perm'};
  const n=nowRome(); return openState(p.hours,n.day,n.minutes);
}
function stateLabel(st){
  const u=L().ui;
  if(st.state==='open')return{cls:'open',txt:u.openNow};
  if(st.state==='opens')return{cls:'opens',txt:tpl(u.opensAt,{t:fmtMinutes(st.at)})};
  if(st.state==='closed')return{cls:'closed',txt:u.closedToday};
  if(st.state==='perm')return{cls:'perm',txt:u.closedPermanently};
  return{cls:'unknown',txt:u.hoursUnknown};
}

// ---- rendering ----
function photoFor(p){
  if(PHOTOS[p.id])return '<div class="card-photo"><img loading="lazy" decoding="async" alt="" src="'+PHOTOS[p.id]+'"></div>';
  const initial=(p.name||'?').replace(/^["\\'\\u2019]/,'').charAt(0).toUpperCase();
  return '<div class="card-photo"><div class="card-tile" aria-hidden="true">'+initial+'</div></div>';
}
function hoursTable(p){
  const days=L().ui.days; const today=nowRome().day; let rows='';
  for(let i=0;i<7;i++){
    const h=p.hours?p.hours[i]:null; let cell;
    if(h==null)cell='—'; else if(h.length===0)cell=L().ui.closedToday.replace(/ .*/,'')||'—';
    else cell=h.map(fmtInterval).join(', ');
    rows+='<tr class="'+(i===today?'now':'')+'"><td class="d">'+days[i]+'</td><td>'+cell+'</td></tr>';
  }
  return '<table class="htable"><tbody>'+rows+'</tbody></table>';
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function cardHTML(p){
  const T=txt(p.id); const st=stateLabel(stateOf(p)); const u=L().ui;
  const rating=p.rating!=null?'<span class="card-rating">\\u2605 '+p.rating.toFixed(1)+(p.votes!=null?' <small>('+p.votes+')</small>':'')+'</span>':'';
  const dist=p.min!=null?'<span class="pill mono">'+p.min+' '+u.minShort+(p.km!=null?' \\u00b7 '+p.km+' '+u.kmShort:'')+'</span>':'';
  const price=p.price?'<span class="pill">'+u.price[p.price]+'</span>':'';
  const flag=T.flag?'<p class="card-flag">'+esc(T.flag)+'</p>':'';
  const note=T.note?'<p class="card-note">'+esc(T.note)+'</p>':'';
  const hasHours=p.hours!=null;
  const hours=hasHours?'<details class="hours"><summary>'+u.showHours+'</summary>'+hoursTable(p)+'</details>':'';
  const call=p.phone?'<a class="btn ghost" href="tel:'+esc(p.phone.replace(/\\s/g,''))+'">'+u.call+'</a>':'';
  const nav=p.nav?'<a class="btn" href="'+esc(p.nav)+'" target="_blank" rel="noopener">'+u.navigate+'</a>':'';
  return '<article class="card" id="card-'+p.id+'" data-id="'+p.id+'" data-cat="'+p.cat+'">'
    +photoFor(p)
    +'<div class="card-body"><header class="card-head"><h3 class="card-name">'+esc(p.name)+'</h3>'+rating+'</header>'
    +'<p class="card-sub">'+esc(T.sub||'')+'</p>'
    +'<div class="pills"><span class="pill state '+st.cls+'" data-role="state">'+esc(st.txt)+'</span>'+dist+price+'</div>'
    +note+flag+hours
    +'<div class="actions">'+nav+call+'</div></div></article>';
}

function renderSections(){
  const host=$('#sections'); host.innerHTML='';
  for(const cat of CAT_ORDER){
    const s=L().sections[cat];
    const list=sortedPlaces.filter(p=>p.cat===cat);
    const sec=document.createElement('section');
    sec.className='sec'; sec.id='sec-'+cat; sec.dataset.cat=cat;
    sec.innerHTML='<div class="wrap"><div class="sec-tag">'+esc(s.nav)+'</div><h2>'+esc(s.title)+'</h2>'
      +'<p class="lede">'+esc(s.lede)+'</p><div class="cards">'+list.map(cardHTML).join('')+'</div>'
      +'<p class="empty is-hidden" data-empty>'+esc(L().ui.noResults)+'</p></div>';
    host.appendChild(sec);
  }
}

// ---- compass ----
const R=168, CX=200, CY=200;
function radius(t){return R*Math.sqrt(Math.min(t,90)/90);}
const catColor={see:'var(--cat-see)',lunch:'var(--cat-lunch)',dinner:'var(--cat-dinner)',easy:'var(--cat-easy)'};
function buildCompass(){
  const fig=$('#bussola'); fig.innerHTML='';
  const s=svg('svg',{viewBox:'0 0 400 400',class:'bussola-fig',role:'img'});
  s.setAttribute('aria-label',L().compass.title);
  [15,30,45,60,90].forEach(t=>{
    s.appendChild(svg('circle',{class:'bussola-ring',cx:CX,cy:CY,r:radius(t).toFixed(1)}));
    const ty=CY-radius(t);
    const lab=svg('text',{class:'bussola-rlabel',x:CX+3,y:(ty+3).toFixed(1),'text-anchor':'start'});
    lab.textContent=t+'\\u2032'; s.appendChild(lab);
  });
  // spokes N/E/S/W
  s.appendChild(svg('line',{class:'bussola-spoke',x1:CX,y1:CY-R,x2:CX,y2:CY+R}));
  s.appendChild(svg('line',{class:'bussola-spoke',x1:CX-R,y1:CY,x2:CX+R,y2:CY}));
  const cl=L().compass;
  const spokes=[['N',CX,CY-R-6,'middle'],[cl.sea,CX+R+2,CY+3,'end'],['S',CX,CY+R+13,'middle'],[cl.maiella,CX-R-2,CY+3,'start']];
  spokes.forEach(([t,x,y,a])=>{const e=svg('text',{class:'bussola-clabel',x,y,'text-anchor':a});e.textContent=t;s.appendChild(e);});
  // house diamond
  const d=svg('rect',{class:'bussola-house',x:CX-5,y:CY-5,width:10,height:10,transform:'rotate(45 '+CX+' '+CY+')'});
  s.appendChild(d);
  const ht=svg('text',{class:'bussola-htext',x:CX,y:CY+20,'text-anchor':'middle'});ht.textContent=cl.house;s.appendChild(ht);
  // dots
  const plot=DATA.places.filter(p=>p.brg!=null&&p.min!=null&&p.min>0);
  for(const p of plot){
    const rad=radius(p.min), a=p.brg*Math.PI/180;
    const x=CX+rad*Math.sin(a), y=CY-rad*Math.cos(a);
    const dot=svg('circle',{class:'bussola-dot','data-id':p.id,cx:x.toFixed(1),cy:y.toFixed(1),r:4.6,fill:catColor[p.cat],tabindex:0,role:'button'});
    dot.setAttribute('aria-label',p.name+', '+p.min+' '+L().ui.minShort);
    s.appendChild(dot);
  }
  fig.appendChild(s);
  return plot.length;
}

// ---- readout / digest ----
function digest(){
  const n=nowRome();
  const open=DATA.places.filter(p=>stateOf(p).state==='open');
  const shut=DATA.places.filter(p=>stateOf(p).state==='closed').length;
  const withMin=open.filter(p=>p.min!=null).sort((a,b)=>a.min-b.min);
  const withRating=open.filter(p=>p.rating!=null).sort((a,b)=>b.rating-a.rating);
  const cl=L().compass;
  const closest=withMin[0], best=withRating[0];
  let h='<div class="now">'+tpl(cl.nowIn,{t:fmtMinutes(n.minutes)})+'</div>';
  h+='<div class="digest-row"><span class="k">'+esc(cl.closestOpen)+'</span><span class="v">'+(closest?esc(closest.name):esc(cl.noneOpen))+'</span>'+(closest?'<span class="m">'+closest.min+' '+L().ui.minShort+'</span>':'')+'</div>';
  if(best)h+='<div class="digest-row"><span class="k">'+esc(cl.bestOpen)+'</span><span class="v">'+esc(best.name)+'</span><span class="m">\\u2605 '+best.rating.toFixed(1)+'</span></div>';
  h+='<div class="digest-row"><span class="k">'+esc(cl.shutToday)+'</span><span class="v">'+tpl(cl.places?'{n} '+cl.places:'{n}',{n:shut})+'</span><span class="m">'+esc(cl.shutHint)+'</span></div>';
  h+='<div class="legend">'+CAT_ORDER.map(c=>'<span><i style="background:'+catColor[c]+'"></i>'+esc(L().sections[c].nav)+'</span>').join('')+'</div>';
  const r=$('#readout'); r.innerHTML=h;
}
function showPlace(p){
  const T=txt(p.id); const st=stateLabel(stateOf(p)); const u=L().ui; const cl=L().compass;
  const dist=p.min!=null?'<span class="pill mono">'+p.min+' '+u.minShort+(p.km!=null?' \\u00b7 '+p.km+' '+u.kmShort:'')+'</span>':'';
  const rating=p.rating!=null?'<span class="pill">\\u2605 '+p.rating.toFixed(1)+'</span>':'';
  const r=$('#readout');
  r.innerHTML='<div class="rdo-name">'+esc(p.name)+'</div><div class="rdo-sub">'+esc(T.sub||'')+'</div>'
    +'<div class="rdo-line"><span class="pill state '+st.cls+'">'+esc(st.txt)+'</span>'+dist+rating+'</div>'
    +(T.note?'<p class="rdo-note">'+esc(T.note)+'</p>':'')
    +'<button class="rdo-back" type="button" id="rdo-back">\\u2190 '+esc(cl.nowIn.split(' ')[0])+'</button>';
  $('#rdo-back').addEventListener('click',digest);
}

// activate a dot: update readout + scroll to card + flash.
// One function shared by the click listener AND the keydown listener, because
// SVGElement has no .click() in Chromium (trap 12.2).
function activateDot(id){
  const p=DATA.places.find(x=>x.id===id);
  if(p){readoutIsDefault=false;showPlace(p);}
  const card=document.getElementById('card-'+id);
  if(!card)return;
  card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
  card.scrollIntoView({behavior:'smooth',block:'center'});
}

// ---- filters ----
function matches(p){
  if(filters.open && stateOf(p).state!=='open')return false;
  if(filters.near && (p.min==null||p.min>filters.near))return false;
  if(filters.cats.size && !filters.cats.has(p.cat))return false;
  if(filters.q){
    const T=txt(p.id); const hay=(p.name+' '+(T.sub||'')).toLowerCase();
    if(!hay.includes(filters.q))return false;
  }
  return true;
}
function applyFilters(){
  let visible=0;
  for(const cat of CAT_ORDER){
    const sec=document.getElementById('sec-'+cat); let shown=0;
    for(const card of $$('.card',sec)){
      const p=DATA.places.find(x=>x.id===card.dataset.id);
      const ok=matches(p);
      card.classList.toggle('is-hidden',!ok);
      if(ok){shown++;visible++;}
    }
    sec.classList.toggle('is-hidden',shown===0);
    const empty=sec.querySelector('[data-empty]'); if(empty)empty.classList.add('is-hidden');
  }
  // compass dimming (not disappearing)
  for(const dot of $$('.bussola-dot')){
    const p=DATA.places.find(x=>x.id===dot.dataset.id);
    dot.style.opacity=matches(p)?'1':'.16';
  }
  $('#count').textContent=tpl(L().ui.countOf,{n:visible,total:DATA.places.length});
  const anyEmpty=visible===0;
  const ne=$('#noresults'); if(ne)ne.classList.toggle('is-hidden',!anyEmpty);
}

// ---- live tick: clock + open states ----
function tick(){
  const n=nowRome();
  $('#clock').textContent=fmtMinutes(n.minutes);
  $$('.card').forEach(card=>{
    const p=DATA.places.find(x=>x.id===card.dataset.id);
    const el=card.querySelector('[data-role=state]'); if(!el)return;
    const st=stateLabel(stateOf(p)); el.className='pill state '+st.cls; el.textContent=st.txt;
  });
  heroStats(); digestIfDefault();
  if(filters.open)applyFilters();
}
let readoutIsDefault=true;
function digestIfDefault(){if(readoutIsDefault)digest();}

function heroStats(){
  const open=DATA.places.filter(p=>stateOf(p).state==='open').length;
  const shut=DATA.places.filter(p=>stateOf(p).state==='closed').length;
  $('#stat-open').textContent=open;
  $('#stat-shut').textContent=shut;
}

// ---- static text (hero, bar, practicals, footer) ----
function fmtDate(iso){
  try{return new Date(iso).toLocaleDateString(lang,{day:'numeric',month:'long',year:'numeric'});}catch(e){return iso.slice(0,10);}
}
function renderStatic(){
  const h=L().hero, u=L().ui, cl=L().compass, pr=L().practicals, f=L().footer;
  document.documentElement.lang=lang;
  $('#kick').textContent=h.kicker;
  $('#h-title').innerHTML=esc(h.title1)+'<span class="it">'+esc(h.title2)+'</span>';
  $('#tag').textContent=h.tagline;
  $('#lbl-places').textContent=h.statPlaces; $('#lbl-open').textContent=h.statOpen; $('#lbl-shut').textContent=h.statShut;
  $('#stat-places').textContent=DATA.places.length;
  $('#c-title').textContent=cl.title; $('#c-lede').textContent=cl.lede; $('#c-tag').textContent=cl.title;
  // bar chips
  $('#f-open').textContent=u.openNow; $('#f-20').textContent=u.near20; $('#f-45').textContent=u.near45;
  $('#clock-label').textContent=u.clockLabel; $('#search').placeholder=u.search;
  CAT_ORDER.forEach(c=>{const b=$('#cat-'+c);if(b)b.textContent=L().sections[c].nav;});
  // practicals
  renderPracticals();
  // footer
  $('#f-checked').textContent=tpl(f.checked,{date:fmtDate(DATA.meta.checkedAt)});
  $('#f-computed').textContent=f.computed;
  $('#f-built').textContent=f.built;
  renderCredits();
}
function pcard(k,name,note,href,todo){
  const val=todo?'<span class="pv todo">'+esc(name)+'</span>':(href?'<a class="pv" href="'+esc(href)+'" target="_blank" rel="noopener">'+esc(name)+'</a>':'<span class="pv">'+esc(name)+'</span>');
  return '<div class="pcard"><div class="pk">'+esc(k)+'</div>'+val+(note?'<div class="pn">'+esc(note)+'</div>':'')+'</div>';
}
function isTodo(s){return typeof s==='string'&&s.startsWith('TODO');}
function renderPracticals(){
  const pr=L().practicals, m=DATA.meta, P=m.practicals;
  let h='<div class="wrap"><div class="sec-tag">'+esc(pr.nav)+'</div><h2>'+esc(pr.title)+'</h2><p class="lede">'+esc(pr.lede)+'</p><div class="prac">';
  h+='<div class="pcard big"><div class="pk">'+esc(pr.emergency)+'</div><a class="pv" href="tel:112">'+esc(P.emergency.number)+'</a></div>';
  h+=pcard(pr.host,isTodo(m.host.name)?pr.todo:m.host.name,isTodo(m.host.phone)?pr.todo:m.host.phone,isTodo(m.host.phone)?'':'tel:'+String(m.host.phone).replace(/\\s/g,''),isTodo(m.host.name));
  h+='<div class="pcard"><div class="pk">'+esc(pr.wifi)+'</div><div class="pv">'+(isTodo(m.wifi.network)?'<span class="todo">'+esc(pr.todo)+'</span>':esc(m.wifi.network))+'</div><div class="pn">'+esc(pr.password)+': '+(isTodo(m.wifi.password)?esc(pr.todo):esc(m.wifi.password))+'</div></div>';
  h+=pcard(pr.pharmacy,P.pharmacy.name,isTodo(P.pharmacy.note)?pr.todo:'',P.pharmacy.maps,isTodo(P.pharmacy.name));
  h+=pcard(pr.hospital,P.hospital.name,'',P.hospital.maps,isTodo(P.hospital.name));
  h+=pcard(pr.shop,P.shop.name,P.shop.note,'#card-olivieri',false);
  h+=pcard(pr.fuel,isTodo(P.fuel.name)?pr.todo:P.fuel.name,'',P.fuel.maps,isTodo(P.fuel.name));
  h+=pcard(pr.cash,isTodo(P.cash.name)?pr.todo:P.cash.name,'',P.cash.maps,isTodo(P.cash.name));
  h+='</div></div>';
  $('#practicals').innerHTML=h;
}
function renderCredits(){
  const f=L().footer, cr=DATA.meta.credits||{};
  const items=Object.keys(cr).map(k=>{const c=cr[k];const t=c.licenseUrl?'<a href="'+esc(c.licenseUrl)+'" target="_blank" rel="noopener">'+esc(c.license)+'</a>':esc(c.license);return esc(c.title.replace(/\\.[a-z]+$/i,''))+' — '+esc(c.author)+' ('+t+')';});
  $('#credits').innerHTML='<strong>'+esc(f.credits)+'.</strong> '+esc(f.ownerPhotos)+'<br>'+items.join(' &middot; ')+(items.length?' &middot; ':'')+'via Wikimedia Commons.';
}

// ---- events ----
function setLang(l){lang=l;try{localStorage.setItem('ap_lang',l);}catch(e){}
  $$('.lang').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===l)));
  renderStatic(); renderSections(); buildCompass(); readoutIsDefault=true; digest(); heroStats(); wireDots(); applyFilters(); tick();
}
function wireDots(){
  const fig=$('#bussola');
  fig.addEventListener('mouseover',e=>{const d=e.target.closest('.bussola-dot');if(d){readoutIsDefault=false;const p=DATA.places.find(x=>x.id===d.dataset.id);showPlace(p);}});
  fig.addEventListener('focusin',e=>{const d=e.target.closest('.bussola-dot');if(d){readoutIsDefault=false;const p=DATA.places.find(x=>x.id===d.dataset.id);showPlace(p);}});
  fig.addEventListener('click',e=>{const d=e.target.closest('.bussola-dot');if(d)activateDot(d.dataset.id);});
  fig.addEventListener('keydown',e=>{const d=e.target.closest('.bussola-dot');if(d&&(e.key==='Enter'||e.key===' ')){e.preventDefault();activateDot(d.dataset.id);}});
}
function bindBar(){
  const bar=$('.bar');
  // filter chips scoped to the bar only (trap 12.1)
  $('#f-open').addEventListener('click',function(){filters.open=!filters.open;this.setAttribute('aria-pressed',String(filters.open));applyFilters();});
  const near=(v,btn)=>{filters.near=filters.near===v?0:v;$('#f-20').setAttribute('aria-pressed',String(filters.near===20));$('#f-45').setAttribute('aria-pressed',String(filters.near===45));applyFilters();};
  $('#f-20').addEventListener('click',()=>near(20));
  $('#f-45').addEventListener('click',()=>near(45));
  CAT_ORDER.forEach(c=>{const b=$('#cat-'+c);b.addEventListener('click',function(){if(filters.cats.has(c))filters.cats.delete(c);else filters.cats.add(c);this.setAttribute('aria-pressed',String(filters.cats.has(c)));applyFilters();});});
  let qt; $('#search').addEventListener('input',function(){clearTimeout(qt);const v=this.value.trim().toLowerCase();qt=setTimeout(()=>{filters.q=v;applyFilters();},120);});
  $$('.lang').forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.lang)));
}

function init(){
  renderStatic(); renderSections(); buildCompass();
  $$('.lang').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===lang)));
  digest(); heroStats(); wireDots(); bindBar(); applyFilters(); tick();
  setInterval(tick,30000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
`;

// ---- HTML ---------------------------------------------------------------
const heroImg = photos['_hero'] || '';
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#01271A">
<meta name="description" content="Abruzzo Puro — a guest guide near Colledimezzo. Where to go today, where to eat tonight.">
<title>Abruzzo Puro — guest guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@0,500;0,600;1,500&family=DM+Mono:wght@400;500&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<a class="skip" href="#sec-see">Skip to the guide</a>
<header class="hero">
  <div class="hero-bg" style="background-image:url('${heroImg}')"></div>
  <div class="hero-in wrap">
    <div class="kick mono" id="kick"></div>
    <h1 id="h-title"></h1>
    <p class="tag" id="tag"></p>
    <div class="hstats">
      <div class="hstat"><b id="stat-places">47</b><span id="lbl-places"></span></div>
      <div class="hstat on"><b id="stat-open">·</b><span id="lbl-open"></span></div>
      <div class="hstat"><b id="stat-shut">·</b><span id="lbl-shut"></span></div>
    </div>
  </div>
</header>

<section class="sec" id="compass-sec">
  <div class="wrap">
    <div class="sec-tag" id="c-tag"></div>
    <h2 id="c-title"></h2>
    <p class="lede" id="c-lede"></p>
    <div class="bussola">
      <div id="bussola" class="bussola-fig"></div>
      <div class="readout" id="readout"></div>
    </div>
  </div>
</section>

<nav class="bar" aria-label="Filters">
  <div class="bar-in">
    <button class="chip" id="f-open" aria-pressed="false"></button>
    <button class="chip" id="f-20" aria-pressed="false"></button>
    <button class="chip" id="f-45" aria-pressed="false"></button>
    <span class="sep" aria-hidden="true"></span>
    <button class="chip cat" id="cat-see" aria-pressed="false"></button>
    <button class="chip cat" id="cat-lunch" aria-pressed="false"></button>
    <button class="chip cat" id="cat-dinner" aria-pressed="false"></button>
    <button class="chip cat" id="cat-easy" aria-pressed="false"></button>
    <span class="sep" aria-hidden="true"></span>
    <span class="clock mono"><span id="clock-label"></span> <span id="clock"></span></span>
    <input class="search mono" id="search" type="search" autocomplete="off">
    <span class="count mono" id="count"></span>
    <span class="langs" role="group" aria-label="Language">
      <button class="lang" data-lang="nl">NL</button>
      <button class="lang" data-lang="en">EN</button>
      <button class="lang" data-lang="de">DE</button>
      <button class="lang" data-lang="it">IT</button>
    </span>
  </div>
</nav>

<noscript><div class="wrap"><div class="ns">This guide needs JavaScript to show live opening hours and the compass. It runs entirely on your device — no network needed once loaded.</div></div></noscript>

<main id="sections"></main>
<p class="empty is-hidden wrap" id="noresults"></p>

<section class="sec" id="practicals"></section>

<footer>
  <div class="wrap">
    <div class="checked mono" id="f-checked"></div>
    <p class="fnote" id="f-computed"></p>
    <p class="fnote" id="f-built" style="margin-top:8px;color:var(--faint)"></p>
    <p class="credits" id="credits"></p>
  </div>
</footer>

<script>${app.replace('__DATA__', JSON.stringify(DATA)).replace('__PHOTOS__', JSON.stringify(photos))}</script>
</body>
</html>`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'index.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`[build] dist/index.html · ${kb} KB · ${places.length} places · ${Object.keys(photos).length} photos · checked ${checkedISO.slice(0, 10)}`);
