import {createHash,timingSafeEqual} from 'node:crypto';
import {adminClient} from '../../../../lib/supabase/admin';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const digest=(s:string)=>createHash('sha256').update(s).digest();
function reply(body:unknown,status=200){return Response.json(body,{status,headers});}
export async function GET(req:Request){
 const key=process.env.STANDEL_CONNECT_KEY,org=process.env.STANDEL_CONNECT_ORG_ID;
 if(!key||key.length<32||!org||!/^[0-9a-f-]{36}$/i.test(org))return reply({error:'Integration not configured'},503);
 let supplied='';const auth=req.headers.get('authorization')||'';
 if(auth.startsWith('Bearer '))supplied=auth.slice(7);
 if(auth.startsWith('Basic ')){const decoded=Buffer.from(auth.slice(6),'base64').toString('utf8');if(decoded.startsWith('standel:'))supplied=decoded.slice(8);}
 if(!timingSafeEqual(digest(key),digest(supplied)))return Response.json({error:'Unauthorized'},{status:401,headers:{...headers,'WWW-Authenticate':'Basic realm="StandEL Connect"'}});
 const p=new URL(req.url).searchParams,year=p.get('year')||'';
 if(!/^20\d{2}$/.test(year))return reply({error:'Specify year=YYYY'},400);
 try{
 const db=adminClient(),from=year+'-01-01',until=(Number(year)+1)+'-01-01';
 // Paginate all datasets and never return a partial successful result.
 async function collect<T>(dataset:string,fetchPage:(offset:number)=>PromiseLike<{data:T[]|null,error:unknown}>):Promise<T[]>{const rows:T[]=[];for(let offset=0;offset<250000;offset+=500){const {data,error}=await fetchPage(offset);if(error||!data){const code=(error as {code?:unknown}|null)?.code;const safeCode=typeof code==='string'&&/^[A-Z0-9]{5,12}$/.test(code)?code:'UNKNOWN';throw new Error('CONNECT_READ:'+dataset+':'+safeCode);}rows.push(...data);if(data.length<500)return rows;}throw new Error('Export limit exceeded');}
 const [entries,staff,projects,payroll]=await Promise.all([
 collect('time_entries',o=>db.from('time_entries').select('id,user_id,project_id,work_date,hours,category,updated_at').eq('org_id',org).is('deleted_at',null).gte('work_date',from).lt('work_date',until).order('id').range(o,o+499)),
 collect('org_members',o=>db.from('org_members').select('user_id,display_name,status').eq('org_id',org).order('user_id').range(o,o+499)),
 collect('projects',o=>db.from('projects').select('id,name,project_code').eq('org_id',org).order('id').range(o,o+499)),
 collect('payroll_months',o=>db.from('payroll_months').select('user_id,month_start,status').eq('org_id',org).gte('month_start',from).lt('month_start',until).order('user_id').order('month_start').range(o,o+499))]);
 const names=new Map(staff.map(x=>[x.user_id,x])),sites=new Map(projects.map(x=>[x.id,x])),locks=new Map(payroll.map(x=>[x.user_id+'|'+x.month_start,x.status]));
 const rows=entries.map(e=>({entry_id:e.id,employee_id:e.user_id,employee_name:names.get(e.user_id)?.display_name??'',project_id:e.project_id,project_name:sites.get(e.project_id)?.name??'',project_code:sites.get(e.project_id)?.project_code??'',work_date:e.work_date,hours:Number(e.hours),category:e.category,payroll_status:locks.get(e.user_id+'|'+e.work_date.slice(0,7)+'-01')??'open',updated_at:e.updated_at}));
 return reply({api_version:1,year:Number(year),exported_at:new Date().toISOString(),rows});
 }catch(err){const message=err instanceof Error?err.message:'';const diagnostic=/^CONNECT_READ:(time_entries|org_members|projects|payroll_months):[A-Z0-9]{5,12}$/.test(message)?message:'CONNECT_INTERNAL';console.error('[StandEL Connect]',diagnostic);return reply({error:'Export failed; retry without replacing existing data',diagnostic},503);}
}
