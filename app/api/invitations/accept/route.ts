import {NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {serverClient} from '../../../../lib/supabase/server';
export async function POST(req:Request){
 try{
  const {token}=await req.json();
  if(typeof token!=='string'||!/^[-\w]{40,100}$/.test(token))return NextResponse.json({error:'Invalid invite token'},{status:400});
  const db=await serverClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:'Please confirm your contact first'},{status:401});
  const hash=createHash('sha256').update(token).digest('hex');
  const {data,error}=await db.rpc('claim_invitation',{p_hash:hash});
  if(error)return NextResponse.json({error:'Invitation invalid, expired or not verified'},{status:403});
  return NextResponse.json({ok:true,role:data});
 }catch{return NextResponse.json({error:'Invalid request'},{status:400})}
}
