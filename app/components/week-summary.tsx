"use client";
import {exportXlsx} from '../../lib/export-xlsx';
import {isoWeekNumber} from './sweden-calendar';

type WorkRow={id:string;project_id:string;work_date:string;hours:number;category:string};
type Project={id:string;name:string;project_code:string|null};
function isoWeekYear(d:Date):number{
  const thursday=new Date(d.getTime());
  thursday.setUTCDate(thursday.getUTCDate()+3-((thursday.getUTCDay()+6)%7));
  return thursday.getUTCFullYear();
}
function weekKey(date:string){
  const d=new Date(date+'T00:00:00Z');
  return {year:isoWeekYear(d),week:isoWeekNumber(d)};
}
export default function WeekSummary({month,entries,projects}:{month:string;entries:WorkRow[];projects:Project[]}){
  const monthRows=entries.filter(e=>e.work_date.startsWith(month));
  const weeks=new Map<string,{year:number;week:number;hours:number;days:Set<string>;overtime:number}>();
  const sites=new Map<string,{name:string;code:string;hours:number;days:Set<string>}>();
  for(const e of monthRows){
    const h=Number(e.hours);
    if(!Number.isFinite(h))continue;
    const {year,week}=weekKey(e.work_date),key=`${year}-${week}`;
    const w=weeks.get(key)||{year,week,hours:0,days:new Set<string>(),overtime:0};
    w.hours+=h;w.days.add(e.work_date);if(e.category==='overtime')w.overtime+=h;
    weeks.set(key,w);
    const p=projects.find(p=>p.id===e.project_id);
    const s=sites.get(e.project_id)||{name:p?.name||'Неизвестный объект',code:p?.project_code||'',hours:0,days:new Set<string>()};
    s.hours+=h;s.days.add(e.work_date);sites.set(e.project_id,s);
  }
  const weekRows=[...weeks.values()].sort((a,b)=>a.year-b.year||a.week-b.week);
  const siteRows=[...sites.values()].sort((a,b)=>b.hours-a.hours||a.name.localeCompare(b.name));
  function downloadWeekly(){
    exportXlsx(`StandEL_veckor_${month}`,["ISO-год","Vecka","Дней с часами","Всего часов","Övertid (зарегистрировано)"],weekRows.map(w=>[w.year,w.week,w.days.size,Number(w.hours.toFixed(2)),Number(w.overtime.toFixed(2))]));
  }
  function downloadSites(){
    exportXlsx(`StandEL_objekt_${month}`,["Объект","Код","Дней с часами","Всего часов"],siteRows.map(s=>[s.name,s.code,s.days.size,Number(s.hours.toFixed(2))]));
  }
  return <section className="standel-week-summary" aria-label="Сводка по неделям и объектам">
    <h3>Сводка по шведским неделям (vecka)</h3>
    <p className="muted">Показаны только даты выбранного месяца. Если неделя пересекает границу месяца, часы соседнего месяца здесь не учитываются. Часы Övertid — по категории записи, без расчёта доплат.</p>
    <div className="table-scroll"><table><thead><tr><th>Неделя</th><th>Дней с часами</th><th>Часов</th><th>Övertid</th></tr></thead><tbody>
      {weekRows.map(w=><tr key={`${w.year}-${w.week}`}><td>v.{w.week} / {w.year}</td><td>{w.days.size}</td><td>{w.hours.toFixed(2)}</td><td>{w.overtime.toFixed(2)}</td></tr>)}
      {weekRows.length===0&&<tr><td colSpan={4}>В этом месяце пока нет записанных часов.</td></tr>}
    </tbody></table></div>
    <button type="button" className="secondary" onClick={downloadWeekly} disabled={!weekRows.length}>Скачать недели Excel (.xlsx)</button>
    <h3 style={{marginTop:20}}>Часы по объектам</h3>
    <div className="table-scroll"><table><thead><tr><th>Объект</th><th>Код</th><th>Дней</th><th>Часов</th></tr></thead><tbody>
      {siteRows.map(s=><tr key={`${s.name}-${s.code}`}><td>{s.name}</td><td>{s.code||'—'}</td><td>{s.days.size}</td><td>{s.hours.toFixed(2)}</td></tr>)}
      {siteRows.length===0&&<tr><td colSpan={4}>Нет записей по объектам.</td></tr>}
    </tbody></table></div>
    <button type="button" className="secondary" onClick={downloadSites} disabled={!siteRows.length}>Скачать объекты Excel (.xlsx)</button>
    <p className="muted" style={{marginTop:12}}>Сводки рассчитываются по записям, загруженным в личный кабинет. При больших объёмах данных требуется сверка с базой.</p>
  </section>;
}
