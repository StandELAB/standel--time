import {NextRequest,NextResponse} from 'next/server';
import {serverClient} from '../../../lib/supabase/server';
export async function GET(req:NextRequest){
 const code=req.nextUrl.searchParams.get('code');const redirect=new URL('/employee',req.url);
 if(code){const s=await serverClient();const {error}=await s.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(redirect)}
 return NextResponse.redirect(new URL('/login?error=callback',req.url));
}
