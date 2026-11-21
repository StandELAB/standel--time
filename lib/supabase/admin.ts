import { createClient } from '@supabase/supabase-js';
export function adminClient(){
  if(!process.env.SUPABASE_SECRET_KEY) throw new Error('Missing SUPABASE_SECRET_KEY');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
  });
}
