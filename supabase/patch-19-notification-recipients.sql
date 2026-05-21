-- Patch 19: รายชื่ออีเมลที่จะได้รับแจ้งเตือนเมื่อมี Reject order
--
-- Admin จัดการผ่าน Admin Panel → tab "📧 Reject Notify"
-- /api/notify-reject อ่านรายชื่อจากตารางนี้ (เฉพาะ enabled=true) แล้วส่งอีเมล

create table if not exists public.notification_recipients (
  id bigserial primary key,
  email text not null,
  name text,
  role_label text,                          -- คำอธิบาย เช่น 'PCM Team', 'QC Manager'
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create index if not exists notification_recipients_enabled_idx
  on public.notification_recipients (enabled) where enabled = true;

alter table public.notification_recipients enable row level security;

drop policy if exists "notify_recipients_read"   on public.notification_recipients;
drop policy if exists "notify_recipients_write"  on public.notification_recipients;

-- Anyone authenticated can read (frontend needs list for admin UI)
create policy "notify_recipients_read"
  on public.notification_recipients for select
  using (auth.role() = 'authenticated');

-- Only admin can write
create policy "notify_recipients_write"
  on public.notification_recipients for all
  using (public.current_role_level() = 'admin')
  with check (public.current_role_level() = 'admin');

-- Trigger updated_at
create or replace function public.set_notify_recipients_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;$$;

drop trigger if exists trg_notify_recipients_updated_at on public.notification_recipients;
create trigger trg_notify_recipients_updated_at
  before update on public.notification_recipients
  for each row execute function public.set_notify_recipients_updated_at();

comment on table public.notification_recipients is
  'Recipient list for Reject order email notifications. Admin-managed.';
