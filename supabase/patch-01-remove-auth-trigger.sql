-- Patch: ลบ auth trigger ที่ทำให้สร้าง user ไม่ได้
-- เหตุผล: Supabase Auth ใน project รุ่นใหม่ ไม่ยอมให้ trigger on auth.users ทำ write ข้าม schema
-- แก้: ให้ seed-users.mjs เป็นคน insert profiles เอง (ทำอยู่แล้ว)

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
