'use client';
import {useEffect,useState} from 'react';
import {browserClient} from '../../lib/supabase/browser';
export type AvatarRow={user_id:string,storage_path:string};
export function Avatar({userId,name,path,size=36}:{userId:string,name:string,path?:string|null,size?:number}){
 const [url,setUrl]=useState('');
 useEffect(()=>{
  let active=true;
  if(!path){setUrl('');return;}
  browserClient().storage.from('standel-avatars').createSignedUrl(path,300).then(({data})=>{
   if(active)setUrl(data?.signedUrl||'');
  });
  return()=>{active=false};
 },[userId,path]);
 return <span className="standel-avatar" style={{width:size,height:size}} aria-label={'Фото: '+name}>
 {url?<img alt={name} src={url}/>:name.trim().slice(0,1).toUpperCase()||'•'}</span>;
}
export function AvatarEditor({userId,name,initialPath}:{userId:string,name:string,initialPath?:string|null}){
 const [path,setPath]=useState(initialPath||null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function change(file?:File){
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024){setError('JPG, PNG или WebP, максимум 2 МБ');return}
  setBusy(true);setError('');const db=browserClient();const storagePath=userId+'/avatar';
  const up=await db.storage.from('standel-avatars').upload(storagePath,file,{upsert:true,contentType:file.type,cacheControl:'0'});
  if(up.error){setError(up.error.message);setBusy(false);return}
  const result=await db.from('profile_avatars').upsert({user_id:userId,storage_path:storagePath,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  setBusy(false);if(result.error)setError(result.error.message);else{setPath(storagePath);setError('Фото сохранено. Обнови страницу, чтобы увидеть новую фотографию.')}
 }
 return <div className="avatar-editor"><Avatar userId={userId} name={name} path={path} size={50}/><div><label>Мой аватар (JPG/PNG/WebP, до 2 МБ)</label><input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>void change(e.target.files?.[0])}/>{error&&<small role="status">{error}</small>}</div></div>
}
