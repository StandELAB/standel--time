import './globals.css';
import Link from 'next/link';
export const metadata={referrer:'no-referrer' as const,title:'StandEL Time',description:'StandEL AB • Work time management'};
export default function Layout({children}:{children:React.ReactNode}){
 return <html lang="ru"><body><header><img src="/standel-logo.png" alt="StandEL"/><strong>StandEL Time · v0.7</strong><nav><Link href="/">Главная</Link><Link href="/login">Вход</Link></nav></header><main>{children}</main></body></html>;
}
