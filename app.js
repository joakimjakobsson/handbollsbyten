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
  return {v:1,players:state.players.map(p=>({name:p.name,number:p.number||'',preferred:p.preferred,court:p.court}))};
}
function encodeRoster(data){
  const bytes=new TextEncoder().encode(JSON.stringify(data));
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeRoster(encoded){
  if(encoded.length>12000||! /^[a-zA-Z0-9_-]+$/.test(encoded))throw Error('Ogiltig eller för stor delningslänk.');
  const base64=encoded.replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(base64.padEnd(Math.ceil(base64.length/4)*4,'='));
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!value||value.v!==1||!Array.isArray(value.players)||value.players.length<1||value.players.length>50)throw Error('Fel format på spelarlistan.');
  const occupied=[];
  const roster=value.players.map(p=>{
    if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||typeof p.number!=='string'||!/^\d{0,3}$/.test(p.number)||!POS.includes(p.preferred)||!(p.court===null||POS.includes(p.court)))throw Error('Spelarlistan innehåller ogiltiga uppgifter.');
    if(p.court)occupied.push(p.court);
    return {id:uid(),name:p.name.trim(),number:p.number,preferred:p.preferred,court:p.court,courtDone:0,benchDone:0,stintStart:0};
  });
  if(new Set(occupied).size!==occupied.length)throw Error('Två spelare har samma plats på planen.');
  return roster;
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
function importFromLink(){
  const hash=location.hash.startsWith('#')?location.hash.slice(1):'';
  if(!hash.startsWith(SHARE_PARAM+'='))return;
  let incoming;
  try{incoming=decodeRoster(hash.slice(SHARE_PARAM.length+1))}
  catch(e){alert('Det gick inte att läsa den delade spelarlistan: '+e.message);return}
  const message=storageError
    ? `Den gamla sparade matchen på den här telefonen kunde inte läsas.\n\nVill du importera ${incoming.length} spelare ändå? Webbappen försöker först säkerhetskopiera den gamla informationen lokalt. Importen ersätter därefter den gamla matchen.\n\nAvbryt om du vill behålla uppgifterna orörda.`
    : `Importera ${incoming.length} spelare?\n\nDin nuvarande spelarlista och alla matchtider på den här enheten ersätts. Den delade länken innehåller bara namn, tröjnummer och positioner.\n\nTryck Avbryt om du vill behålla nuvarande match.`;
  if(!confirm(message))return;
  try {
    const original=localStorage.getItem(KEY);
    if(original!==null){
      const backupKey=KEY+'-backup-before-import-'+Date.now();
      localStorage.setItem(backupKey,original);
    }
    const replacement={version:1,players:incoming,half:1,elapsedBefore:0,runStarted:null,halfStart:0,finished:false};
    if(!valid(replacement))throw Error('Den delade spelarlistan klarade inte valideringen.');
    localStorage.setItem(KEY,JSON.stringify(replacement));
    state=replacement;storageError='';selected=null;
  }catch(e){alert('Importen kunde inte slutföras. Gamla data har inte medvetet tagits bort. '+e.message);return}
  history.replaceState(null,'',location.pathname+location.search);
  render();
  alert('Spelarlistan har importerats. Du kan nu börja en ny match.');
}
$('rosterBtn').onclick=()=>{draft=structuredClone(state.players);drawRoster();$('rosterDialog').showModal()};$('closeRoster').onclick=()=>$('rosterDialog').close();$('addPlayer').onclick=()=>{updateDraft();draft.push({id:uid(),name:'',number:'',preferred:'M9',court:null,courtDone:0,benchDone:0,stintStart:elapsed()});drawRoster();const inputs=document.querySelectorAll('.editName');inputs[inputs.length-1]?.focus()};$('saveRoster').onclick=()=>{updateDraft();if(!draft.length||draft.some(p=>!p.name)){alert('Alla spelare måste ha ett namn.');return}if(elapsed()>0&&state.players.some(p=>!draft.find(d=>d.id===p.id))){alert('Efter matchstart går det inte att ta bort spelare.');return}change(()=>state.players=draft);$('rosterDialog').close()};
render();importFromLink();window.addEventListener('hashchange',importFromLink);setInterval(()=>{if(state.runStarted!==null)render()},1000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render();else persist()});window.addEventListener('pagehide',persist);if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
