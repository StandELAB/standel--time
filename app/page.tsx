import Link from 'next/link';
import {redirect} from 'next/navigation';
import {serverClient} from '../lib/supabase/server';
export const dynamic='force-dynamic';
export default async function Home(){
 const db=await serverClient();
 const {data:{user}}=await db.auth.getUser();
 if(user){
  const {data:member,error}=await db.from('org_members').select('role').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle();
  if(!error&&member)redirect(member.role==='admin'?'/admin':'/employee');
  if(!error)redirect('/join');
 }
 return <section className="panel"><h1>StandEL Time</h1><p>Учёт рабочих часов, смен и объектов StandEL AB.</p><div className="navbuttons"><Link href="/login">Войти</Link><Link href="/join">Активировать приглашение</Link></div><p className="muted">Регистрация без приглашения закрыта. Административная панель не доступна через меню сотрудников.</p></section>;
}
