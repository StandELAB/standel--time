'use client';
import {Suspense,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {browserClient} from '../../lib/supabase/browser';
function Form(){
 const token=useSearchParams().get('token')||'';
 const [channel,setChannel]=useState<'email'|'sms'>('email');const [contact,setContact]=useState('');const [code,setCode]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [stage,setStage]=useState(0);const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('');
 async function send(){setBusy(true);setMsg('');const {error}=await browserClient().auth.signInWithOtp(channel==='email'?{email:contact.trim().toLowerCase(),options:{shouldCreateUser:false}}:{phone:contact.trim(),options:{shouldCreateUser:false}});setBusy(false);if(error)setMsg(error.message);else setStage(1)}
 async function accept(){setBusy(true);setMsg('');const db=browserClient();const {error}=await db.auth.verifyOtp(channel==='email'?{email:contact.trim().toLowerCase(),token:code.trim(),type:'email'}:{phone:contact.trim(),token:code.trim(),type:'sms'});if(error){setMsg(error.message);setBusy(false);return}
 const response=await fetch('/api/invitations/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const body=await response.json();setBusy(false);if(!response.ok){setMsg(body.error||'Не удалось принять приглашение');return}setStage(2)}
 async function complete(){if(password.length<12||password!==confirm){setMsg('Пароль от 12 символов; повторите без ошибок.');return}setBusy(true);const {error}=await browserClient().auth.updateUser({password});setBusy(false);if(error)setMsg(error.message);else window.location.href='/employee'}
 if(!token)return <p className="error">Нужна личная ссылка приглашения от администратора.</p>;
 return <div style={{maxWidth:450}}><p className="muted">Подтвердите адрес один раз, затем создайте постоянный пароль.</p><label>Канал приглашения</label><select value={channel} onChange={e=>{setChannel(e.target.value as 'email'|'sms');setStage(0)}} disabled={stage===2}><option value="email">Email</option><option value="sms">SMS</option></select><label>{channel==='email'?'Email из приглашения':'Телефон из приглашения'}</label><input type={channel==='email'?'email':'tel'} value={contact} onChange={e=>setContact(e.target.value)} disabled={stage===2}/>
 {stage===0&&<button disabled={busy||!contact} onClick={send}>Отправить код</button>}
 {stage===1&&<><label>Код из письма</label><input value={code} inputMode="numeric" onChange={e=>setCode(e.target.value)}/><button disabled={busy||!code} onClick={accept}>Активировать учётную запись</button></>}
 {stage===2&&<><label>Придумайте пароль (от 12 символов)</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)}/><label>Повторите пароль</label><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}/><button disabled={busy||!password||!confirm} onClick={complete}>Сохранить пароль и войти</button></>}
 {msg&&<p role="status" className="error">{msg}</p>}
 </div>
}
export default function JoinForm(){return <Suspense fallback={<p>Загрузка...</p>}><Form/></Suspense>}
