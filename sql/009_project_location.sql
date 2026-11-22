-- StandEL Time v0.27 — адрес и город объекта.
-- Таблица public.projects уже содержит client_name (заказчик).
-- Только добавление полей, без удаления записей и изменения RLS.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS site_address text,
  ADD COLUMN IF NOT EXISTS site_city text;

-- Если API использует кеш схемы PostgREST, обновляем его.
NOTIFY pgrst, 'reload schema';
