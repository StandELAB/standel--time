'use client';
import {useEffect,useState} from 'react';
interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{outcome: 'accepted'|'dismissed'}>; }
export default function InstallPanel(){
 const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null);
 const [installed,setInstalled]=useState(false);
 const [ios,setIos]=useState(false);
 useEffect(()=>{
  const ua=navigator.userAgent;
  setIos(/iPad|iPhone|iPod/.test(ua) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1));
  const mq=window.matchMedia('(display-mode: standalone)');
  const update=()=>setInstalled(mq.matches || (navigator as Navigator & {standalone?:boolean}).standalone===true);
  update();mq.addEventListener?.('change',update);
  const before=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPromptEvent)};
  const onInstalled=()=>{setInstalled(true);setPrompt(null)};
  window.addEventListener('beforeinstallprompt',before);
  window.addEventListener('appinstalled',onInstalled);
  return()=>{mq.removeEventListener?.('change',update);window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',onInstalled)};
 },[]);
 async function install(){if(!prompt)return;await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')setPrompt(null)}
 return <div className="pwa-install-panel">
  {installed?<p className="ok"><strong>Приложение уже запущено с главного экрана.</strong></p>:prompt?<button type="button" onClick={()=>void install()}>Установить StandEL Time</button>:null}
  <h2>iPhone / iPad</h2>
  <ol><li>Открой <strong>time.standel.se</strong> в Safari.</li><li>Нажми <strong>Поделиться</strong> (квадрат со стрелкой вверх).</li><li>Выбери <strong>На экран «Домой»</strong> / <strong>Lägg till på hemskärmen</strong>.</li><li>Подтверди <strong>Добавить</strong>.</li></ol>
  <h2>Android</h2><ol><li>Открой <strong>time.standel.se</strong> в Chrome.</li><li>Нажми меню <strong>⋮</strong>.</li><li>Выбери <strong>Установить приложение</strong> или <strong>Добавить на главный экран</strong>.</li></ol>
  {ios?<p className="muted">На iPhone кнопка установки на сайте обычно не появляется: воспользуйся меню «Поделиться» в Safari.</p>:null}
 </div>
}
