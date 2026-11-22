import {requireMember} from '../../lib/access';
import AdminClient from './panel';
export const dynamic='force-dynamic';
export default async function Admin(){
 const {db,member,user}=await requireMember('admin');
 const [staff,sites,entries,absences,shifts,certs,assignments,orders,orderAssignees,materials,diaries,photos,atas,payroll,audit,avatars,features]=await Promise.all([
 db.from('org_members').select('user_id,display_name,role,status,supervisor_id').eq('org_id',member.org_id).order('display_name'),
 db.from('projects').select('id,name,project_code,client_name,site_address,site_city,color,archived_at').eq('org_id',member.org_id).order('name'),
 db.from('time_entries').select('id,user_id,project_id,work_date,start_minute,end_minute,break_minutes,hours,category,description,work_order_id,deleted_at').eq('org_id',member.org_id).is('deleted_at',null).order('work_date',{ascending:false}).limit(500),
 db.from('absences').select('id,user_id,start_date,end_date,kind,status').eq('org_id',member.org_id).order('start_date',{ascending:false}).limit(200),
 db.from('shifts').select('id,user_id,project_id,work_date,start_minute,end_minute').eq('org_id',member.org_id).order('work_date',{ascending:false}).limit(100),
 db.from('certificates').select('id,user_id,kind,expires_on').eq('org_id',member.org_id),
 db.from('project_assignments').select('project_id,user_id').eq('org_id',member.org_id),
 db.from('work_orders').select('id,project_id,order_no,title,description,priority,status,due_on,created_at').eq('org_id',member.org_id).order('created_at',{ascending:false}).limit(500),
 db.from('work_order_assignees').select('work_order_id,user_id').eq('org_id',member.org_id),
 db.from('material_entries').select('id,project_id,work_order_id,work_date,item_name,unit,quantity,notes,user_id').eq('org_id',member.org_id).order('work_date',{ascending:false}).limit(500),
 db.from('site_diary').select('id,project_id,work_order_id,work_date,description,safety_notes,user_id').eq('org_id',member.org_id).order('work_date',{ascending:false}).limit(300),
 db.from('diary_photos').select('id,diary_id,storage_path').eq('org_id',member.org_id).limit(300),
 db.from('ata_requests').select('id,project_id,work_order_id,title,description,proposed_hours,status,requested_by,ata_no').eq('org_id',member.org_id).order('created_at',{ascending:false}).limit(300),
 db.from('payroll_months').select('org_id,user_id,month_start,status,approved_at').eq('org_id',member.org_id),
 db.from('audit_events').select('id,actor_id,entity,action,created_at,before_data,after_data').eq('org_id',member.org_id).in('entity',['time_entry','payroll_month']).order('created_at',{ascending:false}).limit(300),
 db.from('profile_avatars').select('user_id,storage_path'),
 db.from('employee_feature_access').select('org_id,user_id,feature,enabled').eq('org_id',member.org_id)
 ]);
 return <AdminClient orgId={member.org_id} adminUserId={user.id} operations={{materials:materials.data||[],diaries:diaries.data||[],photos:photos.data||[],atas:atas.data||[]}} initial={{staff:staff.data||[],sites:sites.data||[],entries:entries.data||[],absences:absences.data||[],shifts:shifts.data||[],certs:certs.data||[],assignments:assignments.data||[],orders:orders.data||[],orderAssignees:orderAssignees.data||[],payroll:payroll.data||[],audit:audit.data||[],avatars:avatars.data||[],features:features.data||[]}}/>;
}
