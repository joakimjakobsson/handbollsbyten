'use strict';
const POS=['MV','V6','V9','M9','H9','H6','M6'];
const TITLES={MV:'Målvakt',V6:'Vänstersexa',V9:'Vänsternia',M9:'Mittnia',H9:'Högernia',H6:'Högersexa',M6:'Mittsexa'};
const KEY='handbollsbyten-web-v1';
const $=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random());
function initial(){const players=POS.map((pos,i)=>({id:uid(),name:`Spelare ${i+1}`,number:'',preferred:pos,court:pos,courtDone:0,benchDone:0,stintStart:0}));['V9','H9','M6'].forEach((pos,i)=>players.push({id:uid(),name:`Spelare ${i+8}`,number:'',preferred:pos,court:null,courtDone:0,benchDone:0,stintStart:0}));return {version:1,players,half:1,elapsedBefore:0,runStarted:null,halfStart:0,finished:false}};
function valid(m){return m&&m.version===1&&Array.isArray(m.players)&&m.players.length>0&&[1,2].includes(m.half)&&Number.isFinite(m.elapsedBefore)&&m.elapsedBefore>=0&&Number.isFinite(m.halfStart)&&m.halfStart<=m.elapsedBefore&&(m.runStarted===null||Number.isFinite(m.runStarted))&&(!m.finished||m.runStarted===null)&&new Set(m.players.map(p=>p.id)).size===m.players.length&&new Set(m.players.map(p=>p.court).filter(Boolean)).size===m.players.filter(p=>p.court).length&&m.players.every(p=>typeof p.name==='string'&&p.name.trim()&&POS.includes(p.preferred)&&(p.court===null||POS.includes(p.court))&&['courtDone','benchDone','stintStart'].every(k=>Number.isFinite(p[k])&&p[k]>=0));}
let state;let storageError='';try{const raw=localStorage.getItem(KEY);state=raw?JSON.parse(raw):initial();if(!valid(state))throw Error('Ogiltig sparad match');}catch(e){state=initial();storageError=`Det gick inte att läsa den sparade matchen (${e.message}). Ingenting skrivs över förrän du återställer lagringen.`;}
let selected=null, draft=null, gestureTimer=null, longFired=false;
const elapsed=(now=Date.now())=>state.elapsedBefore+(state.runStarted!==null?Math.max(0,(now-state.runStarted)/1000):0);
const halfElapsed=()=>Math.max(0,elapsed()-state.halfStart);
const fmt=s=>{s=Math.max(0,Math.floor(s));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
const current=(p,t)=>Math.max(0,t-p.stintStart);
const courtTotal=(p,t)=>p.courtDone+(p.court?current(p,t):0);
const benchTotal=(p,t)=>p.benchDone+(!p.court?current(p,t):0);
function persist(){if(storageError)return;try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){storageError='Kunde inte spara lokalt. Stäng inte appen innan problemet lösts: '+e.message}}
function change(fn){if(storageError)return;fn();persist();render()}
function settle(p,t){if(p.court)p.courtDone+=current(p,t);else p.benchDone+=current(p,t);p.stintStart=t}
function move(id,to){const p=state.players.find(x=>x.id===id);if(!p||state.finished||p.court===to)return;const old=p.court,t=elapsed(),other=state.players.find(x=>x.court===to&&to!==null);if(other){if(old===null){settle(p,t);settle(other,t)}other.court=old;p.court=to}else{if((old===null)!==(to===null))settle(p,t);p.court=to}}
function tap(id){if(state.finished)return;const p=state.players.find(x=>x.id===id);if(!p)return;if(!selected){selected=id;render();return}if(selected===id){selected=null;render();return}const first=state.players.find(x=>x.id===selected);if(!first){selected=null;render();return}if(!first.court&&!p.court){selected=id;render();return}change(()=>{if(p.court)move(first.id,p.court);else if(first.court)move(p.id,first.court);selected=null})}
const el=(tag,cls='',text='')=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node};
function makeRow(p,t,rank){const row=el('button','player'+(selected===p.id?' selected':'')+(rank===1?' rank1':rank===2?' rank2':''));row.type='button';const pos=el('span','position',p.court||p.preferred);row.append(pos);if(p.number)row.append(el('span','jersey','#'+p.number));const details=el('span','details');details.append(el('div','name',p.name));const meta=el('div','subtext',p.court?'På plan':'På bänk');if(rank)meta.append(el('span','rankBadge',rank===1?'● Längst':'● Näst längst'));details.append(meta);row.append(details);const num=el('span','numbers');num.append(el('b','',fmt(current(p,t))));num.append(el('small','',`Plan ${fmt(courtTotal(p,t))} · Bänk ${fmt(benchTotal(p,t))}`));row.append(num);row.addEventListener('click',()=>{if(longFired){longFired=false;return}tap(p.id)});if(p.court){row.addEventListener('contextmenu',e=>{e.preventDefault();if(confirm(`Flytta ${p.name} till bänken utan ersättare?`))change(()=>{move(p.id,null);selected=null})});row.addEventListener('touchstart',()=>{longFired=false;gestureTimer=setTimeout(()=>{longFired=true;gestureTimer=null;if(confirm(`Flytta ${p.name} till bänken utan ersättare?`))change(()=>{move(p.id,null);selected=null})},720)},{passive:true});['touchend','touchcancel','touchmove'].forEach(ev=>row.addEventListener(ev,()=>{clearTimeout(gestureTimer);gestureTimer=null},{passive:true}))}return row}
function render(){const t=elapsed();$('clock').textContent=fmt(halfElapsed());$('halfLabel').textContent=state.finished?'MATCH AVSLUTAD':`HALVLEK ${state.half}`;$('totalTime').textContent=`Totalt ${fmt(t)} · ${state.finished?'Avslutad':state.runStarted!==null?'Pågår':'Pausad'}`;$('toggleBtn').textContent=state.runStarted!==null?'Ⅱ Pausa':'▶ Starta';$('toggleBtn').disabled=state.finished||!!storageError;$('halfBtn').textContent=state.half===1?'Halvtid':'Avsluta';$('halfBtn').disabled=state.finished||halfElapsed()===0||!!storageError;$('rosterBtn').disabled=state.runStarted!==null||!!storageError;$('storageWarning').hidden=!storageError;$('storageWarning').textContent=storageError;
const chosen=state.players.find(x=>x.id===selected);$('hint').textContent=chosen?`Vald: ${chosen.name}. ${chosen.court?'Tryck på en bänkspelare för byte eller en planspelare för positionsbyte.':'Tryck på spelaren som ska ut eller på en tom position.'} (Tryck samma spelare för att avbryta.)`:'Välj först en bänkspelare och sedan spelaren på planen som ska ut.';$('hint').classList.toggle('has-selection',!!chosen);
const ranks=state.players.filter(p=>p.court&&p.court!=='MV').sort((a,b)=>current(b,t)-current(a,t)||a.name.localeCompare(b.name,'sv'));const ranking=new Map(ranks.slice(0,2).map((p,i)=>[p.id,i+1]));const court=$('court');court.replaceChildren();POS.forEach(pos=>{const p=state.players.find(p=>p.court===pos);if(p){court.append(makeRow(p,t,ranking.get(p.id)||0));return}const btn=el('button','player empty'+(chosen?' can-enter':''),`${pos} · Tom plats ${chosen?'· Tryck för att sätta in':''}`);btn.disabled=!chosen||state.finished;btn.onclick=()=>change(()=>{move(chosen.id,pos);selected=null});court.append(btn)});$('courtCount').textContent=`${state.players.filter(p=>p.court).length}/7`;const bench=state.players.filter(p=>!p.court).sort((a,b)=>a.stintStart-b.stintStart||a.name.localeCompare(b.name,'sv'));$('bench').replaceChildren(...bench.map(p=>makeRow(p,t,0)));$('benchCount').textContent=`${bench.length} spelare`;
}
$('toggleBtn').onclick=()=>change(()=>{if(state.runStarted!==null){state.elapsedBefore=elapsed();state.runStarted=null}else state.runStarted=Date.now()});
$('halfBtn').onclick=()=>{if(state.half===1){if(!confirm('Gå till halvlek 2? Klockan pausas och halvleken börjar på 00:00. Totaltiderna sparas.'))return;change(()=>{state.elapsedBefore=elapsed();state.runStarted=null;state.half=2;state.halfStart=state.elapsedBefore;selected=null})}else{if(!confirm('Avsluta matchen? Du kan se statistiken tills du startar ny match.'))return;change(()=>{state.elapsedBefore=elapsed();state.runStarted=null;state.finished=true;selected=null})}};
$('newBtn').onclick=()=>{if(!confirm('Starta ny match? Alla tider nollställs, men spelarnamn, nummer och positioner behålls.'))return;if(storageError){if(!confirm('Sparade data kunde inte läsas. Vill du verkligen skriva över dem med en ny match?'))return;storageError=''}change(()=>{state.half=1;state.elapsedBefore=0;state.runStarted=null;state.halfStart=0;state.finished=false;state.players.forEach(p=>{p.courtDone=0;p.benchDone=0;p.stintStart=0});selected=null})};
function field(label,value,type='text'){const wrapper=el('label');wrapper.append(el('span','',label));const input=el('input');input.type=type;input.value=value;wrapper.append(input);return {wrapper,input}}
function updateDraft(){draft=[];document.querySelectorAll('.rosterRow').forEach(row=>{const original=state.players.find(p=>p.id===row.dataset.id);draft.push({...original,id:row.dataset.id,name:row.querySelector('.editName').value.trim(),number:row.querySelector('.editNumber').value.replace(/\D/g,'').slice(0,3),preferred:row.querySelector('.editPosition').value})})}
function drawRoster(){const root=$('rosterRows');root.replaceChildren();draft.forEach(p=>{const row=el('div','rosterRow');row.dataset.id=p.id;const name=field('Namn',p.name),num=field('Tröjnummer',p.number||'','text');name.input.className='editName';num.input.className='editNumber';num.input.inputMode='numeric';num.input.pattern='[0-9]*';num.input.maxLength=3;row.append(name.wrapper,num.wrapper);const lab=el('label','positionField');lab.append(el('span','','Grundposition'));const select=el('select','editPosition');POS.forEach(pos=>{const opt=el('option','',`${pos} – ${TITLES[pos]}`);opt.value=pos;opt.selected=pos===p.preferred;select.append(opt)});lab.append(select);row.append(lab);if(elapsed()===0){const remove=el('button','remove','Ta bort spelare');remove.type='button';remove.onclick=()=>{updateDraft();draft=draft.filter(item=>item.id!==p.id);drawRoster()};row.append(remove)}root.append(row)})}
// Roster-only sharing: no game clocks, player IDs, or statistics leave this device.
// A URL fragment is processed locally by the recipient's browser.
const SHARE_PARAM='lag';
function rosterPayload(){
  return {v:1,players:state.players.map(p=>({name:p.name,number:String(p.number??''),preferred:p.preferred,court:p.court??null}))};
}
function encodeRoster(data){
  const bytes=new TextEncoder().encode(JSON.stringify(data));
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeRoster(encoded){
  if(encoded.length>20000||!/^[a-zA-Z0-9_-]+$/.test(encoded))throw Error('Delningskoden är ogiltig eller för stor.');
  let value;
  try {
    const binary=atob(encoded.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(encoded.length/4)*4,'='));
    value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0))));
  } catch(e){throw Error('Det går inte att avkoda spelarlistan. Kopiera hela länken igen.');}
  const list=Array.isArray(value)?value:value?.players;
  if(!Array.isArray(list)||list.length<1||list.length>50)throw Error('Länken innehåller inte en giltig spelarlista.');
  const occupied=new Set();
  return list.map((p,i)=>{
    if(!p||typeof p!=='object')throw Error(`Spelare ${i+1} har fel format.`);
    const name=typeof p.name==='string'?p.name.trim():'';
    if(!name||name.length>80)throw Error(`Spelare ${i+1} saknar ett giltigt namn.`);
    const rawNumber=p.number??p.jerseyNumber??'';
    const number=String(rawNumber).trim().replace(/^#/,'');
    if(!/^\d{0,3}$/.test(number))throw Error(`Tröjnumret för ${name} är ogiltigt.`);
    const preferred=p.preferred??p.preferredPosition??p.position??'M9';
    if(!POS.includes(preferred))throw Error(`Grundpositionen för ${name} är ogiltig.`);
    // Earlier versions sometimes omitted court entirely for bench players.
    let court=p.court??p.courtPosition??null;
    if(court!==null&&!POS.includes(court))throw Error(`Planpositionen för ${name} är ogiltig.`);
    if(court!==null){
      if(occupied.has(court))throw Error(`Två spelare är placerade på ${court}.`);
      occupied.add(court);
    }
    return {id:uid(),name,number,preferred,court,courtDone:0,benchDone:0,stintStart:0};
  });
}
function shareURL(){const u=new URL(location.href);u.hash=SHARE_PARAM+'='+encodeRoster(rosterPayload());return u.href}
$('shareRosterBtn').onclick=async()=>{
  const url=shareURL();
  const message='Handbollsbyten – importera vår spelarlista (namn, nummer och positioner; inga matchtider):';
  try{
    if(navigator.share){await navigator.share({title:'Handbollsbyten – spelarlista',text:message,url});return}
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);alert('Länken till spelarlistan är kopierad. Skicka den till de andra föräldrarna.');return}
  }catch(e){if(e.name==='AbortError')return}
  prompt('Kopiera länken och skicka till de andra föräldrarna:',url);
};
function importRosterText(text){
  const source=text.trim();
  if(!source)throw Error('Klistra in en delningslänk först.');
  // Accept either a full URL or the #lag= fragment, including URL-encoded fragments.
  let encoded='';
  try {
    if(source.startsWith('#'))encoded=source.slice(1);
    else if(source.startsWith('lag='))encoded=source;
    else {const found=source.match(/https?:\/\/[^\s<>]+/);const url=new URL(found?found[0]:source);encoded=url.hash.slice(1);}
    encoded=decodeURIComponent(encoded);
  } catch(e) {throw Error('Det här verkar inte vara en giltig delningslänk.');}
  if(!encoded.startsWith(SHARE_PARAM+'='))throw Error('Länken saknar spelarlistan (#lag=...). Be avsändaren skapa en ny länk med Dela lag.');
  return decodeRoster(encoded.slice(SHARE_PARAM.length+1));
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
function importFromLink(){
  const hash=location.hash.slice(1);
  if(!hash.startsWith(SHARE_PARAM+'='))return;
  // Show the imported URL in the text field as a fallback if the user cancels.
  $('importLink').value=location.href;
  try{
    const incoming=importRosterText(location.href);
    if(applyIncomingRoster(incoming)){
      history.replaceState(null,'',location.pathname+location.search);
      $('importDialog').close();
    }
  }catch(e){
    $('importError').textContent=e.message;
    $('importError').hidden=false;
    $('importDialog').showModal();
  }
}
$('importRosterBtn').onclick=()=>{$('importError').hidden=true;$('importDialog').showModal();};
$('closeImport').onclick=()=>$('importDialog').close();
$('confirmImport').onclick=()=>{
  $('importError').hidden=true;
  try{const incoming=importRosterText($('importLink').value);if(applyIncomingRoster(incoming)){$('importDialog').close();if(location.hash.startsWith('#lag='))history.replaceState(null,'',location.pathname+location.search);}}
  catch(e){$('importError').textContent=e.message;$('importError').hidden=false;}
};
$('rosterBtn').onclick=()=>{draft=structuredClone(state.players);drawRoster();$('rosterDialog').showModal()};$('closeRoster').onclick=()=>$('rosterDialog').close();$('addPlayer').onclick=()=>{updateDraft();draft.push({id:uid(),name:'',number:'',preferred:'M9',court:null,courtDone:0,benchDone:0,stintStart:elapsed()});drawRoster();const inputs=document.querySelectorAll('.editName');inputs[inputs.length-1]?.focus()};$('saveRoster').onclick=()=>{updateDraft();if(!draft.length||draft.some(p=>!p.name)){alert('Alla spelare måste ha ett namn.');return}if(elapsed()>0&&state.players.some(p=>!draft.find(d=>d.id===p.id))){alert('Efter matchstart går det inte att ta bort spelare.');return}change(()=>state.players=draft);$('rosterDialog').close()};
render();importFromLink();window.addEventListener('hashchange',importFromLink);setInterval(()=>{if(state.runStarted!==null)render()},1000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render();else persist()});window.addEventListener('pagehide',persist);if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
