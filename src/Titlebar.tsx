import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** Tauri 2 frameless window. Buttons need config.app.windows[].decorations=false
 * and explicit window permissions in src-tauri/capabilities/default.json.
 */
export default function Titlebar(){
 const [error,setError]=useState('');
 // Las decoraciones también se desactivan desde la configuración nativa.
 // Este control adicional permite recuperar una configuración anterior al arrancar.
 useEffect(()=>{
  if(!('__TAURI_INTERNALS__' in window)) return;
  getCurrentWindow().setDecorations(false).catch((err)=>{
   console.error('No se pudo quitar la barra nativa de Windows',err);
   setError('No se pudo activar la barra personalizada. Revisa los dos archivos src-tauri de la actualización y reinicia la app.');
  });
 },[]);
 async function action(name:'close'|'minimize'|'toggleMaximize'){
  try{const win=getCurrentWindow();await win[name]();}
  catch(err){console.error('Muakmuak window API',err);setError('Faltan permisos de ventana. Copia los archivos de src-tauri de la actualización y reinicia la app.');}
 }
 return <header className="window-bar" data-tauri-drag-region onDoubleClick={()=>void action('toggleMaximize')}>
  <div className="traffic-controls">
   <button className="traffic red" title="Cerrar" aria-label="Cerrar Muakmuak" onClick={()=>void action('close')}><span aria-hidden="true">×</span></button>
   <button className="traffic yellow" title="Minimizar" aria-label="Minimizar Muakmuak" onClick={()=>void action('minimize')}><span aria-hidden="true">−</span></button>
   <button className="traffic green" title="Maximizar o restaurar" aria-label="Maximizar o restaurar Muakmuak" onClick={()=>void action('toggleMaximize')}><span aria-hidden="true">□</span></button>
  </div>
  <span className="window-bar-title" data-tauri-drag-region>Muakmuak ❀</span>
  <span className="window-bar-grip" data-tauri-drag-region />
  {error&&<div className="window-bar-error" role="alert" onClick={()=>setError('')}>{error} ×</div>}
 </header>;
}
