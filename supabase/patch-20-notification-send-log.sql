-- Patch 20: บันทึกประวัติการส่งอีเมลแจ้งเตือน Reject
--
-- ทุกครั้งที่ /api/notify-reject ส่ง email (สำเร็จหรือล้มเหลว) → insert row
-- ใช้ตรวจประวัติว่า order ไหนถูกส่งไปแล้ว ส่งไปให้ใคร เมื่อไหร่

create table if not exists public.notification_send_log (
  id bigserial primary key,
  order_id bigint references public.qc_orders(id) on delete set null,
  order_no text,
  ncr_no text,
  recipient_count int default 0,
  recipient_emails text,                    -- comma-separated for reference
  attached_pdf boolean default false,
  status text not null default 'success',   -- 'success' / 'failed' / 'skipped'
  error_detail text,                        -- only filled when status='failed'
  triggered_by uuid references public.profiles(id),
  sent_at timestamptz not null default now()
);

create index if not exists notification_send_log_sent_at_idx
  on public.notification_send_log (sent_at desc);

create index if not exists notification_send_log_order_id_idx
  on public.notification_send_log (order_id);

alter table public.notification_send_log enable row level security;

drop policy if exists "notify_send_log_read" on public.notification_send_log;

-- admin + qc_admin can read (same audience that can use Reject Notify tab)
create policy "notify_send_log_read"
  on public.notification_send_log for select
  using (public.current_role_level() in ('admin', 'qc_admin'));

-- INSERT only via service-role (API uses service key) — no explicit policy

comment on table public.notification_send_log is
  'Audit log: one row per /api/notify-reject invocation. Read: admin/qc_admin.';
