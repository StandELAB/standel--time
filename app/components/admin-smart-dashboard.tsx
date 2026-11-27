'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {browserClient} from '../../lib/supabase/browser';
import {isoWeekNumber} from './sweden-calendar';

type Staff={user_id:string;display_name:string;role:string;status:string};
type Project={id:string;name:string;project_code:string|null;archived_at:string|null};
type Cert={id:string;user_id:string;kind:string;expires_on:string};
type Entry={id:string;user_id:string;project_id:string;work_date:string;hours:number;category:string};
type Absence={id:string;user_id:string;start_date:string;end_date:string;kind:string;status:string};
type Shift={id:string;user_id:string;project_id:string;work_date:string};
type Props={orgId:string;staff:Staff[];sites:Project[];certs:Cert[];openTab:(tab:'workers'|'projects'|'hours'|'absences'|'documents'|'attention'|'planning')=>void};
const localDate=()=>new Date().toLocaleDateString('en-CA');
const mondayOf=(s:string)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)};
const sundayOf=(s:string)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+6);return d.toISOString().slice(0,10)};
const dayMillis=(s:string)=>Date.parse(s+'T12:00:00Z');
const absenceLabel=(a:Absence)=>({sick:'Больничный',vacation:'Отпуск',personal:'Личные обстоятельства',no_show:'Неявка'} as Record<string,string>)[a.kind]||a.kind;

export default function AdminSmartDashboard({orgId,staff,sites,certs,openTab}:Props){
 const [today,setToday]=useState(localDate);
 const [entries,setEntries]=useState<Entry[]>([]);
 const [absences,setAbsences]=useState<Absence[]>([]);
 const [shifts,setShifts]=useState<Shift[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [incomplete,setIncomplete]=useState(false);
 const weekStart=mondayOf(today);
 const weekEnd=sundayOf(weekStart);
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');setIncomplete(false);
  const db=browserClient();
  // Fetch only the currently selected Swedish ISO week, not a truncated recent-record feed.
  const readEntries=async()=>{
   const result:Entry[]=[];
   for(let start=0;start<10000;start+=1000){
    const {data,error:queryError}=await db.from('time_entries').select('id,user_id,project_id,work_date,hours,category').eq('org_id',orgId).is('deleted_at',null).gte('work_date',weekStart).lte('work_date',weekEnd).order('work_date',{ascending:true}).order('id',{ascending:true}).range(start,start+999);
    if(queryError)throw queryError;
    result.push(...((data||[]) as Entry[]));
    if((data||[]).length<1000)return {rows:result,truncated:false};
   }
   return {rows:result,truncated:true};
  };
  try{
   const [entryResult,absenceResult,shiftResult]=await Promise.all([
    readEntries(),
    db.from('absences').select('id,user_id,start_date,end_date,kind,status').eq('org_id',orgId).lte('start_date',weekEnd).gte('end_date',weekStart).limit(10000),
    db.from('shifts').select('id,user_id,project_id,work_date').eq('org_id',orgId).gte('work_date',weekStart).lte('work_date',weekEnd).limit(10000),
   ]);
   if(absenceResult.error)throw absenceResult.error;
   if(shiftResult.error)throw shiftResult.error;
   setEntries(entryResult.rows);
   setAbsences((absenceResult.data||[]) as Absence[]);
   setShifts((shiftResult.data||[]) as Shift[]);
   setIncomplete(entryResult.truncated||(absenceResult.data||[]).length===10000||(shiftResult.data||[]).length===10000);
  }catch(e){setError(e instanceof Error?e.message:'Не удалось получить данные из Supabase');setEntries([]);setAbsences([]);setShifts([])}finally{setLoading(false)}
 },[orgId,weekStart,weekEnd]);
 useEffect(()=>{void refresh()},[refresh]);
 const activeStaff=useMemo(()=>staff.filter(s=>s.status==='active'&&s.role!=='admin'),[staff]);
 const activeIds=useMemo(()=>new Set(activeStaff.map(s=>s.user_id)),[activeStaff]);
 const activeProjects=sites.filter(s=>!s.archived_at);
 const todayRows=entries.filter(e=>e.work_date===today&&activeIds.has(e.user_id));
 const hoursToday=todayRows.reduce((n,e)=>n+Number(e.hours),0);
 const hoursWeek=entries.filter(e=>activeIds.has(e.user_id)).reduce((n,e)=>n+Number(e.hours),0);
 const reportedPeople=new Set(todayRows.map(e=>e.user_id));
 const absencesToday=absences.filter(a=>activeIds.has(a.user_id)&&a.start_date<=today&&a.end_date>=today&&a.status!=='rejected');
 const absentPeople=new Set(absencesToday.map(a=>a.user_id));
 const expireCount=certs.filter(c=>activeIds.has(c.user_id)&&c.expires_on&&dayMillis(c.expires_on)-dayMillis(today)<=30*86400000).length;
 const scheduledMissing=shifts.filter(s=>activeIds.has(s.user_id)&&s.work_date<=today&&!entries.some(e=>e.user_id===s.user_id&&e.work_date===s.work_date)&&!absences.some(a=>a.user_id===s.user_id&&a.start_date<=s.work_date&&a.end_date>=s.work_date&&a.status!=='rejected'));
 const uniqueMissing=new Set(scheduledMissing.map(s=>s.user_id+'|'+s.work_date));
 const projectSummary=activeProjects.map(p=>{
  const rows=todayRows.filter(e=>e.project_id===p.id);
  return {...p,people:new Set(rows.map(e=>e.user_id)).size,hours:rows.reduce((n,e)=>n+Number(e.hours),0)};
 }).filter(p=>p.people>0).sort((a,b)=>b.hours-a.hours);
 const displayName=(id:string)=>staff.find(s=>s.user_id===id)?.display_name||'Сотрудник';
 const isoYear=()=>{const d=new Date(weekStart+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+3);return d.getUTCFullYear()};
 return <div className="smart-dashboard">
  <div className="smart-dashboard-heading"><div><h2>Обзор компании</h2><p className="muted">Статистика по внесённым данным — не геолокация и не учёт присутствия в реальном времени</p></div><div className="smart-dashboard-actions"><label htmlFor="dashboard-date">Дата</label><input id="dashboard-date" type="date" value={today} onChange={e=>setToday(e.target.value)}/><button type="button" className="secondary" onClick={()=>void refresh()} disabled={loading}>↻ Обновить</button></div></div>
  {error&&<div className="panel error" role="alert">Не удалось обновить сводку: {error}. Показатели из базы не отображаются.</div>}
  {incomplete&&<p className="panel error">За выбранную неделю найдено слишком много записей. Итоги могут быть неполными; проверь полный отчёт во вкладке «Часы работников».</p>}
  <div className="smart-dashboard-grid">
   <button className="smart-kpi" type="button" onClick={()=>openTab('workers')}><span className="smart-kpi-icon">👥</span><strong>{activeStaff.length}</strong><span>Действующих сотрудников</span></button>
   <button className="smart-kpi" type="button" onClick={()=>openTab('projects')}><span className="smart-kpi-icon">🏗️</span><strong>{activeProjects.length}</strong><span>Активных объектов</span></button>
   <button className="smart-kpi" type="button" onClick={()=>openTab('hours')}><span className="smart-kpi-icon">⏱️</span><strong>{loading?'…':error?'—':hoursToday.toFixed(1)+' ч'}</strong><span>Записано за {today}</span></button>
   <button className="smart-kpi" type="button" onClick={()=>openTab('hours')}><span className="smart-kpi-icon">📅</span><strong>{loading?'…':error?'—':hoursWeek.toFixed(1)+' ч'}</strong><span>Неделя v.{isoWeekNumber(new Date(weekStart+'T12:00:00Z'))} / {isoYear()}</span></button>
  </div>
  <div className="smart-dashboard-panels">
   <section className="panel smart-dashboard-section"><div className="smart-section-title"><h3>Регистрация часов за выбранную дату</h3><button type="button" className="secondary" onClick={()=>openTab('hours')}>Все часы ›</button></div><div className="smart-statuses"><div><strong>{loading||error?'—':reportedPeople.size}</strong><span>Внесли часы</span></div><div><strong>{loading||error?'—':absentPeople.size}</strong><span>Отмечены отсутствующими</span></div><div><strong>{loading||error?'—':uniqueMissing.size}</strong><span>Смены без часов*</span></div></div><p className="muted smart-footnote">* Только по запланированным сменам до выбранной даты включительно. Требует ручного уточнения.</p><div className="smart-section-title"><h3>Отмеченные отсутствия</h3><button type="button" className="secondary" onClick={()=>openTab('absences')}>Открыть ›</button></div>{!loading&&!error&&(absencesToday.length?<ul className="smart-simple-list">{absencesToday.slice(0,8).map(a=><li key={a.id}><span>{displayName(a.user_id)}</span><span>{absenceLabel(a)}</span></li>)}</ul>:<p className="muted">На выбранную дату отметок об отсутствии нет.</p>)}</section>
   <section className="panel smart-dashboard-section"><div className="smart-section-title"><h3>Объекты с часами за дату</h3><button type="button" className="secondary" onClick={()=>openTab('projects')}>Все объекты ›</button></div>{!loading&&!error&&(projectSummary.length?<ul className="smart-simple-list">{projectSummary.slice(0,8).map(p=><li key={p.id}><span><b>{p.name}</b><small>{p.project_code||'Без номера'} · {p.people} чел.</small></span><strong>{p.hours.toFixed(1)} ч</strong></li>)}</ul>:<p className="muted">Пока нет зарегистрированных часов на активных объектах за выбранную дату.</p>)}<p className="muted smart-footnote">Состав определяется по часам, зарегистрированным за день, а не по фактическому присутствию.</p><div className="smart-section-title smart-certs-row"><h3>Сертификаты: истекают или просрочены</h3><button type="button" className="secondary" onClick={()=>openTab('documents')}>Проверить ›</button></div><p><strong>{expireCount}</strong> удостоверений со сроком окончания в ближайшие 30 дней или ранее.</p></section>
  </div>
  <div className="smart-quick-actions"><button type="button" className="secondary" onClick={()=>openTab('attention')}>Контроль табелей</button><button type="button" className="secondary" onClick={()=>openTab('planning')}>Графики смен</button><button type="button" className="secondary" onClick={()=>openTab('documents')}>Сертификаты</button></div>
 </div>;
}
