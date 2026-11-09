// Supabase connection for the "마음 나눔" section.
// Both values are public by design (the anon key only allows what the
// database Row Level Security policies in supabase/schema.sql permit).
// Leave empty to show the section as "준비 중".
window.OTB_CONFIG = {
  supabaseUrl: 'https://tmsvplpommtdxvhyqusw.supabase.co',
  supabaseAnonKey: 'sb_publishable_MyJwzhWD0ffen9aB0tXUbQ_G2IxYKCQ', // publishable (public) key
  adminLoginEmail: 'admin@onetobeyond.org', // the Supabase user whose password is the admin access code
};
