'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {browserClient} from '../../lib/supabase/browser';
export default function Header(){
 const [loggedIn,setLoggedIn]=useState(false);
 const [ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false);
 const router=useRouter();
 useEffect(()=>{
  const db=browserClient();let live=true;
  void db.auth.getUser().then(({data})=>{if(live){setLoggedIn(!!data.user);setReady(true)}}).catch(()=>{if(live)setReady(true)});
  const {data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{if(live){setLoggedIn(!!session);setReady(true)}});
  return()=>{live=false;subscription.unsubscribe()};
 },[]);
 async function signOut(){
  setBusy(true);const {error}=await browserClient().auth.signOut();setBusy(false);
  if(error){window.alert('Ошибка выхода: '+error.message);return}
  setLoggedIn(false);router.replace('/login');router.refresh();
 }
 return <header><Link href="/" aria-label="Главная StandEL Time"><img src="/standel-logo.png" alt="StandEL"/></Link><strong>StandEL Time · онлайн</strong><nav><Link href="/">Главная</Link>{ready?(loggedIn?<button type="button" className="header-signout" disabled={busy} onClick={()=>void signOut()}>{busy?'Выход…':'Выход'}</button>:<Link href="/login">Вход</Link>):<span aria-hidden="true">···</span>}</nav></header>;
}
