import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
export async function proxy(req:NextRequest){
  let response=NextResponse.next({request:req});
  const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{
    cookies:{
      getAll(){return req.cookies.getAll()},
      setAll(cookies){cookies.forEach(({name,value})=>req.cookies.set(name,value));response=NextResponse.next({request:req});cookies.forEach(({name,value,options})=>response.cookies.set(name,value,options))}
    }
  });
  await client.auth.getClaims();
  return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']};
