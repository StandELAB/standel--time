'use client';
import {useState} from 'react';
import {browserClient} from '../../lib/supabase/browser';
type Mode='login'|'activate'|'reset';
export default function LoginForm(){
 const [mode,setMode]=useState<Mode>('login');
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [confirm,setConfirm]=useState('');const [code,setCode]=useState('');
 const [stage,setStage]=useState(0);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const choose=(m:Mode)=>{setMode(m);setStage(0);setCode('');setPassword('');setConfirm('');setMessage('')};
 async function login(){setBusy(true);setMessage('');const {error}=await browserClient().auth.signInWithPassword({email:email.trim().toLowerCase(),password});setBusy(false);if(error)setMessage('Не удалось войти. Проверьте email и пароль.');else window.location.href='/employee'}
 async function requestCode(){setBusy(true);setMessage('');const {error}=await browserClient().auth.signInWithOtp({email:email.trim().toLowerCase(),options:{shouldCreateUser:false}});setBusy(false);if(error)setMessage(error.message);else{setStage(1);setMessage('Код подтверждения отправлен на email.')}}
 async function verify(){setBusy(true);setMessage('');const {error}=await browserClient().auth.verifyOtp({email:email.trim().toLowerCase(),token:code.trim(),type:'email'});setBusy(false);if(error)setMessage(error.message);else{setStage(2);setMessage('Email подтверждён. Придумайте новый пароль.')}}
 async function setNewPassword(){if(password.length<12||password!==confirm){setMessage('Пароль должен содержать не менее 12 символов, оба поля должны совпадать.');return}
 setBusy(true);setMessage('');const supabase=browserClient();const {error}=await supabase.auth.updateUser({password});setBusy(false);if(error)setMessage(error.message);else window.location.href='/employee'}
 return <div style={{maxWidth:440}}>
 <div className="navbuttons"><button className={mode==='login'?'':'secondary'} onClick={()=>choose('login')}>Вход</button><button className={mode==='activate'?'':'secondary'} onClick={()=>choose('activate')}>Установить пароль</button><button className={mode==='reset'?'':'secondary'} onClick={()=>choose('reset')}>Забыли пароль?</button></div>
 <label>Email</label><input autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="employee@standel.se"/>
 {mode==='login'?<><label>Пароль</label><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/><button disabled={busy||!email||!password} onClick={login}>Войти</button></>:
 <>{stage===0&&<><p className="muted">Одноразовый код нужен только при первой установке или восстановлении пароля.</p><button disabled={busy||!email} onClick={requestCode}>Отправить код на email</button></>}
 {stage===1&&<><label>Одноразовый код</label><input autoComplete="one-time-code" value={code} inputMode="numeric" onChange={e=>setCode(e.target.value)}/><button disabled={busy||!code} onClick={verify}>Подтвердить код</button></>}
 {stage===2&&<><label>Новый пароль (от 12 символов)</label><input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/><label>Повторить пароль</label><input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/><button disabled={busy||!password||!confirm} onClick={setNewPassword}>Сохранить пароль</button></>}</>}
 {message&&<p role="status" className="muted">{message}</p>}
 </div>
}
