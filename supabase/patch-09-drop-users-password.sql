-- Patch 09: ลบคอลัมน์ password ออกจาก public.users
-- เหตุผล: ระบบ login จริงใช้ auth.users (Supabase Auth) — public.users เป็นแค่ reference list
-- การเก็บ password เป็น plain text ไม่ปลอดภัย และทำให้สับสนกับรหัสจริง

alter table public.users drop column if exists password;
