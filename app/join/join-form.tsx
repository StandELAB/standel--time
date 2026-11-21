'use client';
import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Suspense} from 'react';
import {browserClient} from '../../lib/supabase/browser';
function Form(){
 const params=useSearchParams();const token=params.get('token')||'';const [channel,setChannel]=useState<'email'|'sms'>('email');const [contact,setContact]=useState('');const [code,setCode]=useState('');const [stage,setStage]=useState(0);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function send(){setBusy(true);setMessage('');const db=browserClient();const contactValue=contact.trim();const result=channel==='email'?await db.auth.signInWithOtp({email:contactValue.toLowerCase(),options:{shouldCreateUser:false}}):await db.auth.signInWithOtp({phone:contactValue,options:{shouldCreateUser:false}});setBusy(false);if(result.error)setMessage(result.error.message);else setStage(1)}
 async function activate(){setBusy(true);setMessage('');const db=browserClient();const value=contact.trim();const {error}=await db.auth.verifyOtp(channel==='email'?{email:value.toLowerCase(),token:code,type:'email'}:{phone:value,token:code,type:'sms'});if(error){setMessage(error.message);setBusy(false);return}const response=await fetch('/api/invitations/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const body=await response.json();setBusy(false);if(!response.ok){setMessage(body.error||'Ошибка активации');return}window.location.href=body.role==='foreman'?'/employee':'/employee'}
 if(!token)return <p className="error">Откройте персональную ссылку из email или SMS.</p>;
 return <div style={{maxWidth:450}}><label>Как получили приглашение?</label><select value={channel} onChange={e=>{setChannel(e.target.value as 'email'|'sms');setStage(0)}}><option value="email">Email</option><option value="sms">SMS</option></select><label>{channel==='email'?'Адрес email из приглашения':'Телефон из приглашения (+46...)'}</label><input value={contact} onChange={e=>setContact(e.target.value)}/>{stage===1&&<><label>Код подтверждения</label><input inputMode="numeric" value={code} onChange={e=>setCode(e.target.value)}/></>}<button disabled={busy||!contact||stage===1&&!code} onClick={stage===0?send:activate}>{stage===0?'Отправить код':'Подтвердить и активировать'}</button>{message&&<p className="error">{message}</p>}</div>
}
export default function JoinForm(){return <Suspense fallback={<p>Загрузка…</p>}><Form/></Suspense>}
