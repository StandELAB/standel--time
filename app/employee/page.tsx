import {requireMember} from '../../lib/access';
import EmployeePanel from './panel';
export const dynamic='force-dynamic';
export default async function Employee(){
 const {db,user,member}=await requireMember('employee');
 const [{data:projects,error:projectsError},{data:assignments,error:assignmentsError},{data:entries},{data:absences},{data:shifts},{data:orders},{data:materials},{data:diaries},{data:photos},{data:atas}]=await Promise.all([
  db.from('projects').select('id,name,color,project_code').eq('org_id',member.org_id).is('archived_at',null),
  db.from('project_assignments').select('project_id').eq('org_id',member.org_id).eq('user_id',user.id),
  db.from('time_entries').select('id,project_id,work_date,start_minute,end_minute,break_minutes,hours,category,description,work_order_id').eq('org_id',member.org_id).eq('user_id',user.id).is('deleted_at',null).order('work_date',{ascending:false}).limit(200),
  db.from('absences').select('id,start_date,end_date,kind,status').eq('org_id',member.org_id).eq('user_id',user.id),
  db.from('shifts').select('id,work_date,project_id,start_minute,end_minute').eq('org_id',member.org_id).eq('user_id',user.id),
 db.from('work_orders').select('id,project_id,order_no,title,description,priority,status,due_on').eq('org_id',member.org_id).order('due_on',{ascending:true}),
 db.from('material_entries').select('id,project_id,work_order_id,work_date,item_name,unit,quantity,notes,user_id').eq('org_id',member.org_id).eq('user_id',user.id).order('work_date',{ascending:false}).limit(200),
 db.from('site_diary').select('id,project_id,work_order_id,work_date,description,safety_notes,user_id').eq('org_id',member.org_id).eq('user_id',user.id).order('work_date',{ascending:false}).limit(200),
 db.from('diary_photos').select('id,diary_id,storage_path').eq('org_id',member.org_id).eq('user_id',user.id).limit(200),
 db.from('ata_requests').select('id,project_id,work_order_id,title,description,proposed_hours,status,requested_by,ata_no').eq('org_id',member.org_id).eq('requested_by',user.id).order('created_at',{ascending:false}).limit(200)
 ]);
 if(projectsError||assignmentsError) return <main><h1>Ошибка загрузки объектов</h1><p>{projectsError?.message||assignmentsError?.message}</p></main>;
 return <EmployeePanel userId={user.id} orgId={member.org_id} displayName={member.display_name} projects={(projects||[]).filter(p=>(assignments||[]).some(a=>a.project_id===p.id))} initialEntries={entries||[]} initialAbsences={absences||[]} shifts={shifts||[]} initialOrders={(orders||[]).filter(o=>(assignments||[]).some(a=>a.project_id===o.project_id))} operations={{materials:materials||[],diaries:diaries||[],photos:photos||[],atas:atas||[]}}/>;
}
