import { useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';

type Asset={name:string;browser_download_url:string;digest?:string;size?:number};
type Release={tag_name:string;html_url:string;body?:string;assets:Asset[]};
const ZIP_NAME='Muakmuak-portable-win-x64.zip';
// El creador configura este valor al compilar. A los usuarios nunca se les pide GitHub.
// GitHub Actions lo inyecta automáticamente con github.repository al publicar un Release.
const PUBLISHED_REPO=(import.meta.env.VITE_GITHUB_REPO || '').trim();
const reRepo=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const configured=reRepo.test(PUBLISHED_REPO);
function compareVersions(a:string,b:string){
 const A=a.replace(/^v/i,'').split(/[.-]/).slice(0,3).map(x=>Number(x)||0);
 const B=b.replace(/^v/i,'').split(/[.-]/).slice(0,3).map(x=>Number(x)||0);
 for(let i=0;i<3;i++){if(A[i]>B[i])return 1;if(A[i]<B[i])return -1;}return 0;
}
export default function Updates(){

 const [message,setMessage]=useState('');
 const [working,setWorking]=useState(false);
 const [latest,setLatest]=useState<Release|null>(null);
 const [current,setCurrent]=useState('');
 const [asset,setAsset]=useState<Asset|null>(null);
 const check=async()=>{
  setLatest(null);setAsset(null);
  if(!configured){setMessage('Las actualizaciones estarán disponibles cuando el desarrollador publique la app en GitHub Releases. No necesitas cuenta de GitHub.');return;}
  setWorking(true);setMessage('Buscando la última versión…');
  try{
   const [owner,name]=PUBLISHED_REPO.split('/');
   const res=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/latest`,{headers:{Accept:'application/vnd.github+json'}});
   if(!res.ok)throw new Error(res.status===404?'Todavía no hay una versión publicada en GitHub Releases.':`GitHub respondió ${res.status}.`);
   const data=await res.json() as Release;
   const v=await getVersion();setCurrent(v);setLatest(data);
   const file=data.assets?.find(a=>a.name===ZIP_NAME)||null;setAsset(file);
   if(compareVersions(data.tag_name,v)>0){setMessage(file?.digest?.startsWith('sha256:')?'¡Actualización disponible!':'Hay una versión nueva. Falta el paquete portable verificable; consulta la publicación.');}
   else setMessage(`Muakmuak está actualizado (${v}).`);
  }catch(e){setMessage(e instanceof Error?e.message:'No se pudo consultar GitHub.');}
  finally{setWorking(false);}
 };
 const install=async()=>{
  if(!latest||!asset||!asset.digest?.startsWith('sha256:'))return;
  if(!confirm(`¿Actualizar Muakmuak a ${latest.tag_name}? La aplicación se cerrará, sustituirá el ejecutable y volverá a abrirse. Tu progreso permanecerá guardado.`))return;
  setWorking(true);setMessage('Preparando actualización portable…');
  try{await invoke('install_portable_update',{assetUrl:asset.browser_download_url,sha256:asset.digest.slice(7)});}
  catch(e){setWorking(false);setMessage(`No fue posible iniciar la actualización: ${String(e)}`);}
 };
 const available=!!latest&&compareVersions(latest.tag_name,current)>0;
 return <section className="muak-update-block" aria-label="Actualizaciones de Muakmuak">
  <strong>Actualizaciones desde GitHub</strong>
  <p>Comprueba si existe una nueva versión de Muakmuak. No necesitas registrarte ni tener cuenta en GitHub.</p>
  {!configured&&<p className="muak-update-setup">El creador todavía no ha configurado las publicaciones de Muakmuak. Esta opción se habilitará en la versión pública.</p>}
  <div className="muak-update-actions"><button className="secondary-btn" disabled={working||!configured} title={!configured?'Disponible cuando el desarrollador publique Muakmuak':undefined} onClick={()=>void check()}>{working?'Comprobando…':'Buscar actualizaciones'}</button>
   {available&&asset?.digest?.startsWith('sha256:')&&<button className="primary-btn" disabled={working} onClick={()=>void install()}>Actualizar y reiniciar ↗</button>}
  </div>
  {message&&<p className="muak-update-status" role="status">{message}</p>}
  {latest&&<a href={latest.html_url} target="_blank" rel="noreferrer">Ver publicación {latest.tag_name} en GitHub ↗</a>}
 </section>;
}
