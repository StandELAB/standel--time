'use client';
import {useEffect,useState} from 'react';
import {browserClient} from '../../lib/supabase/browser';
import {AvatarEditor} from './avatar';
type Detail={first_name:string;last_name:string;phone:string;contact_email:string;address_line:string;postal_code:string;city:string};
type CertFile={id:string;label:string;filename:string;mime_type:string;storage_path:string;created_at:string};
const empty:Detail={first_name:'',last_name:'',phone:'',contact_email:'',address_line:'',postal_code:'',city:''};
const allowed=['pdf','jpg','jpeg','png','webp','gif','heic','heif','doc','docx','xls','xlsx','odt','ods','txt','csv'];
const supportedMime=['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','text/plain','text/csv','application/csv'];
export default function PersonalData({orgId,userId,name,avatarPath}:{orgId:string;userId:string;name:string;avatarPath:string|null}){
 const [details,setDetails]=useState<Detail>(empty);
 const [docs,setDocs]=useState<CertFile[]>([]);
 const [label,setLabel]=useState('');
 const [uploadFile,setUploadFile]=useState<File|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 useEffect(()=>{let mounted=true;async function load(){const db=browserClient();const [profile,files]=await Promise.all([
  db.from('employee_personal_details').select('first_name,last_name,phone,contact_email,address_line,postal_code,city').eq('org_id',orgId).eq('user_id',userId).maybeSingle(),
  db.from('employee_certificate_files').select('id,label,filename,mime_type,storage_path,created_at').eq('org_id',orgId).eq('user_id',userId).order('created_at',{ascending:false})]);
  if(!mounted)return;
  if(profile.error||files.error)setError('Не удалось загрузить личные данные: '+(profile.error?.message||files.error?.message)+'. Проверь миграцию 007.');
  else {setDetails({...empty,...(profile.data||{})});setDocs(files.data||[])}setLoading(false)}void load();return()=>{mounted=false}},[orgId,userId]);
 async function save(){setBusy(true);setError('');setNotice('');const db=browserClient();const {error:e}=await db.from('employee_personal_details').upsert({org_id:orgId,user_id:userId,...details,updated_at:new Date().toISOString()},{onConflict:'org_id,user_id'});setBusy(false);if(e)setError(e.message);else setNotice('Личные данные сохранены')}
 async function upload(){if(!uploadFile||!label.trim())return;setError('');setNotice('');const ext=uploadFile.name.split('.').pop()?.toLowerCase()||'';
  if(!allowed.includes(ext)||!supportedMime.includes(uploadFile.type)){setError('Недопустимый формат. Поддерживаются PDF, изображения, Word, Excel, ODF, TXT и CSV.');return}
  if(uploadFile.size>15*1024*1024){setError('Максимальный размер файла — 15 МБ');return}
  if(!globalThis.crypto?.randomUUID){setError('Для загрузки требуется HTTPS и современный браузер');return}
  setBusy(true);const db=browserClient();const storagePath=`${userId}/${crypto.randomUUID()}`;
  const uploaded=await db.storage.from('standel-certificates').upload(storagePath,uploadFile,{upsert:false,contentType:uploadFile.type});
  if(uploaded.error){setBusy(false);setError(uploaded.error.message);return}
  const {data,error:e}=await db.from('employee_certificate_files').insert({org_id:orgId,user_id:userId,label:label.trim(),filename:uploadFile.name.slice(0,255),mime_type:uploadFile.type,storage_path:storagePath}).select('id,label,filename,mime_type,storage_path,created_at').single();
  setBusy(false);if(e){setError('Файл загружен, но запись не создана: '+e.message+'. Обратись к администратору.');return}setDocs(old=>[data,...old]);setLabel('');setUploadFile(null);setNotice('Сертификат загружен')}
 async function download(doc:CertFile){setError('');const {data,error:e}=await browserClient().storage.from('standel-certificates').createSignedUrl(doc.storage_path,60,{download:doc.filename});if(e||!data?.signedUrl){setError(e?.message||'Не удалось открыть документ');return}window.open(data.signedUrl,'_blank','noopener,noreferrer')}
 async function remove(doc:CertFile){if(!window.confirm(`Удалить ${doc.filename}?`))return;setError('');const db=browserClient();const {error:e}=await db.from('employee_certificate_files').delete().eq('id',doc.id).eq('org_id',orgId).eq('user_id',userId);if(e){setError(e.message);return}const {error:storageError}=await db.storage.from('standel-certificates').remove([doc.storage_path]);setDocs(old=>old.filter(d=>d.id!==doc.id));if(storageError)setNotice('Запись удалена, но файл может остаться в хранилище: '+storageError.message);else setNotice('Сертификат удалён')}
 const field=(k:keyof Detail,title:string,type='text')=><div><label htmlFor={'profile-'+k}>{title}</label><input id={'profile-'+k} type={type} maxLength={k==='contact_email'?254:k==='address_line'?250:k==='city'?120:k==='first_name'||k==='last_name'?100:60} value={details[k]} onChange={e=>setDetails(old=>({...old,[k]:e.target.value}))}/></div>;
 return <><section className="panel"><h2>Моя фотография</h2><p className="muted">Изменить аватар можно только здесь. Он будет отображаться в других разделах после обновления страницы.</p><AvatarEditor userId={userId} name={name} initialPath={avatarPath}/></section>
 <section className="panel"><h2>Личные данные</h2><p className="muted">Контактные данные видны вам и администратору StandEL AB. Не загружайте сюда персональный номер (personnummer), паспорт или медицинские сведения.</p>{loading?<p>Загрузка…</p>:<><div className="cols">{field('first_name','Имя')}{field('last_name','Фамилия')}{field('phone','Телефон','tel')}{field('contact_email','Контактный email','email')}{field('address_line','Адрес')}{field('postal_code','Почтовый индекс')}{field('city','Город')}</div><button disabled={busy} onClick={()=>void save()}>Сохранить личные данные</button></>}</section>
 <section className="panel"><h2>Мои сертификаты и удостоверения</h2><p className="muted">Загружайте свои рабочие сертификаты: ID06, Lift, Fallskydd, SSG и другие. Форматы PDF, JPG, PNG, WebP, GIF, HEIC, Word, Excel, ODF, TXT, CSV — до 15 МБ. Файлы хранятся в закрытом Supabase Storage.</p><label htmlFor="cert-title">Название сертификата</label><input id="cert-title" maxLength={160} value={label} onChange={e=>setLabel(e.target.value)} placeholder="Например: Liftutbildning"/><label htmlFor="cert-file">Файл</label><input id="cert-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.doc,.docx,.xls,.xlsx,.odt,.ods,.txt,.csv" onChange={e=>setUploadFile(e.target.files?.[0]||null)}/><button disabled={busy||!uploadFile||!label.trim()} onClick={()=>void upload()}>{busy?'Сохранение…':'Загрузить сертификат'}</button><h3>Мои файлы</h3>{docs.length===0?<p className="muted">Загруженных сертификатов пока нет.</p>:<div className="table-scroll"><table><thead><tr><th>Название</th><th>Файл</th><th>Дата</th><th>Действия</th></tr></thead><tbody>{docs.map(d=><tr key={d.id}><td>{d.label}</td><td>{d.filename}</td><td>{new Date(d.created_at).toLocaleDateString('ru-RU')}</td><td><button type="button" className="secondary" onClick={()=>void download(d)}>Скачать</button> <button type="button" className="secondary" onClick={()=>void remove(d)}>Удалить</button></td></tr>)}</tbody></table></div>}</section>
 {error&&<p className="panel error" role="alert">{error}</p>}{notice&&<p className="panel ok" role="status">{notice}</p>}</>;
}
