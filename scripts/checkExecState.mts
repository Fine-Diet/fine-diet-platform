import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key);
const { data, error } = await sb.from('planned_meals').select('execution_state,journal_entry_id').limit(2);
if (error) console.error('ERROR:', error.message);
else console.log('OK rows:', data?.length, 'sample:', JSON.stringify(data?.[0]));
