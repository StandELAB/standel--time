import {requireMember} from '../../lib/access';
import EmployeePanel from './panel';
export const dynamic='force-dynamic';
export default async function Employee(){
 const {db,user,member}=await requireMember('employee');
 const [{data:projects,error:projectsError},{data:entries},{data:absences},{data:shifts},{data:orders},{data:materials},{data:diaries},{data:photos},{data:atas},{data:payroll},{data:avatar},{data:features},{data:team},{data:teamAvatars},{data:teamFeatures}]=await Promise.all([
  db.from('projects').select('id,name,color,project_code').eq('org_id',member.org_id).is('archived_at',null),
  db.from('time_entries').select('id,project_id,work_date,start_minute,end_minute,break_minutes,hours,category,description,work_order_id').eq('org_id',member.org_id).eq('user_id',user.id).is('deleted_at',null).order('work_date',{ascending:false}).limit(200),
  db.from('absences').select('id,start_date,end_date,kind,status').eq('org_id',member.org_id).eq('user_id',user.id),
  db.from('shifts').select('id,work_date,project_id,start_minute,end_minute').eq('org_id',member.org_id).eq('user_id',user.id),
 db.from('work_orders').select('id,project_id,order_no,title,description,priority,status,due_on').eq('org_id',member.org_id).order('due_on',{ascending:true}),
 db.from('material_entries').select('id,project_id,work_order_id,work_date,item_name,unit,quantity,notes,user_id').eq('org_id',member.org_id).eq('user_id',user.id).order('work_date',{ascending:false}).limit(200),
 db.from('site_diary').select('id,project_id,work_order_id,work_date,description,safety_notes,user_id').eq('org_id',member.org_id).eq('user_id',user.id).order('work_date',{ascending:false}).limit(200),
 db.from('diary_photos').select('id,diary_id,storage_path').eq('org_id',member.org_id).eq('user_id',user.id).limit(200),
 db.from('ata_requests').select('id,project_id,work_order_id,title,description,proposed_hours,status,requested_by,ata_no').eq('org_id',member.org_id).eq('requested_by',user.id).order('created_at',{ascending:false}).limit(200),
 db.from('payroll_months').select('month_start,status').eq('org_id',member.org_id).eq('user_id',user.id),
 db.from('profile_avatars').select('user_id,storage_path').eq('user_id',user.id).maybeSingle(),
 db.from('employee_feature_access').select('feature,enabled').eq('org_id',member.org_id).eq('user_id',user.id),
 member.role==='foreman'?db.from('org_members').select('user_id,display_name').eq('org_id',member.org_id).eq('supervisor_id',user.id).eq('status','active'):Promise.resolve({data:[]}),
 member.role==='foreman'?db.from('profile_avatars').select('user_id,storage_path'):Promise.resolve({data:[]}),
 member.role==='foreman'?db.from('employee_feature_access').select('user_id,feature,enabled').eq('org_id',member.org_id):Promise.resolve({data:[]})
 ]);
 if(projectsError) return <main><h1>Ошибка загрузки объектов</h1><p>{projectsError?.message}</p></main>;
 return <EmployeePanel userId={user.id} orgId={member.org_id} displayName={member.display_name} role={member.role} avatarPath={avatar?.storage_path||null} features={features||[]} team={team||[]} teamAvatars={teamAvatars||[]} teamFeatures={teamFeatures||[]} projects={projects||[]} initialEntries={entries||[]} initialAbsences={absences||[]} shifts={shifts||[]} initialOrders={orders||[]} operations={{materials:materials||[],diaries:diaries||[],photos:photos||[],atas:atas||[]}} initialPayroll={payroll||[]}/>;
}
