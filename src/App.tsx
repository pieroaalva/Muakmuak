import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { ARENAS, CATEGORIES, LESSONS, QUESTIONS, arenaFor, availableQuestions, pickQuiz } from './content';
import type { CategoryId, Question } from './content';
import Music, { deleteMusicForProfile } from './music';
import Updates from './Updates';
import Titlebar from './Titlebar';
import { QUOTES } from './quotes';
import { SOURCE_BY_CATEGORY } from './sources';
import { DEEP_DIVE } from './deepDive';
import './App.css';

type Screen = 'inicio'|'cuestionarios'|'arenas'|'enciclopedia'|'estadisticas'|'perfiles'|'especiales'|'examen'|'resultado'|'musica'|'online';
type History = { id:string; at:string; arena:number; correct:number; total:number; change:number; proposed:number; ranked:boolean; category:CategoryId; kind?:'category'|'general'|'barra'; timed?:boolean };
type CategoryProgress = { elo:number; completed:number; correct:number; answered:number; recent:string[]; history:History[] };
type Profile = { id:string; name:string; avatar:string|null; createdAt:string; progress:Record<CategoryId,CategoryProgress>; specialHistory?:History[] };
type Store = { profiles:Profile[]; activeId:string|null };
type RoundQuestion = { q:Question; choices:string[]; correct:number };
type Round = { category:CategoryId; arena:number; ranked:boolean; review:boolean; questions:RoundQuestion[]; index:number; answers:(number|null)[]; kind:'category'|'general'|'barra'; timed:boolean };
type Result = { history:History; questions:RoundQuestion[]; answers:(number|null)[]; newElo:number };
const STORAGE_KEY='muakmuak:v2:profiles'; // Conservamos esta clave para mantener los perfiles existentes.

type UiTheme='vintage'|'salvia'|'rosa'|'noche'|'oscuro'|'celeste';
type UiSettings={theme:UiTheme; animations:boolean; welcomeDaily:boolean};
const SETTINGS_KEY='muakmuak:v5:settings';
const DEFAULT_SETTINGS:UiSettings={theme:'vintage',animations:true,welcomeDaily:true};
function loadSettings():UiSettings{
 try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');
 if(saved && ['vintage','salvia','rosa','noche','oscuro','celeste'].includes(saved.theme))return {...DEFAULT_SETTINGS,...saved};
 }catch{/* Using defaults */}
 return DEFAULT_SETTINGS;
}
function dayStamp(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
/** One welcome per local calendar day for auto-login; manual login starts a new session. */
function nextQuote(profileId:string,manual=false):string|null{
 const key=`muakmuak:v5:daily:${profileId}`;
 let record:{day?:string;used?:number[];last?:number}={};
 try{record=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{/* empty history */}
 const today=dayStamp();if(!manual&&record.day===today)return null;
 let used=Array.isArray(record.used)?record.used.filter(n=>Number.isInteger(n)&&n>=0&&n<QUOTES.length):[];
 if(used.length>=QUOTES.length)used=[];
 let available=QUOTES.map((_,i)=>i).filter(i=>!used.includes(i)&&i!==record.last);
 if(!available.length)available=QUOTES.map((_,i)=>i).filter(i=>i!==record.last);
 if(!available.length)return null;
 const index=available[Math.floor(Math.random()*available.length)];
 try{localStorage.setItem(key,JSON.stringify({day:today,used:[...used,index],last:index}));}catch{/* optional welcome history */}
 return QUOTES[index];
}

const createProgress=():Record<CategoryId,CategoryProgress> => Object.fromEntries(CATEGORIES.map(c=>[c.id,{elo:0,completed:0,correct:0,answered:0,recent:[],history:[]}  ])) as unknown as Record<CategoryId,CategoryProgress>;
const makeId=()=>`${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
const makeProfile=(name:string,avatar:string|null):Profile => ({id:makeId(),name:name.trim().slice(0,24),avatar,createdAt:new Date().toISOString(),progress:createProgress()});
function loadStore():Store {
  try { const json=localStorage.getItem(STORAGE_KEY); if(json){const data=JSON.parse(json) as Store; if(Array.isArray(data.profiles))return {...data,activeId: data.activeId && data.profiles.some(p=>p.id===data.activeId)?data.activeId:null}; } } catch { /* Estado inicial si los datos locales son inválidos */ }
  // Rescatar el avance creado en la versión anterior, sin mezclarlo con el nuevo perfil que empieza en cero.
  const previous=Number(localStorage.getItem('muakmuak-elo')||0);
  const completed=Number(localStorage.getItem('muakmuak-completed')||0);
  if(previous>0 || completed>0){
    const legacy=makeProfile('Perfil anterior',null);
    legacy.progress.civil.elo=Math.max(0,previous);
    legacy.progress.civil.completed=Math.max(0,completed);
    return {profiles:[legacy],activeId:null};
  }
  return {profiles:[],activeId:null};
}
function shuffle<T>(input:T[]):T[] {
  const out=[...input];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;
}
function toRoundQuestion(q:Question):RoundQuestion {
  const opts=shuffle(q.options.map((label,index)=>({label,original:index})));
  return {q,choices:opts.map(o=>o.label),correct:opts.findIndex(o=>o.original===q.correct)};
}
function totalElo(p:Profile) { return CATEGORIES.reduce((s,c)=>s+p.progress[c.id].elo,0); }
function formatDate(at:string) { return new Date(at).toLocaleDateString('es-PE',{day:'numeric',month:'short',year:'numeric'}); }
function Avatar({profile,size='normal'}:{profile:Profile|null;size?:'normal'|'big'|'tiny'}) {
 return <span className={`avatar ${size}`} aria-label={profile?.name||'Sin perfil'}>{profile?.avatar?<img src={profile.avatar} alt="" />:<span>{(profile?.name||'M').charAt(0).toUpperCase()}</span>}</span>;
}
type IconName=CategoryId|'inicio'|'cuestionarios'|'arenas'|'enciclopedia'|'estadisticas'|'perfiles'|'especiales'|'musica'|'online';
function AppIcon({name,size=23}:{name:IconName;size?:number}){
 const shared={fill:'none',stroke:'currentColor',strokeWidth:1.75,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
 const paths:Record<IconName,ReactNode>={
  inicio:<><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/></>,
  civil:<><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></>,
  registral:<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/><path d="M3 7v12"/></>,
  penal:<><path d="M12 3v17M5 7h14M8 7l-4 7h8l-4-7ZM18 7l-4 7h8l-4-7ZM8 20h8"/></>,
  notarial:<><path d="m3 17 2 4 4-2L20 8l-4-4L5 15l-2 2Z"/><path d="m14 6 4 4M5 21l4-6"/></>,
  administrativo:<><path d="M3 21h18M6 21V9h12v12M4 9l8-6 8 6M9 12v2m6-2v2M9 17v2m6-2v2"/></>,
  cuestionarios:<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/><path d="m15 16 2 2 4-4"/></>,
  arenas:<><path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4M12 14v4m-4 3h8M9 18h6"/></>,
  enciclopedia:<><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1ZM12 5v15"/></>,
  estadisticas:<><path d="M4 20h16M7 17v-5m5 5V6m5 11V9"/></>,
  perfiles:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  especiales:<><path d="M4 3h16v18l-8-4-8 4Z"/><path d="m8 10 3 3 5-6"/></>,
  musica:<><path d="M10 18V5l10-2v12"/><circle cx="7" cy="18" r="3"/><circle cx="17" cy="15" r="3"/></>,
  online:<><path d="M4 12c4-6 12-6 16 0M7 15c3-3 7-3 10 0"/><circle cx="12" cy="19" r="1"/></>
 };
 return <svg className="app-svg-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...shared}>{paths[name]}</svg>;
}
function honoraryTitle(elo:number){return elo>=2200?{short:'GJ',full:'Gran Jurista'}:elo>=1800?{short:'MJ',full:'Maestro Jurídico'}:null;}
function BadgeTitle({elo}:{elo:number}){const title=honoraryTitle(elo);return title?<span className="honor-badge" title={`${title.full} · Distinción de Muakmuak por alcanzar ${elo} ELO`}>{title.short}<span className="honor-tooltip">{title.full}</span></span>:null;}
const extraReasons:Record<string,string>={
 '949':'En una compraventa ordinaria de inmueble determinado, la inscripción publicita y protege el derecho, pero no suele ser el acto que lo crea.',
 '1625':'La legalización de firmas no equivale a escritura pública: omitir la solemnidad exigida produce nulidad de la donación.',
 '1099':'La escritura puede acreditar el acuerdo crediticio, pero sin asiento registral no queda constituida válidamente la garantía real.',
 '1708':'El comprador queda colocado en la posición del arrendador si el arrendamiento estaba inscrito; no puede ignorar ese contrato por el solo cambio de dueño.',
 '2014':'La protección del tercero requiere revisar no solo los asientos, sino también los títulos archivados que los sustentan.',
 '2015':'Debe aparecer una cadena ininterrumpida de transferentes y adquirentes; los títulos intermedios pueden presentarse para inscribirse sucesivamente.',
 '2016':'El asiento de presentación marca el rango registral entre títulos compatibles, no la mera fecha de escritura.',
 '2017':'Un título incompatible anterior puede obstaculizar la inscripción del posterior, sin resolver por sí solo un litigio civil sobre propiedad.',
 '2018':'La antigüedad del título se revisa junto con la identificación del predio y los demás requisitos técnicos de la primera inscripción.',
 '2013':'El asiento vigente se presume cierto, pero la inscripción no transforma en válido un contrato que padezca nulidad.',
 '27444':'La autoridad debe actuar dentro de su competencia y motivar la decisión respetando el debido procedimiento.',
};
function reinforcedReason(q:Question){const extra=Object.entries(extraReasons).find(([key])=>q.basis.includes(key))?.[1];return extra&& !q.feedback.includes(extra)?`${q.feedback} ${extra}`:q.feedback;}
const passMark=(total:number)=>total===5?4:Math.ceil(total*0.7);
function App(){
 const [store,setStore]=useState<Store>(loadStore);
 const [screen,setScreen]=useState<Screen>('inicio');
 const [category,setCategory]=useState<CategoryId>('civil');
 const [studyTab,setStudyTab]=useState<CategoryId|'referencias'>('civil');
 const [lessonId,setLessonId]=useState<string>('civil-propiedad');
 const [search,setSearch]=useState('');
 const [round,setRound]=useState<Round|null>(null);
 const [result,setResult]=useState<Result|null>(null);
 const [newName,setNewName]=useState('');
 const [newAvatar,setNewAvatar]=useState<string|null>(null);
 const [formError,setFormError]=useState('');
 const [profileModal,setProfileModal]=useState(false);
 const [editMode,setEditMode]=useState(false);
 const [deleteId,setDeleteId]=useState<string|null>(null);
 const [timedChoice,setTimedChoice]=useState(false);
 const [remaining,setRemaining]=useState(30);
 const [welcomeQuote,setWelcomeQuote]=useState<string|null>(null);
 const [settings,setSettings]=useState<UiSettings>(loadSettings);
 const [settingsOpen,setSettingsOpen]=useState(false);
 const firstWelcome=useRef(true);
 const backupFileInput=useRef<HTMLInputElement>(null);
 const showWelcome=(profileId:string,manual=false)=>{if(settings.welcomeDaily)setWelcomeQuote(nextQuote(profileId,manual));};
 const imageInput=useRef<HTMLInputElement>(null);
 const mainRef=useRef<HTMLElement>(null);
 const active=store.profiles.find(p=>p.id===store.activeId)||null;
 const prog=active?.progress[category];
 const currentArena=arenaFor(prog?.elo||0);
 const currentCategory=CATEGORIES.find(c=>c.id===category)!;
 const currentLesson=LESSONS.find(l=>l.id===lessonId && l.category===category)||LESSONS.find(l=>l.category===category)!;
 const allHistory=useMemo(()=>active?[...CATEGORIES.flatMap(c=>active.progress[c.id].history),...(active.specialHistory||[])].sort((a,b)=>b.at.localeCompare(a.at)):[],[active]);
 const bestStreak=useMemo(()=>{
   const days=new Set(allHistory.map(h=>h.at.slice(0,10)));
   let n=0;let d=new Date();d.setHours(12,0,0,0);
   if(!days.has(d.toISOString().slice(0,10)))d.setDate(d.getDate()-1);
   while(days.has(d.toISOString().slice(0,10))){n++;d.setDate(d.getDate()-1);}return n;
 },[allHistory]);
 useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(store));}catch{setFormError('No se pudo guardar todo el progreso; revisa el espacio de almacenamiento.');}},[store]);
 useEffect(()=>{if(!firstWelcome.current)return;firstWelcome.current=false;if(store.activeId&&store.profiles.some(p=>p.id===store.activeId))showWelcome(store.activeId);},[]);
 useEffect(()=>{document.documentElement.dataset.theme=settings.theme;document.documentElement.removeAttribute('data-font-scale');document.documentElement.dataset.motion=settings.animations?'on':'off';try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{/* settings are optional */}},[settings]);
 useEffect(()=>{mainRef.current?.scrollTo({top:0,behavior:'auto'});},[screen,lessonId]);
 useEffect(()=>{if(active===null&&store.profiles.length===0)setProfileModal(true);},[active,store.profiles.length]);
 useEffect(()=>{if(screen!=='examen'||!round?.timed||round.answers[round.index]!==null)return;setRemaining(30);const timer=window.setInterval(()=>setRemaining(seconds=>seconds<=1?0:seconds-1),1000);return()=>window.clearInterval(timer);},[screen,round?.index,round?.timed,round?.questions,round?.answers[round?.index??0]]);
 useEffect(()=>{if(screen==='examen'&&round?.timed&&remaining===0&&round.answers[round.index]===null)selectAnswer(-1);},[remaining,screen,round]);
 const saveProfile=(updated:Profile)=>setStore(prev=>({...prev,profiles:prev.profiles.map(p=>p.id===updated.id?updated:p)}));
 function logout(){setWelcomeQuote(null);setStore(prev=>({...prev,activeId:null}));setScreen('inicio');setRound(null);setResult(null);setProfileModal(false);setCategory('civil');}
 function deleteProfile(id:string){void deleteMusicForProfile(id).catch(()=>{});setStore(prev=>({profiles:prev.profiles.filter(p=>p.id!==id),activeId:prev.activeId===id?null:prev.activeId}));setDeleteId(null);setProfileModal(false);setScreen('inicio');setRound(null);setResult(null);}
 function selectProfile(id:string){setStore(prev=>({...prev,activeId:id}));setProfileModal(false);setScreen('inicio');setRound(null);setResult(null);setCategory('civil');showWelcome(id,true);}
 function createProfile(){const name=newName.trim();if(name.length<2){setFormError('Escribe un nickname de al menos dos caracteres.');return;}const p=makeProfile(name,newAvatar);setStore(prev=>({...prev,profiles:[...prev.profiles,p],activeId:p.id}));setNewName('');setNewAvatar(null);setFormError('');setProfileModal(false);setScreen('inicio');setCategory('civil');showWelcome(p.id,true);}
 function uploadAvatar(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setFormError('Usa JPG, PNG o WEBP.');return;}
  if(file.size>5*1024*1024){setFormError('La foto debe pesar menos de 5 MB.');return;}
  const reader=new FileReader();reader.onload=()=>{
    const img=new Image();img.onload=()=>{
      const side=240;const canvas=document.createElement('canvas');canvas.width=side;canvas.height=side;
      const ctx=canvas.getContext('2d');if(!ctx)return;
      const s=Math.min(img.width,img.height),x=(img.width-s)/2,y=(img.height-s)/2;
      ctx.drawImage(img,x,y,s,s,0,0,side,side);setNewAvatar(canvas.toDataURL('image/jpeg',.8));setFormError('');
    };img.src=String(reader.result);
  };reader.readAsDataURL(file);
  e.target.value='';
 }
 function startQuiz(target:CategoryId=category,arena?:number){
  if(!active){setProfileModal(true);return;}
  const rating=arenaFor(active.progress[target].elo);const which=arena??rating;
  if(which>rating)return;
  const ranked=which===rating;
  const bank=pickQuiz(target,which,active.progress[target].recent);
  if(bank.questions.length<5){setFormError('Todavía no hay cinco preguntas disponibles para esta arena.');return;}
  const questions=shuffle(bank.questions.map(toRoundQuestion));
  setRound({category:target,arena:which,ranked,review:bank.review,questions,index:0,answers:Array(5).fill(null),kind:'category',timed:timedChoice});setRemaining(30);
  setResult(null);setCategory(target);setScreen('examen');
 }
 function startSpecial(kind:'general'|'barra'){
  if(!active)return;
  const selected:Question[]=[];
  const perCategory=20;
  for(const c of CATEGORIES){
   const pool=shuffle(QUESTIONS.filter(q=>q.category===c.id && (kind==='general'||q.arena>=2)));
   const choices=pool.slice(0,perCategory);
   if(choices.length<perCategory){setFormError('No hay suficientes preguntas para este simulacro.');return;}
   selected.push(...choices);
  }
  const questions=shuffle(selected.map(toRoundQuestion));
  setRound({category:'civil',arena:0,ranked:false,review:false,questions,index:0,answers:Array(100).fill(null),kind,timed:false});
  setResult(null);setScreen('examen');
 }
 function selectAnswer(value:number){setRound(prev=>prev&&prev.answers[prev.index]===null?{...prev,answers:prev.answers.map((a,i)=>i===prev.index?value:a)}:prev);}
 function nextQuestion(){
  if(!round||round.answers[round.index]===null||!active)return;
  if(round.index<round.questions.length-1){setRemaining(30);setRound({...round,index:round.index+1});return;}
  const count=round.questions.filter((q,i)=>q.correct===round.answers[i]).length;
  const pass=count >= passMark(round.questions.length);
  const proposed=round.ranked?(pass ? (count===5?25+Math.floor(Math.random()*7):17+Math.floor(Math.random()*8)) + (round.timed?6+Math.floor(Math.random()*4):0) : -(15+Math.floor(Math.random()*11))):0;
  const before=active.progress[round.category].elo;
  const after=Math.max(0,before+proposed);
  const actual=after-before;
  const entry:History={id:makeId(),at:new Date().toISOString(),arena:round.arena,correct:count,total:round.questions.length,change:actual,proposed,ranked:round.ranked,category:round.category,kind:round.kind,timed:round.timed};
  const old=active.progress[round.category];
  const updated:Profile=round.kind==='category'?{...active,progress:{...active.progress,[round.category]:{
    ...old,elo:after,completed:old.completed+1,answered:old.answered+round.questions.length,correct:old.correct+count,
    recent:[...round.questions.map(q=>q.q.id),...old.recent].slice(0,25),history:[entry,...old.history].slice(0,150)
  }}}:{...active,specialHistory:[entry,...(active.specialHistory||[])].slice(0,80)};
  saveProfile(updated);setResult({history:entry,answers:round.answers,questions:round.questions,newElo:after});setRound(null);setScreen('resultado');
 }
 function navigate(next:Screen){setFormError('');if(next==='enciclopedia')setStudyTab(category);setScreen(next);}
 function exportBackup(){
  // El archivo es independiente del ejecutable: permite recuperar el progreso tras un cambio de equipo.
  const data={format:'muakmuak-profiles',version:4,exportedAt:new Date().toISOString(),profiles:store.profiles};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`muakmuak-perfiles-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 }
 async function importBackup(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(file.size>10*1024*1024){setFormError('El respaldo supera el límite de 10 MB.');return;}
  try{
   const data=JSON.parse(await file.text());
   if(data?.format!=='muakmuak-profiles'||!Array.isArray(data.profiles)||data.profiles.length>100){throw new Error('El archivo no es un respaldo válido.');}
   const parsed:Profile[]=data.profiles.map((p:Profile)=>{
    if(typeof p.id!=='string'||typeof p.name!=='string'||!p.progress)throw new Error('El archivo está incompleto.');
    const progress=createProgress();for(const c of CATEGORIES){const original=p.progress[c.id];if(!original)throw new Error('Faltan categorías en el respaldo.');progress[c.id]={...progress[c.id],...original,elo:Math.max(0,Number(original.elo)||0),history:Array.isArray(original.history)?original.history.slice(0,150):[],recent:Array.isArray(original.recent)?original.recent.slice(0,25):[]};}
    return {...p,id:p.id.slice(0,90),name:p.name.slice(0,24),avatar:typeof p.avatar==='string'?p.avatar:null,progress};
   });
   if(!confirm(`Se importarán ${parsed.length} perfiles. Los perfiles con el mismo identificador se actualizarán. ¿Continuar?`))return;
   setStore(previous=>{const map=new Map(previous.profiles.map(p=>[p.id,p]));parsed.forEach(p=>map.set(p.id,p));return {profiles:Array.from(map.values()),activeId:previous.activeId};});
   setFormError('Respaldo importado correctamente.');
  }catch(error){setFormError(error instanceof Error?error.message:'No se pudo leer el respaldo.');}
 }

 const nav:[Screen,IconName,string][]=[['inicio','inicio','Inicio'],['cuestionarios','cuestionarios','Cuestionarios'],['arenas','arenas','Arenas'],['enciclopedia','enciclopedia','Estudiar'],['especiales','especiales','Exámenes especiales'],['musica','musica','Música'],['online','online','Partida en línea'],['estadisticas','estadisticas','Estadísticas']];
 if(!active){return <><Titlebar/><div className="onboarding"><div className="onboarding-decor decor-a">✿</div><div className="onboarding-decor decor-b">❀</div><section className="onboarding-panel animate-up">
  <div className="brand-mark">✿</div><div className="eyebrow">Derecho para estudiar y comprender</div><h1>Bienvenido a Muakmuak<span className="flower-text"> ♡</span></h1><p>Una biblioteca de aprendizaje jurídico: estudia normas y principios, analiza casos cotidianos y fortalece tu razonamiento con cuestionarios fundamentados.</p>
  {store.profiles.length>0&&<><div className="separator-word">Elige tu perfil</div><div className="profile-picker">{store.profiles.map(p=><div className="profile-choice-wrap" key={p.id}><button className="profile-choice" onClick={()=>selectProfile(p.id)}><Avatar profile={p}/><span><strong>{p.name}</strong><small>Continuar estudiando</small></span><span>→</span></button><button className="delete-mini" title={`Eliminar perfil de ${p.name}`} aria-label={`Eliminar perfil de ${p.name}`} onClick={()=>setDeleteId(p.id)}>✕</button></div>)}</div></>}
  <button className="primary-btn full new-profile-cta" onClick={()=>{setEditMode(false);setNewName('');setNewAvatar(null);setProfileModal(true)}}>+ Crear nuevo perfil</button><div className="welcome-backup"><button className="secondary-btn" onClick={()=>backupFileInput.current?.click()}>↑ Recuperar mis perfiles desde un respaldo</button><input hidden ref={backupFileInput} accept="application/json,.json" type="file" onChange={e=>void importBackup(e)}/>{formError&&<p className="form-error">{formError}</p>}</div>
 </section>{profileModal&&<div className="modal-cover"><section className="modal animate-pop" role="dialog" aria-modal="true" aria-label="Crear perfil"><button className="modal-x" onClick={()=>{setProfileModal(false);setFormError('')}}>×</button><div className="eyebrow">Comienza a estudiar</div><h2>Crea tu perfil 🌼</h2><p>Elige un nickname y, si deseas, una fotografía. Cada perfil mantiene su avance por separado.</p><button className="avatar-upload" onClick={()=>imageInput.current?.click()}>{newAvatar?<img src={newAvatar} alt="Vista previa de tu foto"/>:<span>📷</span>}<small>Foto opcional</small></button><input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} hidden/><label className="form-label" htmlFor="nickname">Nickname</label><input id="nickname" className="text-input" maxLength={24} value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')createProfile()}} placeholder="¿Cómo quieres llamarte?"/>{formError&&<p className="form-error">{formError}</p>}<button className="primary-btn full" onClick={createProfile}>Crear y entrar →</button></section></div>}
 {deleteId&&<div className="modal-cover"><section className="modal confirmation animate-pop" role="alertdialog" aria-modal="true" aria-label="Confirmar eliminación"><h2>¿Eliminar este perfil?</h2><p>Se borrarán su foto, progreso, estadísticas y resultados guardados en esta computadora. Esta acción no se puede deshacer.</p><div className="confirm-actions"><button className="secondary-btn" onClick={()=>setDeleteId(null)}>Cancelar</button><button className="danger-btn" onClick={()=>deleteProfile(deleteId)}>Eliminar definitivamente</button></div></section></div>}
 </div></>}
 return <><Titlebar/><div className="app-shell">
  <aside className="sidebar">
   <div className="brand"><button className="brand-mark brand-settings" title="Configuración y apariencia" aria-label="Abrir configuración" onClick={()=>setSettingsOpen(true)}>✿</button><button className="brand-words brand-home" onClick={()=>navigate('inicio')}><strong>Muakmuak</strong><small>Aprender, razonar, comprender</small></button></div>
   <div className="nav-heading">Mi espacio</div><nav className="side-nav" aria-label="Navegación principal">{nav.map(([key,ico,label])=><button key={key} title={label} className={`nav-link ${screen===key||(screen==='examen'&&key==='cuestionarios')?'selected':''}`} onClick={()=>navigate(key)}><span className="nav-symbol"><AppIcon name={ico}/></span><span className="nav-text">{label}</span></button>)}</nav>
   <div className="sidebar-bottom"><div className="sidebar-quote"><span>🌿</span><p>Cultiva preguntas. Florecen respuestas.</p></div><button className="sidebar-profile" onClick={()=>navigate('perfiles')}><span className="avatar-badge-wrap"><Avatar profile={active} size="tiny"/><BadgeTitle elo={totalElo(active)}/></span><span className="sidebar-profile-text"><strong>{active.name}</strong><small>{totalElo(active)} ELO</small></span><span className="mini-elo-label">{totalElo(active)} ELO</span></button></div>
  </aside>
  <main className="main-content" ref={mainRef}>
   <header className="topbar"><div className="crumb">Mi espacio de estudio <span>/</span> {screen==='examen'?'Práctica':screen==='resultado'?'Resultado':screen==='enciclopedia'?'Estudiar':screen.charAt(0).toUpperCase()+screen.slice(1)}</div><button className="top-profile" onClick={()=>navigate('perfiles')}><Avatar profile={active} size="tiny"/><span>{active.name}</span><BadgeTitle elo={totalElo(active)}/></button></header>
   <div key={screen} className="page-enter">
   {screen==='inicio'&&<>
    <section className="hero card-glow"><div className="hero-copy"><div className="eyebrow">Hoy es un buen día para aprender ♡</div><h1>¡Hola, {active.name}! <span className="flower-text">✿</span></h1><p>Un pequeño paso hoy también es un gran avance. ¿Estudiamos un ratito?</p><button className="primary-btn" onClick={()=>navigate('cuestionarios')}>Empezar a practicar <span>→</span></button></div><div className="hero-visual" aria-hidden="true"><div className="hero-sun">☀</div><div className="book-stack"><span>▰</span><span>▰</span><span>▰</span></div><div className="hero-sprig">❀</div></div></section>
    <div className="section-header"><h2>Mi pequeño progreso</h2><span>Vas por buen camino ✧</span></div><div className="metric-grid"><div className="metric"><div className="metric-icon">✧</div><small>ELO</small><strong>{totalElo(active)}</strong><span>Entre tus cinco ramas</span></div><div className="metric"><div className="metric-icon">🏵</div><small>Tu arena actual</small><strong className="text-short">{ARENAS[currentArena].short}</strong><span>{currentCategory.short} · {prog?.elo||0} ELO</span></div><div className="metric"><div className="metric-icon">♡</div><small>Cuestionarios</small><strong>{CATEGORIES.reduce((sum,c)=>sum+active.progress[c.id].completed,0)}</strong><span>Completados en tu perfil</span></div></div>
    <div className="section-header"><h2>¿Qué hacemos hoy?</h2></div><div className="action-grid"><button className="action-card tone-rose" onClick={()=>navigate('cuestionarios')}><span className="action-emoji">✎</span><strong>Cuestionario rápido</strong><small>5 preguntas · ELO por categoría</small><em>Practicar →</em></button><button className="action-card tone-sage" onClick={()=>navigate('enciclopedia')}><span className="action-emoji">▤</span><strong>Mi biblioteca</strong><small>Aprende con casos, pasos y ejemplos</small><em>Estudiar →</em></button></div>
    <div className="section-header"><h2>Mis cinco categorías</h2><button className="simple-link" onClick={()=>navigate('cuestionarios')}>Ver todas →</button></div><div className="category-strip">{CATEGORIES.map(c=><button key={c.id} className={`category-chip tone-${c.tint}`} onClick={()=>{setCategory(c.id);navigate('cuestionarios')}}><span className="chip-icon"><AppIcon name={c.id}/></span><span><strong>{c.short}</strong><small>{active.progress[c.id].elo} ELO</small></span></button>)}</div>
   </>}
   {screen==='cuestionarios'&&<><div className="heading"><div className="eyebrow">Pon a prueba tus conocimientos</div><h1>Cuestionarios <span className="flower-text">✎</span></h1><p>Elige una rama del Derecho. Cada una tiene su propio ELO y sus arenas.</p></div>
    <div className="category-grid">{CATEGORIES.map(c=>{return <button key={c.id} className={`category-card tone-${c.tint} ${c.id==='administrativo'?'wide':''} ${category===c.id?'highlight':''}`} onClick={()=>setCategory(c.id)}><span className="category-icon"><AppIcon name={c.id} size={27}/></span><span><strong>{c.name}</strong><small>{c.description}</small></span><span className="category-chevron">›</span></button>})}</div>
    <section className="feature-card"><div className="feature-top"><span className={`feature-icon tone-${currentCategory.tint}`}><AppIcon name={currentCategory.id} size={30}/></span><div><div className="eyebrow">Categoría seleccionada</div><h2>{currentCategory.name}</h2><p>{currentCategory.description}</p></div></div><div className="feature-bottom"><div className="feature-meta"><span className="pill">5 preguntas</span><span className="pill">4/5 para aprobar</span><span className="pill">{prog?.elo||0} ELO</span><span className="pill">{ARENAS[currentArena].tier}</span></div><button className="primary-btn" onClick={()=>startQuiz()}>Comenzar cuestionario →</button></div><label className="timer-toggle"><input type="checkbox" checked={timedChoice} onChange={e=>setTimedChoice(e.target.checked)}/><span>⏱ Modo contrarreloj · 30 segundos por pregunta</span><strong>+6 a +9 ELO extra al aprobar</strong></label><div className="feature-note">✧ Aprobar: +17 a +31 ELO; con reloj, bono adicional. Reprobar: −15 a −25 ELO (mínimo 0). Sin responder a tiempo cuenta como error.</div></section>
   </>}
   {screen==='arenas'&&<><div className="heading"><div className="eyebrow">Tu camino de aprendizaje</div><h1>Arenas <span className="flower-text">♜</span></h1><p>Gana ELO y desbloquea nuevas etapas, al estilo de un camino de progreso.</p></div>
    <div className="category-tabs">{CATEGORIES.map(c=><button key={c.id} className={category===c.id?'active':''} onClick={()=>setCategory(c.id)}><AppIcon name={c.id} size={18}/> <span>{c.short}</span></button>)}</div>
    <div className="arena-progress"><div className="arena-current"><span className="arena-current-emoji">{ARENAS[currentArena].emoji}</span><div><small>Arena actual · {currentCategory.name}</small><strong>{ARENAS[currentArena].name}</strong><span>{prog?.elo||0} ELO</span></div></div><div className="elo-bar"><span style={{width:currentArena===5?'100%':`${Math.max(3,((prog!.elo-ARENAS[currentArena].min)/(ARENAS[currentArena+1].min-ARENAS[currentArena].min))*100)}%`}}/></div><small>{currentArena===5?'¡Última arena alcanzada!':`Siguiente arena en ${ARENAS[currentArena+1].min} ELO`}</small></div>
    <div className="arena-grid">{ARENAS.map((a,i)=>{const locked=i>currentArena;const count=availableQuestions(category,i).length;return <div className={`arena-card ${locked?'locked':''} ${i===currentArena?'current':''}`} key={a.name}><div className="arena-picture">{locked?'🔒':a.emoji}</div><div className="arena-copy"><div className="eyebrow">ARENA {i+1} · {a.tier}</div><h3>{a.name}</h3><p>{a.description}</p><div className="arena-card-meta"><span>{a.min}–{Number.isFinite(a.max)?a.max:'∞'} ELO</span><span>{count} preguntas de {currentCategory.short}</span></div></div><button className={i===currentArena?'primary-btn':'secondary-btn'} disabled={locked} onClick={()=>startQuiz(category,i)}>{locked?'Bloqueada':i===currentArena?'Competir →':'Repasar sin ELO →'}</button></div>})}</div>
    <p className="disclaimer">Biblioteca inicial en ampliación: hay {QUESTIONS.length} preguntas. La primera arena reúne 50 preguntas entre las cinco categorías; las demás cuentan con 35 por arena. La meta de largo plazo es 100 por arena y categoría, con casos verificados.</p>
   </>}
   {screen==='enciclopedia'&&<><div className="heading"><div className="eyebrow">Tu biblioteca personal</div><h1>Estudiar <span className="flower-text">❀</span></h1><p>Aprende mediante ejemplos, procesos y fichas visuales. Sin bloques interminables de texto.</p></div>
    <div className="category-tabs study-tabs">{CATEGORIES.map(c=><button key={c.id} className={studyTab===c.id?'active':''} onClick={()=>{setStudyTab(c.id);setCategory(c.id);const first=LESSONS.find(l=>l.category===c.id);if(first)setLessonId(first.id);setSearch('')}}><AppIcon name={c.id} size={18}/> <span>{c.short}</span></button>)}<button className={`study-reference-tab ${studyTab==='referencias'?'active':''}`} onClick={()=>setStudyTab('referencias')}><span aria-hidden="true">📚</span><span>Referencias</span></button></div>
    {studyTab==='referencias'?<section className="references-hub" aria-label="Referencias y bibliografía"><div className="references-header"><div className="eyebrow">Fuentes para profundizar</div><h2>Referencias y bibliografía</h2><p>Consulta las normas que sustentan nuestras lecciones. Las explicaciones de Muakmuak son material de estudio; comprueba siempre la versión vigente de cada disposición.</p></div>{CATEGORIES.map(c=><section className="reference-category" key={c.id}><h3><AppIcon name={c.id} size={21}/> {c.name}</h3><div className="source-grid">{SOURCE_BY_CATEGORY[c.id].map(source=><a className="source-card" key={`${c.id}-${source.url}`} href={source.url} target="_blank" rel="noopener noreferrer" title={`Abrir fuente: ${source.title}`}><span className="source-illustration" aria-hidden="true">{source.icon}</span><span className="source-copy"><strong>{source.title}</strong><small>{source.publisher}</small><span>{source.description}</span></span><span className="source-arrow" aria-hidden="true">↗</span></a>)}</div></section>)}</section>:<div className="ency-layout"><aside className="ency-aside"><div className="search-box"><span>⌕</span><input placeholder="Buscar un tema..." value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="lesson-list">{LESSONS.filter(l=>l.category===category&&`${l.title} ${l.overview}`.toLowerCase().includes(search.toLowerCase())).map(l=><button key={l.id} onClick={()=>setLessonId(l.id)} className={currentLesson.id===l.id?'active':''}><span className="lesson-dot">✿</span><span><strong>{l.title}</strong><small>{l.subtitle}</small></span><span>›</span></button>)}</div><div className="hint-panel"><strong>♡ Una idea</strong><p>Lee el concepto, imagina un ejemplo propio y luego practica.</p></div></aside>
    <article className="lesson-article" key={currentLesson.id}><div className="eyebrow">Aprendamos juntos · {currentCategory.name}</div><h2>{currentLesson.title}</h2><div className="legal-ref">⚖ {currentLesson.ref}</div><p className="lesson-lead">{currentLesson.overview}</p>{DEEP_DIVE[currentLesson.id]&&<section className="deep-dive" aria-label="Análisis jurídico práctico"><div className="mini-heading">Entiende el razonamiento</div><div className="deep-dive-grid"><div className="deep-dive-item"><span aria-hidden="true">🔎</span><div><strong>Cómo analizarlo</strong><p>{DEEP_DIVE[currentLesson.id].practical}</p></div></div><div className="deep-dive-item caution"><span aria-hidden="true">⚖️</span><div><strong>No confundas esto</strong><p>{DEEP_DIVE[currentLesson.id].pitfall}</p></div></div></div><div className="deep-dive-question"><strong>Pregúntate:</strong> {DEEP_DIVE[currentLesson.id].check}</div></section>}<section className="professional-note" aria-label="Enfoque profesional"><div className="mini-heading">Enfoque profesional</div><p>Estudia este tema como lo haría un abogado: separa los hechos, identifica el requisito legal exacto, revisa si existe una excepción, determina la consecuencia jurídica y recién después valora el efecto frente a terceros, la inscripción o el procedimiento aplicable. No memorices solo la definición: entrena el criterio jurídico.</p></section>
    <div className="mini-heading">Así funciona, paso a paso</div><div className="steps-list">{currentLesson.steps.map((s,i)=><details className="step study-step" key={`${currentLesson.id}-${s.heading}`} open={i===0}><summary><span className="study-step-number">{i+1}</span><strong>{s.heading}</strong><span className="study-chevron">⌄</span></summary><p>{s.description}</p></details>)}</div>{currentLesson.compare&&<div className="compare-row">{currentLesson.compare.map((t,i)=><div key={i}><span>{i===0?'A':'B'}</span><p>{t}</p></div>)}</div>}<div className="case-note"><span>☼ Caso de la vida real</span><p>{currentLesson.example}</p></div><div className="remember-note"><strong>💡 Qué debes recordar</strong><p>{currentLesson.remember}</p></div>
    <section className="lesson-reflection" aria-label="Repaso guiado">
      <div className="mini-heading">Comprueba si lo entendiste</div>
      <p>Aplica lo leído a una situación concreta antes de pasar al cuestionario.</p>
      <details className="reflection-detail"><summary>¿Qué comprobarías primero en este caso? <span>Ver una guía de respuesta</span></summary><p>Identifica los hechos del ejemplo, busca el requisito jurídico relevante y contrasta tu conclusión con este principio: <strong>{currentLesson.remember}</strong></p></details>
      {currentLesson.compare&&<details className="reflection-detail"><summary>¿En qué se diferencian los dos conceptos? <span>Mostrar comparación</span></summary><div className="reflection-compare"><p>{currentLesson.compare[0]}</p><p>{currentLesson.compare[1]}</p></div></details>}
    </section>
    <button className="lesson-reference-shortcut" onClick={()=>setStudyTab('referencias')}><span aria-hidden="true">📚</span><span><strong>Consultar fuentes oficiales</strong><small>Revisa la bibliografía y las normas de las cinco ramas.</small></span><span aria-hidden="true">→</span></button>
    <div className="lesson-related"><div className="mini-heading">Continúa aprendiendo</div><div className="related-buttons">{LESSONS.filter(l=>l.category===currentLesson.category&&l.id!==currentLesson.id).slice(0,4).map(l=><button key={l.id} onClick={()=>{setLessonId(l.id);mainRef.current?.scrollTo({top:0,behavior:'smooth'});}}>{l.title} <span>→</span></button>)}</div></div>
    <button className="primary-btn lesson-cta" onClick={()=>startQuiz(currentLesson.category)}>Practicar esta categoría →</button><p className="fine-print">Material de repaso guiado con enfoque profesional. Para un dominio completo, complementa con normativa vigente, jurisprudencia, doctrina y práctica de casos.</p></article></div>}
   </>}
   {screen==='estadisticas'&&<><div className="heading"><div className="eyebrow">Cada intento cuenta</div><h1>Mi progreso <span className="flower-text">❀</span></h1><p>Un seguimiento por categoría para saber qué temas conviene reforzar.</p></div><div className="metric-grid"><div className="metric"><small>ELO total</small><strong>{totalElo(active)}</strong><span>Entre todas las categorías</span></div><div className="metric"><small>Cuestionarios hechos</small><strong>{allHistory.length||CATEGORIES.reduce((s,c)=>s+active.progress[c.id].completed,0)}</strong><span>En este perfil</span></div><div className="metric"><small>Días seguidos</small><strong>{bestStreak}</strong><span>Con actividad reciente</span></div></div><div className="section-header"><h2>Mi dominio por categoría</h2></div><div className="stat-lines">{CATEGORIES.map(c=>{const s=active.progress[c.id];const pct=s.answered?Math.round(s.correct/s.answered*100):0;return <div key={c.id} className="stat-line"><div><span className="stat-category"><AppIcon name={c.id} size={18}/> {c.name}</span><span>{s.elo} ELO · {pct}% aciertos</span></div><div className="stat-track"><span style={{width:`${pct}%`}}/></div><small>{ARENAS[arenaFor(s.elo)].short} · {s.completed} cuestionarios</small></div>})}</div><div className="section-header"><h2>Últimos cuestionarios</h2></div>{allHistory.length===0?<div className="empty-card">🌿 Todavía no hay resultados. Tu historia de estudio empieza con la primera práctica.</div>:<div className="history-list">{allHistory.slice(0,12).map(h=><div className="history-row" key={h.id}><span className={`history-badge ${h.correct >= passMark(h.total)?'passed':'failed'}`}>{h.correct >= passMark(h.total)?'✓':'×'}</span><div><strong>{h.kind==='barra'?'Simulacro de la Barra':h.kind==='general'?'Examen general':CATEGORIES.find(c=>c.id===h.category)?.name}</strong><small>{formatDate(h.at)} · {h.kind&&h.kind!=='category'?'Simulacro especial':ARENAS[h.arena].tier} · {h.correct}/{h.total}</small></div><strong className={h.change>=0?'points-pos':'points-neg'}>{h.ranked?(h.change>0?'+':'')+h.change+' ELO':'Repaso'}</strong></div>)}</div>}</>}
   {screen==='perfiles'&&<><div className="heading"><div className="eyebrow">Tu identidad en Muakmuak</div><h1>Mi perfil <span className="flower-text">♡</span></h1><p>Personaliza tu cuenta, consulta tus reconocimientos o cierra sesión para cambiar de usuario.</p></div><section className="single-profile-card"><div className="profile-hero"><span className="profile-photo-badge"><Avatar profile={active} size="big"/><BadgeTitle elo={totalElo(active)}/></span><div><h2>{active.name} <BadgeTitle elo={totalElo(active)}/></h2><p>Estudiando desde {formatDate(active.createdAt)}</p><span className="pill">{totalElo(active)} ELO</span></div></div><div className="profile-actions"><button className="secondary-btn" onClick={()=>{setNewName(active.name);setNewAvatar(active.avatar);setEditMode(true);setProfileModal(true)}}>Editar nombre y foto</button><button className="primary-btn" onClick={logout}>Salir del perfil →</button></div><div className="backup-panel"><strong>Respaldo de progreso</strong><p>Exporta tus perfiles a un archivo antes de cambiar de computadora o actualizar la aplicación. Las canciones se conservan en la biblioteca local de este equipo.</p><div className="backup-buttons"><button className="secondary-btn" onClick={exportBackup}>↓ Exportar perfiles</button><button className="secondary-btn" onClick={()=>backupFileInput.current?.click()}>↑ Importar respaldo</button></div><input hidden ref={backupFileInput} accept="application/json,.json" type="file" onChange={e=>void importBackup(e)}/>{formError&&<p className="form-error">{formError}</p>}</div><div className="profile-danger"><span>¿Deseas borrar esta cuenta y todo su avance?</span><button className="danger-text" onClick={()=>setDeleteId(active.id)}>Eliminar este perfil</button></div></section></>}
   {screen==='especiales'&&<><div className="heading"><div className="eyebrow">Simulacros de largo formato</div><h1>Exámenes especiales <span className="flower-text">✧</span></h1><p>Ponte a prueba con 100 preguntas. Estos simulacros no alteran el ELO de ninguna rama.</p></div><div className="special-grid"><article className="special-card"><span className="special-symbol">⚖️</span><h2>Simulacro de la Barra</h2><p>Inspirado en los exámenes de habilitación profesional de Estados Unidos, pero con preguntas de Derecho peruano de nuestro banco y enfoque en razonamiento de casos.</p><div className="special-pills"><span>100 preguntas</span><span>70 aciertos para aprobar</span></div><div className="disclaimer">Simulación educativa. No es un examen oficial de EE. UU. ni de colegiatura peruana.</div><button className="primary-btn" onClick={()=>startSpecial('barra')}>Comenzar simulacro →</button></article><article className="special-card"><span className="special-symbol">📚</span><h2>Examen general</h2><p>Una evaluación que mezcla Derecho Civil, Registral, Penal, Notarial y Administrativo: veinte preguntas de cada categoría para una práctica mucho más sólida.</p><div className="special-pills"><span>100 preguntas</span><span>5 categorías</span><span>70 % para aprobar</span></div><button className="primary-btn" onClick={()=>startSpecial('general')}>Iniciar examen →</button></article></div>{formError&&<p className="form-error">{formError}</p>}</>}
   {screen==='online'&&<><div className="heading"><div className="eyebrow">Compite y aprende en compañía</div><h1>Partida en línea <span className="flower-text">♡</span></h1><p>Desafíos amistosos por código de sala, cinco preguntas de una categoría y resultados en tiempo real.</p></div><article className="online-preview"><div className="online-preview-icon">⚔</div><div><h2>Próxima función: salas privadas</h2><p>Para jugar entre dos computadoras hace falta un servidor en línea que cree las salas, sincronice las preguntas y verifique las respuestas. Hasta conectarlo no hay partidas reales ni cambios de ELO.</p><div className="online-details"><span>5 preguntas por duelo</span><span>+30 a +40 ELO al ganar</span><span>−8 a −15 ELO al perder</span><span>Validación del servidor</span></div><p className="online-footnote">Los puntajes online necesitan cuentas y almacenamiento central para evitar que se puedan modificar localmente. El modo local sigue funcionando sin internet.</p></div></article></>}
   {screen==='examen'&&round&&(()=>{const item=round.questions[round.index];const response=round.answers[round.index];return <div className="quiz-shell"><div className="quiz-meta"><span>{round.kind==='category'?CATEGORIES.find(c=>c.id===round.category)?.name:round.kind==='barra'?'Simulacro de la Barra':'Examen general'}</span><span>Pregunta {round.index+1} de {round.questions.length}</span></div><div className="progress-track"><span style={{width:`${((round.index+1)/round.questions.length)*100}%`}}/></div><div className="quiz-panel" key={item.q.id}><div className="quiz-label"><span>{round.kind==='category'?`${ARENAS[round.arena].emoji} ${ARENAS[round.arena].tier}`:'Simulacro especial · Sin ELO'}</span><span>{round.timed?<span className={`timer-chip ${remaining<=10?'urgent':''}`}>⏱ {remaining}s</span>:round.ranked?'⚡ Clasificatoria · ELO':'♡ Sin ELO'}</span></div><h2>{item.q.stem}</h2><div className="option-list">{item.choices.map((opt,i)=>{const show=response!==null;return <button key={i} className={`option ${show&&i===item.correct?'good':''} ${show&&response===i&&i!==item.correct?'bad':''}`} onClick={()=>selectAnswer(i)} disabled={show}><span className="option-letter">{String.fromCharCode(65+i)}</span><span>{opt}</span>{show&&i===item.correct&&<b>✓</b>}{show&&response===i&&i!==item.correct&&<b>×</b>}</button>})}</div>{response!==null&&<div className={`question-feedback ${response===item.correct?'success':'error'}`}><strong>{response===item.correct?'✓ ¡Muy bien!':response===-1?'⏱ Se agotó el tiempo':'♡ Esta vez no, pero aprendiste algo'}</strong><p>{reinforcedReason(item.q)}</p><small>Fundamento jurídico: {item.q.basis}</small></div>}<div className="quiz-buttons"><button className="secondary-btn" onClick={()=>navigate(round.kind==='category'?'cuestionarios':'especiales')}>Salir del examen</button><button className="primary-btn" disabled={response===null} onClick={nextQuestion}>{round.index===round.questions.length-1?'Ver mi resultado ✨':'Siguiente pregunta →'}</button></div></div>{round.review&&<div className="hint-bottom">Esta arena utiliza preguntas de repaso de niveles anteriores mientras ampliamos el banco avanzado.</div>}</div>})()}
   {screen==='resultado'&&result&&<><div className={`result-panel ${result.history.correct >= passMark(result.history.total)?'passed':'failed'}`}><div className="floating-confetti" aria-hidden="true">{Array.from({length:14},(_,i)=><i key={i} style={{left:`${(i*13+7)%100}%`,animationDelay:`${(i%7)*.13}s`}}/>)}</div><div className="result-icon">{result.history.correct >= passMark(result.history.total)?'🏆':'🌱'}</div><div className="eyebrow">{result.history.correct >= passMark(result.history.total)?'¡Examen aprobado!':'Cada intento enseña algo'}</div><h1>{result.history.correct >= passMark(result.history.total)?'¡Qué buen trabajo!':'Seguimos aprendiendo'}</h1><p>{result.history.correct >= passMark(result.history.total)?'Dominas gran parte de este tema.':result.history.total===5?'Necesitas al menos 4 respuestas correctas de 5 para aprobar.':`Necesitas al menos ${passMark(result.history.total)} respuestas correctas de ${result.history.total} para aprobar.`}</p><div className="result-metrics"><div><strong>{result.history.correct}/{result.history.total}</strong><small>Respuestas correctas</small></div><div><strong className={result.history.proposed>=0?'points-pos':'points-neg'}>{result.history.ranked?(result.history.change>0?'+':'')+result.history.change:'0'}</strong><small>{result.history.ranked?'Cambio de ELO':result.history.kind==='category'?'Repaso sin ELO':'Simulacro sin ELO'}</small></div><div><strong>{result.history.kind==='category'?result.newElo:`${Math.round(result.history.correct/result.history.total*100)}%`}</strong><small>{result.history.kind==='category'?`ELO de ${CATEGORIES.find(c=>c.id===result.history.category)?.short}`:'Calificación del simulacro'}</small></div></div>{result.history.proposed<0&&result.history.change!==result.history.proposed&&<small className="floor-note">Tu ELO no puede bajar de cero: cambio real {result.history.change}.</small>}<div className="result-buttons"><button className="secondary-btn" onClick={()=>navigate('inicio')}>Volver al inicio</button><button className="primary-btn" onClick={()=>result.history.kind==='category'?startQuiz(result.history.category):startSpecial(result.history.kind==='barra'?'barra':'general')}>Otra práctica →</button></div></div><div className="section-header"><h2>Repasa tus respuestas</h2></div><div className="review-list">{result.questions.map((item,i)=>{const correct=result.answers[i]===item.correct;return <details key={item.q.id} className="review-item"><summary><span className={correct?'review-correct':'review-wrong'}>{correct?'✓':'×'}</span><span>Pregunta {i+1}: {item.q.stem}</span><span>⌄</span></summary><div className="review-detail"><p><strong>Tu elección:</strong> {result.answers[i]===-1?'Sin responder (tiempo agotado)':item.choices[result.answers[i]??0]}</p><p><strong>Respuesta correcta:</strong> {item.choices[item.correct]}</p><p>{reinforcedReason(item.q)}</p><small>Fundamento: {item.q.basis}</small></div></details>})}</div></>}
   </div>
   <Music key={active.id} profileId={active.id} showPage={screen==='musica'}/>
  </main>
  {settingsOpen&&<div className="modal-cover settings-cover" onMouseDown={e=>{if(e.target===e.currentTarget)setSettingsOpen(false)}}><section className="modal settings-modal animate-pop" role="dialog" aria-modal="true" aria-label="Configuración de Muakmuak"><button className="modal-x" aria-label="Cerrar configuración" onClick={()=>setSettingsOpen(false)}>×</button><div className="eyebrow">Personaliza tu espacio</div><h2>Preferencias ✿</h2><p>Haz que Muakmuak se sienta cómodo para tus ojos y tu ritmo de estudio.</p><div className="settings-group"><strong>Paleta de colores</strong><div className="theme-options">{([['vintage','Crema'],['salvia','Salvia'],['rosa','Rosado'],['noche','Café'],['oscuro','Nocturno'],['celeste','Celeste']] as const).map(([id,label])=><button key={id} className={`theme-choice ${id} ${settings.theme===id?'picked':''}`} onClick={()=>setSettings(old=>({...old,theme:id}))} aria-pressed={settings.theme===id}><span className="theme-swatch"/>{label}</button>)}</div></div><label className="settings-check"><input type="checkbox" checked={settings.animations} onChange={e=>setSettings(old=>({...old,animations:e.target.checked}))}/><span>Animaciones suaves</span></label><label className="settings-check"><input type="checkbox" checked={settings.welcomeDaily} onChange={e=>setSettings(old=>({...old,welcomeDaily:e.target.checked}))}/><span>Mensaje motivador diario</span></label><Updates/><button className="primary-btn full" onClick={()=>setSettingsOpen(false)}>Guardar y continuar →</button></section></div>}
  {welcomeQuote&&<div className="modal-cover welcome-cover"><section className="modal welcome-modal animate-pop" role="dialog" aria-modal="true" aria-label="Tu mensaje de bienvenida"><div className="welcome-bloom">✿</div><div className="eyebrow">Una pequeña pausa para empezar</div><h2>Hoy también cuenta <span className="flower-text">♡</span></h2><p className="welcome-quote">“{welcomeQuote}”</p><button className="primary-btn full" onClick={()=>setWelcomeQuote(null)}>Continuar estudiando →</button></section></div>}
  {profileModal&&<div className="modal-cover" onMouseDown={e=>{if(e.target===e.currentTarget){setProfileModal(false);setNewName('');setNewAvatar(null)}}}><section className="modal animate-pop" role="dialog" aria-modal="true" aria-label="Perfil"><button className="modal-x" onClick={()=>{setProfileModal(false);setNewName('');setNewAvatar(null)}}>×</button><div className="eyebrow">Tu espacio</div><h2>{editMode?'Editar perfil 🌼':'Un perfil nuevo 🌼'}</h2><p>{editMode?'Cambia tu nickname y tu foto.':'Crea una cuenta local, con fotografía opcional.'}</p><button className="avatar-upload" onClick={()=>imageInput.current?.click()}>{newAvatar?<img src={newAvatar} alt="Vista previa de tu foto"/>:<span>📷</span>}<small>Foto opcional</small></button><input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} hidden/><label htmlFor="nickname-update" className="form-label">Nickname</label><input id="nickname-update" className="text-input" value={newName} maxLength={24} onChange={e=>setNewName(e.target.value)} placeholder="Tu nickname" onKeyDown={e=>{if(e.key==='Enter'&&!editMode)createProfile()}}/>{formError&&<p className="form-error">{formError}</p>}<button className="primary-btn full" onClick={()=>{
    if(newName.trim().length<2){setFormError('Escribe un nickname de al menos dos caracteres.');return;}
    // Modo de edición se controla con su propio flag, no por comparación de nombres.
    if(editMode){saveProfile({...active,name:newName.trim(),avatar:newAvatar});setEditMode(false);setProfileModal(false);setNewName('');setNewAvatar(null);setFormError('');}
    else createProfile();
  }}>{editMode?'Guardar cambios':'Crear perfil desde cero →'}</button></section></div>}
 {deleteId&&<div className="modal-cover"><section className="modal confirmation animate-pop" role="alertdialog" aria-modal="true"><h2>¿Eliminar este perfil?</h2><p>Se borrarán su foto, ELO y resultados guardados en este equipo. No se puede deshacer.</p><div className="confirm-actions"><button className="secondary-btn" onClick={()=>setDeleteId(null)}>Cancelar</button><button className="danger-btn" onClick={()=>deleteProfile(deleteId)}>Eliminar definitivamente</button></div></section></div>}
 </div></>;
}
export default App;
