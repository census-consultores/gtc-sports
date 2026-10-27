-- GTC Sports · módulo de torneos (réplica de Tournament Planner) · 27-oct-2026
-- Un torneo = un documento (como el archivo .TP). Solo la SECRET key de las funciones de Vercel lo lee o escribe:
-- RLS activo y sin políticas; anon y authenticated no tienen ningún privilegio.
create table if not exists public.tp_torneos (
  id          text primary key,
  nombre      text not null,
  grupo       text,                      -- categoría del torneo para la app: Pádel, Olimpiadas, Mundialito +44…
  deporte     text not null,
  desde       date,
  hasta       date,
  estado      text not null default 'curso' check (estado in ('borrador','curso','finalizado')),
  publicado   boolean not null default false,
  rev         integer not null default 1,  -- control de versión al guardar
  data        jsonb not null,             -- torneo completo (incluye cédulas y pagos: nunca sale al cliente público)
  publico     jsonb,                      -- vista pública calculada en el servidor (sin datos personales)
  creado_por  text,
  actualizado_por text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tp_torneos_pub_idx on public.tp_torneos (publicado, desde desc);
alter table public.tp_torneos enable row level security;
revoke all on table public.tp_torneos from anon, authenticated;
