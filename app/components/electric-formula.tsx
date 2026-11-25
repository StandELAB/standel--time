'use client';
import {useEffect,useState} from 'react';

type Formula={title:string,formula:string,explanation:string,variables:string[],example:string,note?:string};
const formulas:Formula[]=[
 {title:'Мощность однофазной нагрузки',formula:'P = U × I × cos φ',explanation:'Активная мощность однофазной цепи переменного тока.',variables:['P — мощность (Вт)','U — напряжение (В)','I — ток (А)','cos φ — коэффициент мощности'],example:'230 В × 10 А × 1 = 2300 Вт = 2,3 кВт',note:'При cos φ = 1 (например, активная нагрузка).'},
 {title:'Закон Ома',formula:'I = U / R',explanation:'Ток через резистивную нагрузку.',variables:['I — ток (А)','U — напряжение (В)','R — сопротивление (Ом)'],example:'230 В / 46 Ом = 5 А'},
 {title:'Трёхфазная мощность',formula:'P = √3 × U × I × cos φ',explanation:'Активная мощность симметричной трёхфазной нагрузки.',variables:['P — суммарная мощность (Вт)','U — линейное напряжение (В)','I — линейный ток (А)','cos φ — коэффициент мощности'],example:'√3 × 400 В × 16 А × 1 ≈ 11,1 кВт',note:'Для симметричной трёхфазной нагрузки.'},
 {title:'Энергопотребление',formula:'E = P × t',explanation:'Расход электроэнергии при постоянной мощности.',variables:['E — энергия (кВт·ч)','P — мощность (кВт)','t — время (ч)'],example:'2 кВт × 3 ч = 6 кВт·ч'},
 {title:'Сопротивление проводника',formula:'R = ρ × L / S',explanation:'Приближённое сопротивление однородного проводника.',variables:['R — сопротивление (Ом)','ρ — удельное сопротивление (Ом·мм²/м)','L — длина проводника (м)','S — сечение (мм²)'],example:'0,0175 × 20 м / 2,5 мм² ≈ 0,14 Ом',note:'Для меди при температуре около 20 °C.'},
 {title:'Последовательные резисторы',formula:'R = R₁ + R₂',explanation:'Общее сопротивление последовательно соединённых резисторов.',variables:['R — суммарное сопротивление (Ом)','R₁, R₂ — отдельные сопротивления (Ом)'],example:'10 Ом + 15 Ом = 25 Ом'},
 {title:'Параллельные резисторы',formula:'1 / R = 1 / R₁ + 1 / R₂',explanation:'Общее сопротивление двух параллельных резисторов.',variables:['R — суммарное сопротивление (Ом)','R₁, R₂ — отдельные сопротивления (Ом)'],example:'10 Ом || 10 Ом = 5 Ом'},
 {title:'Активная мощность постоянного тока',formula:'P = U × I',explanation:'Мощность цепи постоянного тока.',variables:['P — мощность (Вт)','U — напряжение (В)','I — ток (А)'],example:'24 В × 5 А = 120 Вт'},
];
export default function ElectricFormula(){
 const [index,setIndex]=useState(0);
 useEffect(()=>{setIndex(Math.floor(Math.random()*formulas.length));},[]);
 const formula=formulas[index];
 const next=()=>setIndex(i=>(i+1+Math.floor(Math.random()*(formulas.length-1)))%formulas.length);
 return <section className="electric-formula" aria-label="Электрическая формула">
  <div className="electric-formula-head"><div className="electric-formula-title"><span aria-hidden="true">💡</span><h2>Формула дня для электрика</h2></div><button className="electric-formula-refresh" type="button" onClick={next} aria-label="Показать другую формулу" title="Другая формула">↻ <span>Другая</span></button></div>
  <div className="electric-formula-body"><div className="electric-formula-main"><div className="electric-formula-equation" aria-label={formula.title}>{formula.formula}</div><strong>{formula.title}</strong><p>{formula.explanation}</p><ul>{formula.variables.map(v=><li key={v}>{v}</li>)}</ul></div><div className="electric-formula-example"><span className="electric-formula-marker">Пример расчёта</span><p>{formula.example}</p>{formula.note&&<small>{formula.note}</small>}</div></div>
  <div className="electric-formula-foot"><span>{index+1} / {formulas.length}</span><span>Новая формула при открытии кабинета</span></div>
 </section>
}
