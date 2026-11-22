import InstallPanel from './install-panel';
export const metadata={title:'Установить StandEL Time'};
export default function InstallPage(){return <section className="panel"><h1>StandEL Time на телефоне</h1><p>Установи корпоративное приложение StandEL AB на главный экран iPhone или Android. Сотрудники и администраторы входят в свои существующие аккаунты.</p><InstallPanel/><p className="muted">Часы и документы загружаются через защищённое соединение. Для работы требуется интернет. Данные сотрудников не сохраняются офлайн на телефоне.</p></section>}
