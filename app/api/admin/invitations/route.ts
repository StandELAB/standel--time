import {NextResponse} from 'next/server';
import {randomBytes,createHash} from 'node:crypto';
import {serverClient} from '../../../../lib/supabase/server';
import {adminClient} from '../../../../lib/supabase/admin';

async function sendEmail(email:string,link:string){
 const key=process.env.RESEND_API_KEY,from=process.env.INVITE_FROM_EMAIL;
 if(!key||!from)throw new Error('Email delivery is not configured');
 const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[email],subject:'StandEL Time — приглашение',text:`Вас пригласили в StandEL Time. Подтвердите свой email и активируйте аккаунт: ${link}\nСсылка действует 48 часов.`})});
 if(!res.ok)throw new Error('Email provider rejected invitation');
}
async function sendSms(phone:string,link:string){
 const sid=process.env.TWILIO_ACCOUNT_SID,key=process.env.TWILIO_AUTH_TOKEN,from=process.env.TWILIO_FROM_NUMBER;
 if(!sid||!key||!from)throw new Error('SMS delivery is not configured');
 const params=new URLSearchParams({To:phone,From:from,Body:`StandEL Time: aktivera ditt konto ${link} (48 h)`});
 const res=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${sid}:${key}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()});
 if(!res.ok)throw new Error('SMS provider rejected invitation');
}
export async function POST(request:Request){
 try{
 const db=await serverClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {data:member}=await db.from('org_members').select('org_id,role').eq('user_id',user.id).eq('status','active').eq('role','admin').limit(1).maybeSingle();
 if(!member)return NextResponse.json({error:'Forbidden'},{status:403});
 const body=await request.json();const channel=body.channel,employeeName=String(body.employeeName||'').trim(),recipient=String(body.recipient||'').trim();
 const role=body.role==='foreman'?'foreman':'employee';
 if(!['email','sms'].includes(channel)||employeeName.length<2||employeeName.length>120)return NextResponse.json({error:'Invalid input'},{status:400});
 const normalized=channel==='email'?recipient.toLowerCase():recipient;
 if(channel==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||channel==='sms'&&!/^\+[1-9]\d{7,14}$/.test(normalized))return NextResponse.json({error:'Enter valid email or E.164 number (+46...)'},{status:400});
 const admin=adminClient();
 // Existing users should be invited using a dedicated re-invitation flow (not part of this starter).
 const {data:created,error:createError}=await admin.auth.admin.createUser(channel==='email'?{email:normalized,user_metadata:{display_name:employeeName}}:{phone:normalized,user_metadata:{display_name:employeeName}});
 if(createError||!created.user)return NextResponse.json({error:'Cannot create account. Contact may already be registered.'},{status:409});
 const token=randomBytes(32).toString('base64url');const hash=createHash('sha256').update(token).digest('hex');
 const {data:invite,error:insertError}=await admin.from('invitations').insert({org_id:member.org_id,auth_user_id:created.user.id,role,employee_name:employeeName,channel,recipient:normalized,token_hash:hash,created_by:user.id,expires_at:new Date(Date.now()+48*3600000).toISOString()}).select('id').single();
 if(insertError||!invite){await admin.auth.admin.deleteUser(created.user.id);return NextResponse.json({error:'Cannot store invitation'},{status:500})}
 const origin=process.env.APP_URL;
 if(!origin||!origin.startsWith('https://'))return NextResponse.json({error:'APP_URL must be configured as HTTPS'},{status:500});
 const link=`${origin}/join?token=${encodeURIComponent(token)}`;
 try{if(channel==='email')await sendEmail(normalized,link);else await sendSms(normalized,link)}catch{
  await admin.from('invitations').update({revoked_at:new Date().toISOString()}).eq('id',invite.id);
  return NextResponse.json({error:'Delivery failed; invitation revoked. Check provider configuration.'},{status:502});
 }
 return NextResponse.json({ok:true,invitationId:invite.id,channel,recipient:normalized,expiresInHours:48});
 }catch{return NextResponse.json({error:'Unexpected error'},{status:500})}
}
