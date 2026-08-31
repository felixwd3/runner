import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://czpvihbjnbpjueoowjnp.supabase.co';
const supabaseAnonKey = 'sb_publishable_LYP2WntkDtQ3ahSAHNzhhQ_WyOA_0I9';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});