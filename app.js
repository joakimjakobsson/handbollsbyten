'use strict';
const POS=['MV','V6','V9','M9','H9','H6','M6'];
const TITLES={MV:'Målvakt',V6:'Vänstersexa',V9:'Vänsternia',M9:'Mittnia',H9:'Högernia',H6:'Högersexa',M6:'Mittsexa'};
const KEY='handbollsbyten-web-v1';
const $=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random());
function initial(){const players=POS.map((pos,i)=>({id:uid(),name:`Spelare ${i+1}`,number:'',preferred:pos,court:pos,courtDone:0,benchDone:0,stintStart:0}));['V9','H9','M6'].forEach((pos,i)=>players.push({id:uid(),name:`Spelare ${i+8}`,number:'',preferred:pos,court:null,courtDone:0,benchDone:0,stintStart:0}));return {version:1,players,half:1,elapsedBefore:0,runStarted:null,halfStart:0,finished:false}};
function valid(m){return m&&m.version===1&&Array.isArray(m.players)&&m.players.length>0&&[1,2].includes(m.half)&&Number.isFinite(m.elapsedBefore)&&m.elapsedBefore>=0&&Number.isFinite(m.halfStart)&&m.halfStart<=m.elapsedBefore&&(m.runStarted===null||Number.isFinite(m.runStarted))&&(!m.finished||m.runStarted===null)&&new Set(m.players.map(p=>p.id)).size===m.players.length&&new Set(m.players.map(p=>p.court).filter(Boolean)).size===m.players.filter(p=>p.court).length&&m.players.every(p=>typeof p.name==='string'&&p.name.trim()&&POS.includes(p.preferred)&&(p.court===null||POS.includes(p.court))&&['courtDone','benchDone','stintStart'].every(k=>Number.isFinite(p[k])&&p[k]>=0));}
// Recover the known new-player clock corruption without discarding the roster.
// Missing or JSON-null clocks were generated when NaN was serialized to JSON.
// Never alter a finite clock value or recover malformed non-clock fields.
function repairMissingPlayerTimes(m){
  if(!m || m.version!==1 || !Array.isArray(m.players) || !m.players.length ||
     !Number.isFinite(m.elapsedBefore) || !Number.isFinite(m.halfStart) ||
     !(m.runStarted===null || Number.isFinite(m.runStarted))) return null;
  const copy=structuredClone(m);
  const clock=copy.elapsedBefore + (copy.runStarted===null ? 0 : Math.max(0,(Date.now()-copy.runStarted)/1000));
  let changed=false;
  for(const player of copy.players){
    for(const key of ['courtDone','benchDone']){
      if(player[key]===undefined || player[key]===null){player[key]=0;changed=true;}
    }
    if(player.stintStart===undefined || player.stintStart===null){
      // Do not create historic bench time for a newly added player.
      player.stintStart=clock;changed=true;
    }
  }
  return changed && valid(copy) ? copy : null;
}
let state;let storageError='';let repairMessage='';
try{
  const raw=localStorage.getItem(KEY);
  state=raw?JSON.parse(raw):initial();
  if(!valid(state)){
    const fixed=repairMissingPlayerTimes(state);
    if(!fixed)throw Error('Ogiltig sparad match');
    localStorage.setItem(KEY+'-backup-before-clock-repair-'+Date.now(),raw);
    localStorage.setItem(KEY,JSON.stringify(fixed));
    state=fixed;
    repairMessage='En äldre tidsbugg i en tillagd spelare har reparerats. Den ursprungliga matchen har säkerhetskopierats lokalt.';
  }
}catch(e){state=initial();storageError=`Det gick inte att läsa den sparade matchen (${e.message}). Ingenting skrivs över förrän du återställer lagringen.`;}
let selected=null, draft=null;
let groupUndo=null; // In-memory undo; expires after the next state change or page reload.
let groupAssignments=new Map();
const elapsed=(now=Date.now())=>state.elapsedBefore+(state.runStarted!==null?Math.max(0,(now-state.runStarted)/1000):0);
const halfElapsed=()=>Math.max(0,elapsed()-state.halfStart);
const fmt=s=>{s=Math.max(0,Math.floor(s));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
const current=(p,t)=>Math.max(0,t-p.stintStart);
const courtTotal=(p,t)=>p.courtDone+(p.court?current(p,t):0);
const benchTotal=(p,t)=>p.benchDone+(!p.court?current(p,t):0);
function persist(){
  if(storageError)return;
  if(!valid(state)){
    storageError='Matchen innehåller ett ogiltigt tidvärde och sparades inte. Starta inte om appen innan felet är åtgärdat.';
    render();return;
  }
  try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){storageError='Kunde inte spara lokalt. Stäng inte appen innan problemet lösts: '+e.message}}
function change(fn){if(storageError)return;groupUndo=null;fn();persist();render()}
function settle(p,t){if(p.court)p.courtDone+=current(p,t);else p.benchDone+=current(p,t);p.stintStart=t}
function move(id,to){const p=state.players.find(x=>x.id===id);if(!p||state.finished||p.court===to)return;const old=p.court,t=elapsed(),other=state.players.find(x=>x.court===to&&to!==null);if(other){if(old===null){settle(p,t);settle(other,t)}other.court=old;p.court=to}else{if((old===null)!==(to===null))settle(p,t);p.court=to}}
function tap(id){if(state.finished)return;const p=state.players.find(x=>x.id===id);if(!p)return;if(!selected){selected=id;render();return}if(selected===id){selected=null;render();return}const first=state.players.find(x=>x.id===selected);if(!first){selected=null;render();return}if(!first.court&&!p.court){selected=id;render();return}change(()=>{if(p.court)move(first.id,p.court);else if(first.court)move(p.id,first.court);selected=null})}
const el=(tag,cls='',text='')=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node};
function makeRow(p,t,rank){
  const isSelected=selected===p.id;
  const row=el('button','player'+(isSelected?' selected':'')+(rank===1?' rank1':rank===2?' rank2':''));
  row.type='button';row.dataset.playerId=p.id;row.setAttribute('aria-pressed',String(isSelected));
  const pos=el('span','position',p.court||p.preferred);row.append(pos);
  if(p.number)row.append(el('span','jersey','#'+p.number));
  const details=el('span','details');details.append(el('div','name',p.name));
  const meta=el('div','subtext',p.court?'På plan':'På bänk');
  if(rank)meta.append(el('span','rankBadge',rank===1?'● Längst':'● Näst längst'));
  if(isSelected)meta.append(el('span','selectedBadge','✓ VALD'));
  details.append(meta);row.append(details);
  const num=el('span','numbers');num.append(el('b','playerCurrent',fmt(current(p,t))));
  num.append(el('small','playerTotals',`Plan ${fmt(courtTotal(p,t))} · Bänk ${fmt(benchTotal(p,t))}`));row.append(num);
  // No global touch state: a previous long press must not swallow another player's tap.
  let longPressed=false,holdTimer=null;
  row.addEventListener('click',e=>{if(longPressed){e.preventDefault();longPressed=false;return}tap(p.id)});
  if(p.court){
    const benchPlayer=()=>{if(confirm(`Flytta ${p.name} till bänken utan ersättare?`))change(()=>{move(p.id,null);selected=null})};
    row.addEventListener('contextmenu',e=>{e.preventDefault();if(holdTimer!==null){clearTimeout(holdTimer);holdTimer=null}if(!longPressed){longPressed=true;benchPlayer()}});
    row.addEventListener('touchstart',()=>{longPressed=false;clearTimeout(holdTimer);holdTimer=setTimeout(()=>{longPressed=true;holdTimer=null;benchPlayer()},850)},{passive:true});
    ['touchend','touchcancel','touchmove'].forEach(ev=>row.addEventListener(ev,()=>{clearTimeout(holdTimer);holdTimer=null},{passive:true}));
  }
  return row;
}
function render(){prepareShareLink();const t=elapsed();$('clock').textContent=fmt(halfElapsed());$('halfLabel').textContent=state.finished?'MATCH AVSLUTAD':`HALVLEK ${state.half}`;$('totalTime').textContent=`Totalt ${fmt(t)} · ${state.finished?'Avslutad':state.runStarted!==null?'Pågår':'Pausad'}`;$('toggleBtn').textContent=state.runStarted!==null?'Ⅱ Pausa':'▶ Starta';$('toggleBtn').disabled=state.finished||!!storageError;$('halfBtn').textContent=state.half===1?'Halvtid':'Avsluta';$('halfBtn').disabled=state.finished||halfElapsed()===0||!!storageError;$('rosterBtn').disabled=state.runStarted!==null||!!storageError;$('groupBtn').disabled=state.finished||!!storageError;$('allOutBtn').disabled=state.finished||!!storageError;$('undoGroupBar').hidden=!groupUndo;$('storageWarning').hidden=!(storageError||repairMessage);$('storageWarning').textContent=storageError||repairMessage;
const chosen=state.players.find(x=>x.id===selected);$('hint').textContent=chosen?`Vald: ${chosen.name}. ${chosen.court?'Tryck på en bänkspelare för byte eller en planspelare för positionsbyte.':'Tryck på spelaren som ska ut eller på en tom position.'} (Tryck samma spelare för att avbryta.)`:'Välj först en bänkspelare och sedan spelaren på planen som ska ut.';$('hint').classList.toggle('has-selection',!!chosen);
const ranks=state.players.filter(p=>p.court&&p.court!=='MV').sort((a,b)=>current(b,t)-current(a,t)||a.name.localeCompare(b.name,'sv'));const ranking=new Map(ranks.slice(0,2).map((p,i)=>[p.id,i+1]));const court=$('court');court.replaceChildren();POS.forEach(pos=>{const p=state.players.find(p=>p.court===pos);if(p){court.append(makeRow(p,t,ranking.get(p.id)||0));return}const btn=el('button','player empty'+(chosen?' can-enter':''),`${pos} · Tom plats ${chosen?'· Tryck för att sätta in':''}`);btn.disabled=!chosen||state.finished;btn.onclick=()=>change(()=>{move(chosen.id,pos);selected=null});court.append(btn)});$('courtCount').textContent=`${state.players.filter(p=>p.court).length}/7`;const bench=state.players.filter(p=>!p.court).sort((a,b)=>a.stintStart-b.stintStart||a.name.localeCompare(b.name,'sv'));$('bench').replaceChildren(...bench.map(p=>makeRow(p,t,0)));$('benchCount').textContent=`${bench.length} spelare`;
}
$('toggleBtn').onclick=()=>change(()=>{if(state.runStarted!==null){state.elapsedBefore=elapsed();state.runStarted=null}else state.runStarted=Date.now()});
$('halfBtn').onclick=()=>{if(state.half===1){if(!confirm('Gå till halvlek 2? Klockan pausas och halvleken börjar på 00:00. Totaltiderna sparas.'))return;change(()=>{state.elapsedBefore=elapsed();state.runStarted=null;state.half=2;state.halfStart=state.elapsedBefore;selected=null})}else{if(!confirm('Avsluta matchen? Du kan se statistiken tills du startar ny match.'))return;change(()=>{state.elapsedBefore=elapsed();state.runStarted=null;state.finished=true;selected=null})}};
$('newBtn').onclick=()=>{if(!confirm('Starta ny match? Alla tider nollställs, men spelarnamn, nummer och positioner behålls.'))return;if(storageError){if(!confirm('Sparade data kunde inte läsas. Vill du verkligen skriva över dem med en ny match?'))return;storageError=''}change(()=>{state.half=1;state.elapsedBefore=0;state.runStarted=null;state.halfStart=0;state.finished=false;state.players.forEach(p=>{p.courtDone=0;p.benchDone=0;p.stintStart=0});selected=null})};
function field(label,value,type='text'){const wrapper=el('label');wrapper.append(el('span','',label));const input=el('input');input.type=type;input.value=value;wrapper.append(input);return {wrapper,input}}
function updateDraft(){
  const matchTime=elapsed();
  draft=[...document.querySelectorAll('.rosterRow')].map(row=>{
    const original=state.players.find(p=>p.id===row.dataset.id)||draft.find(p=>p.id===row.dataset.id)||{};
    return {
      id:row.dataset.id,
      name:row.querySelector('.editName').value.trim(),
      number:row.querySelector('.editNumber').value.replace(/\D/g,'').slice(0,3),
      preferred:row.querySelector('.editPosition').value,
      court:original.court??null,
      courtDone:Number.isFinite(original.courtDone)?original.courtDone:0,
      benchDone:Number.isFinite(original.benchDone)?original.benchDone:0,
      stintStart:Number.isFinite(original.stintStart)?original.stintStart:matchTime
    };
  });
}
function drawRoster(){const root=$('rosterRows');root.replaceChildren();draft.forEach(p=>{const row=el('div','rosterRow');row.dataset.id=p.id;const name=field('Namn',p.name),num=field('Tröjnummer',p.number||'','text');name.input.className='editName';num.input.className='editNumber';num.input.inputMode='numeric';num.input.pattern='[0-9]*';num.input.maxLength=3;row.append(name.wrapper,num.wrapper);const lab=el('label','positionField');lab.append(el('span','','Grundposition'));const select=el('select','editPosition');POS.forEach(pos=>{const opt=el('option','',`${pos} – ${TITLES[pos]}`);opt.value=pos;opt.selected=pos===p.preferred;select.append(opt)});lab.append(select);row.append(lab);if(elapsed()===0){const remove=el('button','remove','Ta bort spelare');remove.type='button';remove.onclick=()=>{updateDraft();draft=draft.filter(item=>item.id!==p.id);drawRoster()};row.append(remove)}root.append(row)})}
// Roster-only sharing: no game clocks, player IDs, or statistics leave this device.
// A URL fragment is processed locally by the recipient's browser.
const SHARE_PARAM='lag';
function rosterPayload(){
  return {v:1,players:state.players.map(p=>({name:p.name,number:String(p.number??''),preferred:p.preferred,court:p.court??null}))};
}
// Compact v2 payload: [version, [[name, shirt, preferredIndex, courtIndex], ...]].
// Positions use 0..6; -1 means that a player is on the bench.
// The older v1 encoded JSON format remains supported for imported links.
const utf8Encoder=new TextEncoder();
const utf8Decoder=new TextDecoder('utf-8',{fatal:true});
const SHARE_MAX_BYTES=32000;
function bytesToToken(bytes){
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function tokenToBytes(encoded){
  if(encoded.length>24000||!/^[A-Za-z0-9_-]+$/.test(encoded))throw Error('Delningskoden inneh\u00e5ller ogiltiga tecken eller \u00e4r f\u00f6r stor.');
  const binary=atob(encoded.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(encoded.length/4)*4,'='));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function compactRosterJSON(){
  return JSON.stringify([2,state.players.map(p=>[
    p.name,String(p.number??''),POS.indexOf(p.preferred),p.court===null?-1:POS.indexOf(p.court)
  ])]);
}
async function deflateBytes(bytes){
  const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflateBytes(bytes){
  if(typeof DecompressionStream!=='function')throw Error('Din webbl\u00e4sare kan inte packa upp den korta l\u00e4nken. Uppdatera Safari eller anv\u00e4nd en nyare webbl\u00e4sare.');
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const chunks=[];let total=0;
  try{
    while(true){
      const {value,done}=await reader.read();if(done)break;
      total+=value.byteLength;
      if(total>SHARE_MAX_BYTES){await reader.cancel();throw Error('Spelarlistan \u00e4r f\u00f6r stor.');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const combined=new Uint8Array(total);let cursor=0;
  for(const chunk of chunks){combined.set(chunk,cursor);cursor+=chunk.byteLength;}
  return combined;
}
function normalizeSharedPlayers(value){
  const list=Array.isArray(value)?value:value?.players;
  if(!Array.isArray(list)||list.length<1||list.length>50)throw Error('L\u00e4nken inneh\u00e5ller inte en giltig spelarlista.');
  const occupied=new Set();
  return list.map((p,i)=>{
    if(!p||typeof p!=='object')throw Error(`Spelare ${i+1} har fel format.`);
    const name=typeof p.name==='string'?p.name.trim():'';
    if(!name||name.length>80)throw Error(`Spelare ${i+1} saknar ett giltigt namn.`);
    const rawNumber=p.number??p.jerseyNumber??'';
    const number=String(rawNumber).trim().replace(/^#/,'');
    if(!/^\d{0,3}$/.test(number))throw Error(`Tr\u00f6jnumret f\u00f6r ${name} \u00e4r ogiltigt.`);
    const preferred=p.preferred??p.preferredPosition??p.position??'M9';
    if(!POS.includes(preferred))throw Error(`Grundpositionen f\u00f6r ${name} \u00e4r ogiltig.`);
    const court=p.court??p.courtPosition??null;
    if(court!==null&&!POS.includes(court))throw Error(`Planpositionen f\u00f6r ${name} \u00e4r ogiltig.`);
    if(court!==null){
      if(occupied.has(court))throw Error(`Tv\u00e5 spelare \u00e4r placerade p\u00e5 ${court}.`);
      occupied.add(court);
    }
    return {id:uid(),name,number,preferred,court,courtDone:0,benchDone:0,stintStart:0};
  });
}
async function decodeRoster(encoded){
  let payload;
  if(encoded.startsWith('v2z.')||encoded.startsWith('v2.')){
    const zipped=encoded.startsWith('v2z.');
    const body=encoded.slice(zipped?4:3);
    try{
      let bytes=tokenToBytes(body);
      if(zipped)bytes=await inflateBytes(bytes);
      if(bytes.byteLength>SHARE_MAX_BYTES)throw Error('Spelarlistan \u00e4r f\u00f6r stor.');
      payload=JSON.parse(utf8Decoder.decode(bytes));
    }catch(e){
      if(e.message?.startsWith('Din webbl')||e.message?.startsWith('Spelarlistan \u00e4r f\u00f6r stor'))throw e;
      throw Error('Den korta delningsl\u00e4nken kunde inte avkodas. Be avs\u00e4ndaren kopiera en ny l\u00e4nk.');
    }
    if(!Array.isArray(payload)||payload.length!==2||payload[0]!==2||!Array.isArray(payload[1]))
      throw Error('Fel version av spelarlistan.');
    const list=payload[1].map((entry,i)=>{
      if(!Array.isArray(entry)||entry.length!==4||!Number.isInteger(entry[2])||!Number.isInteger(entry[3])||
        entry[2]<0||entry[2]>=POS.length||entry[3]<-1||entry[3]>=POS.length)
        throw Error(`Spelare ${i+1} har en ogiltig position.`);
      return {name:entry[0],number:entry[1],preferred:POS[entry[2]],court:entry[3]===-1?null:POS[entry[3]]};
    });
    return normalizeSharedPlayers(list);
  }
  // v1, including older links with #lag= and ?lag=.
  try{payload=JSON.parse(utf8Decoder.decode(tokenToBytes(encoded)));}
  catch(e){throw Error('Den \u00e4ldre delningsl\u00e4nken kunde inte avkodas.');}
  return normalizeSharedPlayers(payload);
}
const shareCache={signature:null,url:''};
async function prepareShareLink(){
  const signature=compactRosterJSON();
  if(shareCache.signature===signature)return;
  shareCache.signature=signature;shareCache.url='';
  $('shareRosterBtn').disabled=true;
  $('shareRosterBtn').textContent='F\u00f6rbereder l\u00e4nk...';
  const raw=utf8Encoder.encode(signature);
  let token='v2.'+bytesToToken(raw);
  if(typeof CompressionStream==='function'){
    try{
      const packed='v2z.'+bytesToToken(await deflateBytes(raw));
      if(packed.length<token.length)token=packed;
    }catch(e){ /* Fall back to compact, uncompressed v2 format. */ }
  }
  if(shareCache.signature!==signature)return; // Roster was edited while compressing.
  const url=new URL('./',location.href);
  url.searchParams.set(SHARE_PARAM,token);
  shareCache.url=url.href;
  $('shareRosterBtn').disabled=false;
  $('shareRosterBtn').textContent='\u29c9 Kopiera lagl\u00e4nk';
}
function shareURL(){return shareCache.url;}
$('shareRosterBtn').onclick=async()=>{
  const url=shareURL();
  if(!url){alert('L\u00e4nken f\u00f6rbereds. Prova igen om en stund.');return;}
  try {
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(url);
      alert(`Lagl\u00e4nken \u00e4r kopierad (${url.length} tecken). Klistra in den i WhatsApp eller Meddelanden.`);
      return;
    }
  }catch(e){ /* Show a manual copy prompt if clipboard access is blocked. */ }
  prompt('Kopiera hela lagl\u00e4nken:',url);
};
async function importRosterText(text){
  const source=text.trim();
  if(!source)throw Error('Klistra in en delningsl\u00e4nk f\u00f6rst.');
  let encoded='';
  try {
    if(source.startsWith('#lag=')||source.startsWith('?lag=')||source.startsWith('lag=')){
      encoded=new URLSearchParams(source.replace(/^[#?]/,'')).get(SHARE_PARAM)||'';
    }else{
      const found=source.match(/https?:\/\/[^\s<>]+/);
      const url=new URL(found?found[0]:source);
      encoded=url.searchParams.get(SHARE_PARAM)||new URLSearchParams(url.hash.slice(1)).get(SHARE_PARAM)||'';
    }
  }catch(e){throw Error('Det h\u00e4r verkar inte vara en giltig delningsl\u00e4nk.');}
  if(!encoded)throw Error('L\u00e4nken saknar spelarlistan (lag=...). Be avs\u00e4ndaren dela igen.');
  return decodeRoster(encoded);
}
function clearShareParameters(){
  const u=new URL(location.href);
  u.searchParams.delete(SHARE_PARAM);
  if(u.hash.startsWith('#lag='))u.hash='';
  history.replaceState(null,'',u.pathname+u.search+u.hash);
}
function applyIncomingRoster(incoming){
  const message=storageError
    ? `Den sparade matchen på telefonen kunde inte läsas. Vill du importera ${incoming.length} spelare och ersätta den gamla matchen? Vi försöker först spara en kopia.`
    : `Importera ${incoming.length} spelare? Detta ersätter den nuvarande spelarlistan och matchtiderna på den här telefonen. En lokal säkerhetskopia görs först.`;
  const preview=incoming.map(p=>`${p.number?'#'+p.number+' ':''}${p.name}`).join(', ');
  if(!confirm(message+'\n\nSpelare: '+preview))return false;
  // No modifications until the payload is decoded, validated and user has approved.
  const replacement={version:1,players:incoming,half:1,elapsedBefore:0,runStarted:null,halfStart:0,finished:false};
  if(!valid(replacement))throw Error('Den delade listan innehåller ogiltiga uppgifter.');
  const original=localStorage.getItem(KEY);
  if(original!==null)localStorage.setItem(KEY+'-backup-before-import-'+Date.now(),original);
  localStorage.setItem(KEY,JSON.stringify(replacement));
  state=replacement;storageError='';selected=null;
  render();
  alert(`${incoming.length} spelare har importerats. Öppna Spelare för att kontrollera namnen.`);
  return true;
}
// Incoming URLs are parsed on load, but confirmation is deliberately deferred
// to a real button press. Browsers may suppress native confirm() at page load.
let lastOffer='';
let pendingSource='',pendingPlayers=null;
function clearImportPreview(){
  pendingSource='';pendingPlayers=null;
  $('importPreview').hidden=true;
  $('confirmImport').textContent='L\u00e4s in spelarlista';
}
async function previewImport(source){
  clearImportPreview();
  $('importError').hidden=true;
  try{
    const incoming=await importRosterText(source);
    if($('importLink').value!==source)return;
    pendingSource=source;pendingPlayers=incoming;
    $('importPreview').hidden=false;
    $('importPreview').textContent=`Delad spelarlista (${incoming.length} spelare):\n`+
      incoming.map(p=>`${p.number?'#'+p.number+' ':''}${p.name}`).join('\n')+
      '\n\nTryck knappen f\u00f6r att godk\u00e4nna importen.';
    $('confirmImport').textContent='Bekr\u00e4fta import';
  }catch(e){
    if($('importLink').value!==source)return;
    $('importError').textContent=e.message;
    $('importError').hidden=false;
  }
}
async function importFromLink(){
  const url=new URL(location.href);
  if(!url.searchParams.has(SHARE_PARAM)&&!url.hash.startsWith('#lag='))return;
  const token=url.searchParams.get(SHARE_PARAM)||new URLSearchParams(url.hash.slice(1)).get(SHARE_PARAM)||'';
  if(token===lastOffer&&$('importDialog').open)return;
  lastOffer=token;
  $('importLink').value=url.href;
  if(!$('importDialog').open)$('importDialog').showModal();
  await previewImport(url.href);
}
$('importLink').addEventListener('input',()=>{clearImportPreview();$('importError').hidden=true;});
$('importRosterBtn').onclick=()=>{
  $('importLink').value='';clearImportPreview();$('importError').hidden=true;
  $('importDialog').showModal();
};
$('closeImport').onclick=()=>{
  $('importDialog').close();clearShareParameters();lastOffer='';clearImportPreview();
};
$('confirmImport').onclick=async()=>{
  const source=$('importLink').value;
  $('importError').hidden=true;
  if(pendingSource===source&&pendingPlayers){
    try{
      if(applyIncomingRoster(pendingPlayers)){
        $('importDialog').close();clearShareParameters();lastOffer='';clearImportPreview();
      }
    }catch(e){$('importError').textContent=e.message;$('importError').hidden=false;}
    return;
  }
  $('confirmImport').disabled=true;
  try{await previewImport(source);}finally{$('confirmImport').disabled=false;}
};

// A group exchange is one atomic transaction: every affected player is settled at the SAME match clock.
function candidateBench(){
  return state.players.filter(p=>p.court===null).sort((a,b)=>a.stintStart-b.stintStart||a.name.localeCompare(b.name,'sv'));
}
function groupCourt(){return POS.filter(pos=>pos!=='MV').map(pos=>[pos,state.players.find(p=>p.court===pos)]).filter(([,p])=>!!p);}
function proposeGroup(all){
  const court=groupCourt(), available=candidateBench();
  if(!available.length){alert('Det finns inga spelare på bänken att byta in.');return;}
  if(all&&court.length!==6){alert('Byt alla utespelare kräver sex utespelare på planen. Använd Gruppbyte för ett mindre byte.');return;}
  if(all&&available.length<6){alert(`Det behövs sex bänkspelare för ett helt byte. Nu finns ${available.length}. Använd Gruppbyte för färre spelare.`);return;}
  groupAssignments=new Map();
  if(all){
    const pool=available.slice(0,6); // Longest on bench, with position preference where possible.
    const remaining=[...pool];
    for(const [pos] of court){
      const index=remaining.findIndex(p=>p.preferred===pos);
      if(index>=0)groupAssignments.set(pos,remaining.splice(index,1)[0].id);
    }
    for(const [pos] of court)if(!groupAssignments.has(pos))groupAssignments.set(pos,remaining.shift().id);
  }
  $('groupTitle').textContent=all?'Byt alla utespelare':'Gruppbyte';
  drawGroup();$('groupDialog').showModal();
}
function drawGroup(){
  const target=$('groupRows');target.replaceChildren();
  const available=candidateBench(), court=groupCourt();
  for(const [pos,out] of court){
    const section=el('div','groupRow');
    const toggle=el('label','groupCheck');
    const check=el('input');check.type='checkbox';check.checked=groupAssignments.has(pos);
    check.addEventListener('change',()=>{
      if(!check.checked)groupAssignments.delete(pos);
      else {
        const first=available.find(p=>!Array.from(groupAssignments.values()).includes(p.id)&&p.preferred===pos)||available.find(p=>!Array.from(groupAssignments.values()).includes(p.id));
        if(first)groupAssignments.set(pos,first.id);else check.checked=false;
      }
      drawGroup();
    });
    toggle.append(check,el('span','',`${pos} · Ut: ${out.number?'#'+out.number+' ':''}${out.name}`));section.append(toggle);
    if(groupAssignments.has(pos)){
      const lbl=el('label','groupIncoming');lbl.append(el('span','','In från bänken'));
      const select=el('select');
      available.forEach(p=>{
        const opt=el('option','',`${p.number?'#'+p.number+' ':''}${p.name}${p.preferred===pos?' · '+pos:''}`);
        opt.value=p.id;opt.selected=groupAssignments.get(pos)===p.id;select.append(opt);
      });
      select.value=groupAssignments.get(pos);
      select.onchange=()=>{groupAssignments.set(pos,select.value);drawGroup()};
      lbl.append(select);section.append(lbl);
    }
    target.append(section);
  }
  const ids=[...groupAssignments.values()];
  const unique=new Set(ids).size===ids.length;
  const validGroup=ids.length>0&&ids.length<=available.length&&unique&&ids.every(id=>available.some(p=>p.id===id));
  $('groupStatus').textContent=!ids.length?'Markera minst en utespelare som ska bytas.':!unique?'Samma bänkspelare är vald på flera positioner. Välj olika spelare.':`${ids.length} utespelare ut och ${ids.length} in · alla byts vid samma matchtid.`;
  $('groupStatus').classList.toggle('groupError',!unique);
  $('commitGroup').disabled=!validGroup;
}
function performGroup(){
  const assignments=[...groupAssignments.entries()];
  const incomingIDs=assignments.map(([,id])=>id);
  const outPositions=new Set(groupCourt().map(([pos])=>pos));
  if(storageError||state.finished||!assignments.length||new Set(incomingIDs).size!==incomingIDs.length||
    assignments.some(([pos,id])=>pos==='MV'||!outPositions.has(pos)||!state.players.some(p=>p.id===id&&p.court===null)))return;
  const before=structuredClone(state), time=elapsed();
  const outgoing=assignments.map(([pos])=>state.players.find(p=>p.court===pos));
  const incoming=assignments.map(([,id])=>state.players.find(p=>p.id===id));
  for(const p of [...outgoing,...incoming])settle(p,time);
  outgoing.forEach(p=>p.court=null);
  assignments.forEach(([pos],i)=>{incoming[i].court=pos;});
  selected=null;
  if(!valid(state)){state=before;alert('Bytet kunde inte registreras. Inga tider har ändrats.');render();return;}
  // Undo restores positions and clocks as they were immediately before the group swap.
  groupUndo={before,count:assignments.length};
  persist();render();$('groupDialog').close();
  $('undoGroupText').textContent=`${assignments.length} byten registrerade`;
}
$('groupBtn').onclick=()=>proposeGroup(false);
$('allOutBtn').onclick=()=>proposeGroup(true);
$('closeGroup').onclick=()=>$('groupDialog').close();
$('commitGroup').onclick=performGroup;
$('undoGroupBtn').onclick=()=>{
  if(!groupUndo||storageError)return;
  // Do not rewind match time: original runStarted / elapsedBefore continue to advance normally.
  const backup=groupUndo.before;
  state=structuredClone(backup);groupUndo=null;selected=null;persist();render();
};

$('rosterBtn').onclick=()=>{draft=structuredClone(state.players);drawRoster();$('rosterDialog').showModal()};$('closeRoster').onclick=()=>$('rosterDialog').close();$('addPlayer').onclick=()=>{updateDraft();draft.push({id:uid(),name:'',number:'',preferred:'M9',court:null,courtDone:0,benchDone:0,stintStart:elapsed()});drawRoster();const inputs=$('rosterDialog').querySelectorAll('.editName');const last=inputs[inputs.length-1];if(last){last.scrollIntoView({block:'center',behavior:'instant'});/* Let user tap the visible field; forcing keyboard focus during DOM redraw causes iOS viewport zoom/pan. */}};$('saveRoster').onclick=()=>{updateDraft();if(!draft.length||draft.some(p=>!p.name)){alert('Alla spelare måste ha ett namn.');return}if(elapsed()>0&&state.players.some(p=>!draft.find(d=>d.id===p.id))){alert('Efter matchstart går det inte att ta bort spelare.');return}const proposed={...state,players:structuredClone(draft)};
  if(!valid(proposed)){
    alert('Spelarlistan innehåller ett ogiltigt tidvärde. Den har inte sparats.');return;
  }
  change(()=>state.players=proposed.players);$('rosterDialog').close()};
const versionTag=document.createElement('small');
versionTag.textContent='Version 14 · gruppbyten';versionTag.style.cssText='display:block;color:#a8c0e8;font-size:11px;margin-top:3px';
const brand=document.querySelector('header .brand, .brand');if(brand)brand.append(versionTag);
render();importFromLink();window.addEventListener('hashchange',importFromLink);window.addEventListener('popstate',importFromLink);window.addEventListener('pageshow',importFromLink);window.addEventListener('focus',importFromLink);// Update only text while the clock is running. Replacing rows each second
// destroys touch targets before iOS dispatches click, requiring two taps.
function refreshClockText(){
  if(state.runStarted===null)return;
  const t=elapsed();
  $('clock').textContent=fmt(halfElapsed());
  $('totalTime').textContent=`Totalt ${fmt(t)} · Pågår`;
  document.querySelectorAll('.player[data-player-id]').forEach(row=>{
    const p=state.players.find(x=>x.id===row.dataset.playerId);
    if(!p)return;
    const time=row.querySelector('.playerCurrent');
    const totals=row.querySelector('.playerTotals');
    if(time)time.textContent=fmt(current(p,t));
    if(totals)totals.textContent=`Plan ${fmt(courtTotal(p,t))} · Bänk ${fmt(benchTotal(p,t))}`;
  });
}
setInterval(refreshClockText,250);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render();else persist()});window.addEventListener('pagehide',persist);if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
