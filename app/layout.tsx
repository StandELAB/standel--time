import './globals.css';
import Header from './components/header';
export const metadata={referrer:'no-referrer' as const,title:'StandEL Time',description:'StandEL AB • Work time management'};
export default function Layout({children}:{children:React.ReactNode}){
 return <html lang="ru"><body><Header/><main>{children}</main></body></html>;
}
