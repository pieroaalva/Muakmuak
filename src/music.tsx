import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';

type Song = {ownerId?:string;id:string; title:string; artist:string; collection:string; filename:string; cover?:string; blob:Blob; addedAt:number};
type OnlineTrack = {id:string; name:string; artist_name:string; audio:string; image:string; license_ccurl?:string};
type Playing = {kind:'local';song:Song}|{kind:'online';track:OnlineTrack};
type Coords = {x:number;y:number};
const DB_NAME='muakmuak-audio-v1'; // Igual que v4 y v5: no se borran canciones.
const STORE='songs';
const AUDIUS_HOSTS=['https://api.audius.co/v1','https://discoveryprovider.audius.co/v1'] as const;
const AUDIUS_APP='MuakmuakStudy';
const uid=()=>`${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
const STORAGE_POSITION='muakmuak:v6:player-pos';
const prettyTime=(seconds:number)=>!Number.isFinite(seconds)?'0:00':`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const getPosition=():Coords=>{try{const p=JSON.parse(localStorage.getItem(STORAGE_POSITION)||'null');if(Number.isFinite(p?.x)&&Number.isFinite(p?.y))return p;}catch{/* default */}return {x:window.innerWidth-84,y:125};};
const clampPosition=(p:Coords):Coords=>({x:Math.max(8,Math.min(window.innerWidth-64,p.x)),y:Math.max(48,Math.min(window.innerHeight-72,p.y))});
const dockPosition=(p:Coords):Coords=>{const v=clampPosition(p);const edgePadding=12;const maxX=Math.max(edgePadding,window.innerWidth-54-edgePadding);const maxY=Math.max(50,window.innerHeight-65);const top=50;
 const distances=[{side:'left',d:v.x},{side:'right',d:window.innerWidth-(v.x+54)},{side:'top',d:v.y-top},{side:'bottom',d:window.innerHeight-(v.y+54)}];distances.sort((a,b)=>a.d-b.d);
 if(distances[0].side==='left')return {x:edgePadding,y:Math.min(maxY,Math.max(top,v.y))};
 if(distances[0].side==='right')return {x:maxX,y:Math.min(maxY,Math.max(top,v.y))};
 if(distances[0].side==='top')return {x:Math.max(edgePadding,Math.min(maxX,v.x)),y:top};
 return {x:Math.max(edgePadding,Math.min(maxX,v.x)),y:maxY};
};
const isOverTrash=(p:Coords)=>Math.hypot(p.x+27-window.innerWidth/2,p.y+27-window.innerHeight/2)<88;


function openLibrary():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function getSongs(profileId:string):Promise<Song[]>{
 const db=await openLibrary();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  const store=tx.objectStore(STORE);
  const request=store.getAll();
  request.onsuccess=()=>{
   const items=request.result as Song[];
   // Migración una sola vez: las canciones antiguas sin propietario pertenecen
   // a la cuenta activa durante la primera apertura de esta versión.
   const hasLegacy=items.some(s=>!s.ownerId);
   const legacyKey='muakmuak:v10:legacy-audio-owner';
   let legacyOwner=localStorage.getItem(legacyKey);
   if(hasLegacy&&!legacyOwner){legacyOwner=profileId;localStorage.setItem(legacyKey,profileId);}
   for(const song of items){if(!song.ownerId){song.ownerId=legacyOwner||profileId;store.put(song);}}
   const mine=items.filter(song=>(song.ownerId||legacyOwner||profileId)===profileId);
   tx.oncomplete=()=>{db.close();resolve(mine.sort((a,b)=>b.addedAt-a.addedAt));};
  };
  request.onerror=()=>{db.close();reject(request.error);};
  tx.onerror=()=>{db.close();reject(tx.error);};
 });
}
async function saveSong(song:Song):Promise<void>{const db=await openLibrary();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(song);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
async function removeSong(id:string):Promise<void>{const db=await openLibrary();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
export async function deleteMusicForProfile(profileId:string):Promise<void>{
 const db=await openLibrary();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  const store=tx.objectStore(STORE);
  const request=store.getAll();
  request.onsuccess=()=>{
   for(const song of request.result as Song[]){if(song.ownerId===profileId)store.delete(song.id);}
  };
  tx.oncomplete=()=>{db.close();resolve();};
  tx.onerror=()=>{db.close();reject(tx.error);};
 });
}
async function makeCover(file:File):Promise<string>{
 if(!file.type.startsWith('image/')||file.size>8_000_000)throw new Error('Selecciona una imagen menor de 8 MB.');
 const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('No se pudo leer la imagen.'));r.readAsDataURL(file);});
 return new Promise<string>((resolve,reject)=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=240;c.height=240;const ctx=c.getContext('2d');if(!ctx)return reject(new Error('Error preparando la portada.'));const side=Math.min(img.width,img.height);ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,240,240);resolve(c.toDataURL('image/jpeg',.78));};img.onerror=()=>reject(new Error('Imagen inválida.'));img.src=data;});
}

export default function Music({showPage,profileId}:{showPage:boolean;profileId:string}){
 const [songs,setSongs]=useState<Song[]>([]);
 const [playing,setPlaying]=useState<Playing|null>(null);
 const [isPlaying,setIsPlaying]=useState(false);
 const [volume,setVolume]=useState(()=>{const v=Number(localStorage.getItem('muakmuak:v5:volume'));return Number.isFinite(v)&&v>=0&&v<=1?v:.65;});
 const [shuffle,setShuffle]=useState(false);
 const [repeat,setRepeat]=useState(false);
 const [elapsed,setElapsed]=useState(0);
 const [duration,setDuration]=useState(0);
 const [collection,setCollection]=useState('Todas');
 const [newCollection,setNewCollection]=useState('General');
 const [status,setStatus]=useState('');
 const [expanded,setExpanded]=useState(false);
 const [coords,setCoords]=useState<Coords>(()=>dockPosition(getPosition()));
 const [discarded,setDiscarded]=useState(false);
 const [overTrash,setOverTrash]=useState(false);
 const [dragging,setDragging]=useState(false);
 const [query,setQuery]=useState('');
 const [online,setOnline]=useState<OnlineTrack[]>([]);
 const [searching,setSearching]=useState(false);
 const audioRef=useRef<HTMLAudioElement|null>(null);
 const urlRef=useRef<string|null>(null);
 const filesInput=useRef<HTMLInputElement|null>(null);
 const coverInput=useRef<HTMLInputElement|null>(null);
 const coverTarget=useRef<string|null>(null);
 const drag=useRef<{id:number;x:number;y:number;startX:number;startY:number;moved:boolean}|null>(null);
 const closePanelTimer=useRef<number|null>(null);
 const showPanel=()=>{if(closePanelTimer.current!==null){window.clearTimeout(closePanelTimer.current);closePanelTimer.current=null;}setExpanded(true);};
 const delayHide=()=>{if(closePanelTimer.current!==null)window.clearTimeout(closePanelTimer.current);closePanelTimer.current=window.setTimeout(()=>setExpanded(false),190);};
 const activeTitle=playing?.kind==='local'?playing.song.title:playing?.track.name||'Mi música';
 const activeArtist=playing?.kind==='local'?playing.song.artist:playing?.track.artist_name||'Pausa para escuchar';
 const activeCover=playing?.kind==='local'?playing.song.cover:playing?.track.image;
 const collections=['Todas',...Array.from(new Set(songs.map(s=>s.collection||'General'))).sort()];
 const visibleSongs=songs.filter(s=>collection==='Todas'||s.collection===collection);
 const reload=useCallback(async()=>{try{setSongs(await getSongs(profileId));}catch{setStatus('No se pudo leer la biblioteca local.');}},[profileId]);
 useEffect(()=>{void reload();},[reload]);
 useEffect(()=>{const audio=audioRef.current;if(audio)audio.volume=volume;try{localStorage.setItem('muakmuak:v5:volume',String(volume));}catch{/* */}},[volume]);
 useEffect(()=>{try{localStorage.setItem(STORAGE_POSITION,JSON.stringify(coords));}catch{/* */}},[coords]);
 useEffect(()=>{const onResize=()=>setCoords(p=>dockPosition(p));window.addEventListener('resize',onResize);return()=>window.removeEventListener('resize',onResize);},[]);
 useEffect(()=>{
  const audio=audioRef.current;if(!audio)return;
  audio.pause();setIsPlaying(false);setElapsed(0);setDuration(0);
  if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null;}
  if(!playing){audio.removeAttribute('src');return;}
  const url=playing.kind==='local'?URL.createObjectURL(playing.song.blob):playing.track.audio;
  if(playing.kind==='local')urlRef.current=url;
  audio.src=url;audio.load();
  void audio.play().then(()=>setIsPlaying(true)).catch(()=>{setStatus('Pulsa reproducir para iniciar el audio.');});
  return()=>{audio.pause();if(urlRef.current===url){URL.revokeObjectURL(url);urlRef.current=null;}};
 },[playing]); // No depende de la página, las búsquedas ni la lista; nunca reinicia por navegar.

 function togglePlay(){setDiscarded(false);const a=audioRef.current;if(!a)return;if(!playing){if(songs.length)setPlaying({kind:'local',song:songs[0]});return;}if(a.paused){void a.play().then(()=>setIsPlaying(true)).catch(()=>setStatus('No se pudo reproducir esta canción.'));}else{a.pause();setIsPlaying(false);}}
 function playLocal(song:Song){setDiscarded(false);if(playing?.kind==='local'&&playing.song.id===song.id){togglePlay();return;}setPlaying({kind:'local',song});}
 function playOnline(track:OnlineTrack){setDiscarded(false);if(playing?.kind==='online'&&playing.track.id===track.id){togglePlay();return;}setPlaying({kind:'online',track});}
 function queue(){if(playing?.kind==='online')return online.map(track=>({kind:'online' as const,track}));return (visibleSongs.length?visibleSongs:songs).map(song=>({kind:'local' as const,song}));}
 function stepSong(direction:1|-1){setDiscarded(false);const entries=queue();if(!entries.length)return;let index=entries.findIndex(t=>t.kind===playing?.kind&&(t.kind==='local'?t.song.id: t.track.id)===(playing?.kind==='local'?playing.song.id:playing?.track.id));if(shuffle&&entries.length>1){const currentIndex=index;do{index=Math.floor(Math.random()*entries.length)}while(index===currentIndex);}else index=(index+direction+entries.length)%entries.length;setPlaying(entries[index]);}
 function onEnded(){if(repeat&&audioRef.current){audioRef.current.currentTime=0;void audioRef.current.play().then(()=>setIsPlaying(true)).catch(()=>setIsPlaying(false));return;}stepSong(1);}
 async function importFiles(event:ChangeEvent<HTMLInputElement>){const files=Array.from(event.target.files||[]);event.target.value='';let saved=0;for(const f of files){if(!f.type.startsWith('audio/')&&!/\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(f.name))continue;try{await saveSong({ownerId:profileId,id:uid(),title:f.name.replace(/\.[^.]+$/,'').replace(/[_-]/g,' '),artist:'Mi biblioteca',filename:f.name,collection:newCollection.trim().slice(0,32)||'General',blob:f,addedAt:Date.now()+saved});saved++;}catch{setStatus('Almacenamiento lleno o inaccesible.');break;}}await reload();if(saved)setStatus(`${saved} canción(es) importada(s) y guardada(s) localmente.`);}
 async function updateCover(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];event.target.value='';const id=coverTarget.current;if(!file||!id)return;const song=songs.find(s=>s.id===id);if(!song)return;try{await saveSong({...song,cover:await makeCover(file)});await reload();setStatus('Portada guardada.');}catch(e){setStatus(e instanceof Error?e.message:'No se pudo guardar la portada.');}}
 async function changeCollection(song:Song,newValue:string){await saveSong({...song,collection:newValue||'General'});await reload();}
 async function deleteLocal(song:Song){if(!confirm(`¿Eliminar "${song.title}" de Muakmuak? El archivo original no se borra.`))return;if(playing?.kind==='local'&&playing.song.id===song.id)setPlaying(null);await removeSong(song.id);await reload();}
 async function searchMusic(){
  if(query.trim().length<2){setStatus('Escribe al menos dos letras para buscar.');return;}
  setSearching(true);setStatus('');setOnline([]);
  try {
   let payload:unknown=null;
   let searchHost:string=AUDIUS_HOSTS[0];
   let lastError='Servicio no disponible';
   for(const host of AUDIUS_HOSTS){
    try {
     const url=new URL(`${host}/tracks/search`);
     url.search=new URLSearchParams({query:query.trim(),limit:'18',app_name:AUDIUS_APP}).toString();
     const response=await fetch(url,{signal:AbortSignal.timeout(9500)});
     if(!response.ok)throw new Error(`Audius respondió ${response.status}`);
     payload=await response.json(); searchHost=host; break;
    }catch(e){lastError=e instanceof Error?e.message:'Sin respuesta del servicio';}
   }
   if(payload===null)throw new Error(lastError);
   const items=(payload as {data?:unknown[]})?.data;
   if(!Array.isArray(items))throw new Error('El servicio devolvió una respuesta inesperada.');
   const results:OnlineTrack[]=items.flatMap(item=>{
    if(!item || typeof item!=='object')return [];
    const t=item as {id?:unknown;title?:unknown;is_streamable?:boolean;is_stream_gated?:boolean;user?:{name?:string;handle?:string};artwork?:Record<string,string>};
    if(typeof t.id!=='string'||typeof t.title!=='string'||t.is_streamable===false||t.is_stream_gated===true)return [];
    const artwork=t.artwork?.['150x150']||t.artwork?.['480x480']||'';
    const audio=new URL(`${searchHost}/tracks/${encodeURIComponent(t.id)}/stream`);
    audio.searchParams.set('app_name',AUDIUS_APP);
    return [{id:t.id,name:t.title,artist_name:t.user?.name||t.user?.handle||'Artista de Audius',audio:audio.toString(),image:artwork}];
   });
   setOnline(results);
   setStatus(results.length?'':'No se encontraron canciones reproducibles en Audius. Prueba otro nombre o estilo.');
  }catch(err){
   setStatus(`No fue posible consultar Audius. ${err instanceof Error?err.message:'Revisa la conexión.'} Puedes seguir usando tus MP3 y WAV importados.`);
  }finally{setSearching(false);}
 }
 function startDrag(e:ReactPointerEvent<HTMLButtonElement>){if(e.button!==0)return;setExpanded(false);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,startX:coords.x,startY:coords.y,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}
 function moveDrag(e:ReactPointerEvent<HTMLButtonElement>){const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>5)d.moved=true;if(d.moved){setDragging(true);const next=clampPosition({x:d.startX+dx,y:d.startY+dy});setCoords(next);setOverTrash(isOverTrash(next));}}
 function stopDrag(e:ReactPointerEvent<HTMLButtonElement>){const d=drag.current;if(!d||d.id!==e.pointerId)return;drag.current=null;setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(d.moved){const endPos=clampPosition({x:d.startX+e.clientX-d.x,y:d.startY+e.clientY-d.y});if(isOverTrash(endPos)){
   // Elimina solo la burbuja/reproducción actual, nunca el archivo importado.
   setPlaying(null);setDiscarded(true);setExpanded(false);
  }else{setCoords(dockPosition(endPos));setExpanded(false);}
 }else{setExpanded(v=>!v);}setOverTrash(false);}
 const panelWidth=Math.min(320,Math.max(240,window.innerWidth-32));
 const panelToRight=coords.x<window.innerWidth/2;
 const panelX=panelToRight?Math.min(window.innerWidth-panelWidth-12,coords.x+65):Math.max(12,coords.x-panelWidth-12);
 const panelY=Math.max(48,Math.min(coords.y-76,Math.max(48,window.innerHeight-255)));
 const playerPanelStyle={left:panelX,top:panelY,width:panelWidth};
 return <>
  <audio ref={audioRef} preload="metadata" onTimeUpdate={e=>setElapsed(e.currentTarget.currentTime)} onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} onEnded={onEnded} onError={()=>{if(playing)setStatus('No se pudo reproducir este audio. Prueba otra canción o verifica la conexión.');setIsPlaying(false);}} />
  <input hidden ref={filesInput} type="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac" multiple onChange={e=>void importFiles(e)}/>
  <input hidden ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void updateCover(e)}/>
  {showPage&&<section className="music-page page-enter">
   <div className="music-heading-group"><div className="heading"><div className="eyebrow">Música para acompañarte</div><h1>Mi música ♫</h1><p>Escucha canciones mientras estudias, practicas o cambias de sección. El reproductor flotante se puede arrastrar.</p></div>
   <div className="music-toolbar"><button className="primary-btn" onClick={()=>filesInput.current?.click()}>＋ Importar música</button><label>Mi colección <input className="music-collection-input" value={newCollection} onChange={e=>setNewCollection(e.target.value)} maxLength={32}/></label><label>Mostrar <select value={collection} onChange={e=>setCollection(e.target.value)}>{collections.map(c=><option key={c}>{c}</option>)}</select></label></div></div>
   <section className="music-online-v6"><div className="eyebrow">Música independiente en línea</div><h2>Encuentra música para estudiar</h2><p>Busca canciones, artistas y estilos en <strong>Audius</strong>. Escucha temas completos cuando el artista autorice su reproducción; no necesitas cuenta ni pegar enlaces. Este catálogo es diferente del de YouTube.</p><div className="music-search-row"><input type="search" placeholder="Canción, artista, lo-fi, instrumental…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void searchMusic();}}/><button className="primary-btn" disabled={searching} onClick={()=>void searchMusic()}>{searching?'Buscando…':'Buscar canciones'}</button></div>
    {online.length>0&&<div className="online-track-list">{online.map(t=><article className="online-track" key={t.id}><div className="online-track-art">{t.image?<img src={t.image} alt="" loading="lazy"/>:'♫'}</div><div><strong>{t.name}</strong><small>{t.artist_name}</small></div><button className="secondary-btn" onClick={()=>playOnline(t)}>{playing?.kind==='online'&&playing.track.id===t.id&&isPlaying?'Pausar':'▶ Escuchar'}</button></article>)}</div>}
   </section>
   {status&&<div className="music-status" role="status">{status}</div>}
   {!songs.length?<div className="music-empty"><div>♫</div><h2>Tu biblioteca local está esperando</h2><p>Importa MP3, WAV, M4A u otros audios compatibles y organiza tus colecciones. Seguirán disponibles sin internet.</p><button className="secondary-btn" onClick={()=>filesInput.current?.click()}>Elegir canciones</button></div>:<div className="music-list">{visibleSongs.map(song=><article className="music-song" key={song.id}><button className="music-art" onClick={()=>playLocal(song)}>{song.cover?<img src={song.cover} alt=""/>:'♫'}</button><div className="music-song-text"><strong>{song.title}</strong><small title={song.filename}>{song.artist} · {song.collection||'General'}</small></div><button className="music-icon-btn" title="Reproducir / pausar" onClick={()=>playLocal(song)}>{playing?.kind==='local'&&playing.song.id===song.id&&isPlaying?'❚❚':'▶'}</button><label className="music-small-label">Colección <select value={song.collection||'General'} onChange={e=>void changeCollection(song,e.target.value)}>{Array.from(new Set([song.collection||'General',newCollection,...collections.filter(c=>c!=='Todas')])).map(c=><option key={c}>{c}</option>)}</select></label><button className="music-icon-btn" title="Añadir portada" onClick={()=>{coverTarget.current=song.id;coverInput.current?.click();}}>▧</button><button className="music-icon-btn delete" title="Quitar canción" onClick={()=>void deleteLocal(song)}>×</button></article>)}</div>}
  </section>}
  {overTrash&&<div className="music-drop-zone" aria-live="polite"><span>×</span><strong>Suelta para ocultar</strong><small>No borra tu música</small></div>}
  {!discarded&&(songs.length>0||playing!==null)&&<div className={`floating-player ${expanded?'is-open':''} ${dragging?'is-dragging':''} ${panelToRight?'player-panel-right':'player-panel-left'}`} style={{left:coords.x,top:coords.y}} onMouseEnter={()=>{if(!drag.current)showPanel()}} onMouseLeave={delayHide} onFocusCapture={showPanel} onBlurCapture={delayHide}>
    <button type="button" className={`music-fab ${isPlaying?'music-fab-playing':''}`} title="Arrastra para mover. Clic para mostrar controles." aria-label="Reproductor musical flotante; arrastra para mover" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={()=>{drag.current=null;setDragging(false);setOverTrash(false)}} onDragStart={e=>e.preventDefault()}><span>{activeCover?<img src={activeCover} alt=""/>:'♫'}</span></button>
    <section className="floating-player-panel" style={playerPanelStyle} onMouseEnter={showPanel} onMouseLeave={delayHide} aria-label="Controles de música"><div className="floating-song-title"><strong title={activeTitle}>{activeTitle}</strong><small>{activeArtist}</small></div><div className="music-control-line"><button title="Anterior" onClick={()=>stepSong(-1)}>⏮</button><button className="music-play" title={isPlaying?'Pausar':'Reproducir'} onClick={togglePlay}>{isPlaying?'❚❚':'▶'}</button><button title="Siguiente" onClick={()=>stepSong(1)}>⏭</button><button className={shuffle?'enabled':''} title="Aleatorio" aria-pressed={shuffle} onClick={()=>setShuffle(v=>!v)}>⤨</button><button className={repeat?'enabled':''} title="Repetir canción" aria-pressed={repeat} onClick={()=>setRepeat(v=>!v)}>↻</button></div><div className="music-timeline"><span>{prettyTime(elapsed)}</span><input aria-label="Posición de la canción" type="range" min={0} max={duration||1} step={1} value={Math.min(elapsed,duration||1)} onChange={e=>{if(audioRef.current)audioRef.current.currentTime=Number(e.target.value);}}/><span>{prettyTime(duration)}</span></div><label className="music-volume">Volumen <input aria-label="Volumen" type="range" min={0} max={1} step={.01} value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label></section>
  </div>}
 </>;
}
