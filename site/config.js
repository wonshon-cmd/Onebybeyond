// Supabase connection for the "마음 나눔" section.
// Both values are public by design (the anon key only allows what the
// database Row Level Security policies in supabase/schema.sql permit).
// Leave empty to show the section as "준비 중".
window.OTB_CONFIG = {
  supabaseUrl: '',      // e.g. 'https://abcdefgh.supabase.co'
  supabaseAnonKey: '',  // Project Settings → API → anon public key
  adminLoginEmail: 'admin@onetobeyond.org', // the Supabase user whose password is the admin access code
};
