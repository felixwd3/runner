import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://avvxdadiblyrmsqzdwuq.supabase.co';
const supabaseAnonKey = 'sb_publishable_eyxy5-FAFF3PCvfsXKe44Q_iEXt_MEo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});