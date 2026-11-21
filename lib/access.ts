import { redirect } from 'next/navigation';
import { serverClient } from './supabase/server';
export async function requireMember(required?:'admin'|'employee'){
 const db=await serverClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user) redirect('/login');
 const {data:member}=await db.from('org_members').select('org_id,role,display_name').eq('user_id',user.id).eq('status','active').limit(1).maybeSingle();
 if(!member) redirect('/join');
 if(required==='admin'&&member.role!=='admin') redirect('/employee');
 if(required==='employee'&&member.role==='admin') redirect('/admin');
 return {db,user,member};
}
