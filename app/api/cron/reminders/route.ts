import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {adminClient} from '../../../../lib/supabase/admin';
import {candidatesForDay,previousStockholmDay,sendReminder} from '../../../../lib/reminders/core';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(req:Request){
 const secret=process.env.REMINDER_CRON_SECRET,got=req.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!secret||!got||Buffer.byteLength(secret)!==Buffer.byteLength(got)||!timingSafeEqual(Buffer.from(secret),Buffer.from(got)))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(process.env.REMINDERS_ENABLED!=='true')return NextResponse.json({enabled:false});
 const orgId=process.env.REMINDER_ORG_ID;
 if(!orgId||!/^[0-9a-f-]{36}$/.test(orgId))return NextResponse.json({error:'REMINDER_ORG_ID not configured'},{status:503});
 const db=adminClient();const {data:orgs,error}=await db.from('organizations').select('id').eq('id',orgId).limit(1);if(error||!orgs?.length)return NextResponse.json({error:'Organization not available'},{status:500});
 const day=previousStockholmDay();let considered=0,accepted=0,failed=0;
 try{for(const org of orgs||[]){const candidates=await candidatesForDay(org.id,day);for(const c of candidates){considered++;for(const channel of c.channels){if(c.sent.includes(channel))continue;const r=await sendReminder(org.id,c.userId,day,channel);if(r.ok)accepted++;else failed++;}}}return NextResponse.json({day,considered,accepted,failed});}
 catch{return NextResponse.json({error:'Processing error',day,considered,accepted,failed},{status:500});}
}
