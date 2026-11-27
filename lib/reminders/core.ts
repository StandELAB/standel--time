import {adminClient} from '../supabase/admin';

export type Channel='email'|'sms';
export type ReminderCandidate={orgId:string;userId:string;day:string;name:string;channels:Channel[];sent:Channel[]};
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern=/^\+[1-9]\d{7,14}$/;
const fetchOpts={cache:'no-store' as const};
function stockholmDay(d:Date){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
export function previousStockholmDay(){const day=stockholmDay(new Date());const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
function dayIsPast(day:string){return /^\d{4}-\d{2}-\d{2}$/.test(day)&&day<stockholmDay(new Date());}
async function page<T>(table:string,select:string,orgId:string,day:string):Promise<T[]>{
 const db=adminClient(); const out:T[]=[];
 for(let offset=0;offset<10000;offset+=1000){const {data,error}=await db.from(table).select(select).eq('org_id',orgId).eq('work_date',day).range(offset,offset+999);if(error)throw Error('Database lookup failed: '+table);out.push(...(data as T[]||[]));if(!data||data.length<1000)break;}return out;
}
export async function candidatesForDay(orgId:string,day:string):Promise<ReminderCandidate[]>{
 if(!dayIsPast(day))throw Error('Reminders are only allowed for completed days');
 const db=adminClient();
 const shifts=await page<{user_id:string}>('shifts','user_id',orgId,day);
 const {data:actual,error:ae}=await db.from('time_entries').select('user_id').eq('org_id',orgId).eq('work_date',day).is('deleted_at',null);if(ae)throw Error('Hours lookup failed');
 const {data:absences,error:ab}=await db.from('absences').select('user_id').eq('org_id',orgId).lte('start_date',day).gte('end_date',day).in('status',['approved','reported']);if(ab)throw Error('Absence lookup failed');
 const {data:members,error:me}=await db.from('org_members').select('user_id,display_name').eq('org_id',orgId).eq('status','active').in('role',['employee','foreman']);if(me)throw Error('Employees lookup failed');
 const {data:details,error:de}=await db.from('employee_personal_details').select('user_id,contact_email,phone').eq('org_id',orgId);if(de)throw Error('Contacts lookup failed');
 const {data:delivery,error:le}=await db.from('reminder_deliveries').select('user_id,channel,status').eq('org_id',orgId).eq('work_date',day);if(le)throw Error('Delivery ledger lookup failed');
 const eligible=new Set(shifts.map(s=>s.user_id));const registered=new Set((actual||[]).map(x=>x.user_id));const away=new Set((absences||[]).map(x=>x.user_id));
 const contacts=new Map((details||[]).map(x=>[x.user_id,x]));
 return (members||[]).filter(x=>eligible.has(x.user_id)&&!registered.has(x.user_id)&&!away.has(x.user_id)).map(x=>{
 const c=contacts.get(x.user_id);const sent=(delivery||[]).filter(l=>l.user_id===x.user_id&&l.status!=='failed').map(l=>l.channel as Channel);
 return {orgId,userId:x.user_id,day,name:x.display_name,channels:[...(c?.contact_email&&emailPattern.test(c.contact_email.trim())?['email' as Channel]:[]),...(c?.phone&&phonePattern.test(c.phone.trim())?['sms' as Channel]:[])],sent};
 });
}
async function sendMail(to:string,name:string,day:string){
 const key=process.env.RESEND_API_KEY,from=process.env.INVITE_FROM_EMAIL;if(!key||!from)throw Error('email_not_configured');
 const text=`Здравствуйте, ${name}! В StandEL Time пока не зарегистрированы часы за ${day}, хотя в графике была смена. Пожалуйста, проверьте табель и внесите часы, если вы работали. Если смена была отменена или вы отсутствовали, сообщите ответственному. ${process.env.APP_URL||'https://time.standel.se'}`;
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject:`StandEL Time — проверьте часы за ${day}`,text}),...fetchOpts});if(!r.ok)throw Error('email_provider_rejected');const data=await r.json().catch(()=>({}));return String(data.id||'');
}
async function sendSms(to:string,day:string){
 const sid=process.env.TWILIO_ACCOUNT_SID,auth=process.env.TWILIO_AUTH_TOKEN,from=process.env.TWILIO_FROM_NUMBER;if(!sid||!auth||!from)throw Error('sms_not_configured');
 const data=new URLSearchParams({To:to,From:from,Body:`StandEL Time: kontrollera dina arbetstimmar för ${day}. Registrering saknas för planerat pass. Logga in: ${process.env.APP_URL||'https://time.standel.se'}`});
 const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:data.toString(),...fetchOpts});if(!r.ok)throw Error('sms_provider_rejected');const result=await r.json().catch(()=>({}));return String(result.sid||'');
}
export async function sendReminder(orgId:string,userId:string,day:string,channel:Channel){
 if(channel!=='email'&&channel!=='sms')throw Error('Invalid channel');
 const candidate=(await candidatesForDay(orgId,day)).find(c=>c.userId===userId);
 if(!candidate)throw Error('No missed scheduled shift');
 if(!candidate.channels.includes(channel))throw Error('No valid contact for channel');
 const db=adminClient();
 const {error:claim}=await db.from('reminder_deliveries').insert({org_id:orgId,user_id:userId,work_date:day,channel,status:'sending'});
 if(claim){if(claim.code==='23505')return {ok:false,reason:'already_attempted'};throw Error('Failed to record delivery');}
 try{
  const {data:contact,error:ce}=await db.from('employee_personal_details').select('phone,contact_email').eq('org_id',orgId).eq('user_id',userId).single();if(ce||!contact)throw Error('Contact missing');
  const id=channel==='email'?await sendMail(contact.contact_email.trim(),candidate.name,day):await sendSms(contact.phone.trim(),day);
  await db.from('reminder_deliveries').update({status:'sent',provider_message_id:id,updated_at:new Date().toISOString()}).eq('org_id',orgId).eq('user_id',userId).eq('work_date',day).eq('channel',channel);
  return {ok:true};
 }catch(err){const code=err instanceof Error?err.message:'delivery_failed';await db.from('reminder_deliveries').update({status:'failed',error_code:code.slice(0,80),updated_at:new Date().toISOString()}).eq('org_id',orgId).eq('user_id',userId).eq('work_date',day).eq('channel',channel);return {ok:false,reason:code};}
}
