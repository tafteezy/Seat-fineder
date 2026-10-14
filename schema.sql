-- Seat finder: run this whole file once in Supabase -> SQL Editor.
-- The tables are locked (no public access). The site talks to the database
-- only through the functions below, each of which checks what the caller may do.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

create table weddings (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  token_hash text not null,               -- sha256 of the secret edit token (the token itself is never stored)
  n1 text not null, n2 text not null, email text not null,
  wedding_date date, tbd boolean not null default false, tz text,
  photo text, chairs int not null default 10, diff text not null default '',
  arrive boolean not null default false, pal int not null default 5, dark boolean not null default false,
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);

create table guests (
  id uuid primary key default gen_random_uuid(),
  pos bigint generated always as identity,
  wedding_id uuid not null references weddings(id) on delete cascade,
  first_name text not null, last_name text not null default '',
  tbl text not null default '', area text not null default '',
  norm text not null                      -- lowercase, accent-free name used for searching
);
create index on guests (wedding_id);

alter table weddings enable row level security;
alter table guests enable row level security;   -- no policies = the public key cannot touch these tables

/* ---------- internal helpers (not callable from the website) ---------- */

create function norm_text(t text) returns text language sql stable set search_path = public, extensions as $$
  select btrim(regexp_replace(regexp_replace(lower(unaccent(coalesce(t, ''))), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create function token_ok(p_slug text, p_token text) returns uuid language sql stable security definer set search_path = public, extensions as $$
  select id from weddings where slug = p_slug and token_hash = encode(digest(p_token, 'sha256'), 'hex')
$$;

-- "3: 6, Top table: 8" -> chairs for one table, falling back to the default
create function table_cap(diff text, tbl text, chairs int) returns int language sql immutable as $$
  select coalesce((
    select split_part(part, ':', 2)::int
    from unnest(string_to_array(diff, ',')) as part
    where btrim(split_part(part, ':', 2)) ~ '^\d+$'
      and regexp_replace(lower(btrim(split_part(part, ':', 1))), '^table ', '') = regexp_replace(lower(btrim(tbl)), '^table ', '')
    limit 1), chairs)
$$;

create function put_guests(wid uuid, g jsonb) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from guests where wedding_id = wid;
  insert into guests (wedding_id, first_name, last_name, tbl, area, norm)
  select wid, left(btrim(e->>'first'), 80), left(btrim(coalesce(e->>'last', '')), 80),
         left(btrim(coalesce(e->>'table', '')), 40), left(btrim(coalesce(e->>'area', '')), 80),
         norm_text((e->>'first') || ' ' || coalesce(e->>'last', ''))
  from jsonb_array_elements(g) with ordinality as t(e, ord)
  where btrim(coalesce(e->>'first', '')) <> ''
  order by ord;
end $$;

/* ---------- functions the website calls ---------- */

-- Couple publishes: returns the public slug and the secret edit token (shown once).
create function create_wedding(p jsonb, g jsonb) returns json language plpgsql security definer set search_path = public, extensions as $$
declare base text; s text; tok text; wid uuid; tries int := 0;
begin
  if btrim(coalesce(p->>'n1', '')) = '' or btrim(coalesce(p->>'n2', '')) = '' or btrim(coalesce(p->>'email', '')) = '' then
    raise exception 'Names and email are required';
  end if;
  base := btrim(regexp_replace(lower(unaccent((p->>'n1') || '-' || (p->>'n2'))), '[^a-z0-9]+', '-', 'g'), '-');
  if base = '' then base := 'wedding'; end if;
  s := base;
  while exists (select 1 from weddings where slug = s) and tries < 20 loop
    tries := tries + 1; s := base || '-' || (floor(random() * 9000) + 1000)::int;
  end loop;
  tok := encode(gen_random_bytes(24), 'hex');
  insert into weddings (slug, token_hash, n1, n2, email, wedding_date, tbd, tz, photo, chairs, diff, arrive, pal, dark)
  values (s, encode(digest(tok, 'sha256'), 'hex'), left(p->>'n1', 80), left(p->>'n2', 80), left(p->>'email', 200),
          nullif(p->>'date', '')::date, coalesce((p->>'tbd')::boolean, false), left(p->>'tz', 60),
          case when length(coalesce(p->>'photo', '')) < 300000 then p->>'photo' else '' end,
          greatest(1, coalesce((p->>'chairs')::int, 10)), left(coalesce(p->>'diff', ''), 200),
          coalesce((p->>'arrive')::boolean, false), greatest(0, least(11, coalesce((p->>'pal')::int, 5))),
          coalesce((p->>'dark')::boolean, false))
  returning id into wid;
  perform put_guests(wid, g);
  return json_build_object('slug', s, 'token', tok);
end $$;

-- Guest page: public details only (no email, no guest list).
create function get_site(p_slug text) returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object('n1', n1, 'n2', n2, 'date', wedding_date, 'tbd', tbd, 'photo', photo, 'pal', pal, 'dark', dark)
  from weddings where slug = p_slug
$$;

-- Guest search: names only, at most 8, and only for 2+ typed letters. Tables are not revealed here.
create function search_guests(p_slug text, p_query text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare terms text[]; wid uuid;
begin
  if length(norm_text(p_query)) < 2 then return '[]'::json; end if;
  terms := string_to_array(norm_text(p_query), ' ');
  select id into wid from weddings where slug = p_slug;
  if wid is null then return '[]'::json; end if;
  return coalesce((select json_agg(r) from (
    select g.id, g.first_name as first, g.last_name as last
    from guests g
    where g.wedding_id = wid and not exists (
      select 1 from unnest(terms) as t(term)
      where not exists (
        select 1 from unnest(string_to_array(g.norm, ' ')) as w(word)
        where w.word like t.term || '%' or (length(t.term) >= 4 and levenshtein(w.word, t.term) <= 1)))
    order by (g.norm = norm_text(p_query)) desc, g.norm
    limit 8) r), '[]'::json);
end $$;

-- One guest's seat. Also seats "on arrival" guests, one at a time, so two guests can't take the last chair.
create function get_seat(p_slug text, p_guest uuid) returns json language plpgsql security definer set search_path = public, extensions as $$
declare w weddings; g guests; t text;
begin
  select * into w from weddings where slug = p_slug for update;
  if not found then return null; end if;
  select * into g from guests where id = p_guest and wedding_id = w.id;
  if not found then return null; end if;
  if g.tbl = '' and w.arrive then
    select x.tbl into t from (select tbl, count(*) as c from guests where wedding_id = w.id and tbl <> '' group by tbl) x
    where x.c < table_cap(w.diff, x.tbl, w.chairs)
    order by lpad(regexp_replace(x.tbl, '\D', '', 'g'), 6, '0'), x.tbl limit 1;
    if t is null then
      t := ((select count(distinct tbl) from guests where wedding_id = w.id and tbl <> '') + 1)::text;
    end if;
    update guests set tbl = t where id = g.id;
    g.tbl := t;
  end if;
  return json_build_object('first', g.first_name, 'last', g.last_name, 'tbl', g.tbl, 'area', g.area);
end $$;

-- Couple opens their private link: returns everything (null if the token is wrong).
create function get_manage(p_slug text, p_token text) returns json language plpgsql security definer set search_path = public, extensions as $$
declare wid uuid;
begin
  wid := token_ok(p_slug, p_token);
  if wid is null then return null; end if;
  return (select json_build_object(
    'wedding', json_build_object('n1', w.n1, 'n2', w.n2, 'email', w.email, 'date', w.wedding_date, 'tbd', w.tbd, 'tz', w.tz,
      'photo', w.photo, 'chairs', w.chairs, 'diff', w.diff, 'arrive', w.arrive, 'pal', w.pal, 'dark', w.dark),
    'guests', coalesce((select json_agg(json_build_object('first', g.first_name, 'last', g.last_name, 'table', g.tbl, 'area', g.area) order by g.pos)
                        from guests g where g.wedding_id = w.id), '[]'::json))
    from weddings w where w.id = wid);
end $$;

-- Couple saves changes (replaces the guest list).
create function save_wedding(p_slug text, p_token text, p jsonb, g jsonb) returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare wid uuid;
begin
  wid := token_ok(p_slug, p_token);
  if wid is null then return false; end if;
  update weddings set n1 = left(p->>'n1', 80), n2 = left(p->>'n2', 80), email = left(p->>'email', 200),
    wedding_date = nullif(p->>'date', '')::date, tbd = coalesce((p->>'tbd')::boolean, false), tz = left(p->>'tz', 60),
    photo = case when length(coalesce(p->>'photo', '')) < 300000 then p->>'photo' else photo end,
    chairs = greatest(1, coalesce((p->>'chairs')::int, 10)), diff = left(coalesce(p->>'diff', ''), 200),
    arrive = coalesce((p->>'arrive')::boolean, false), pal = greatest(0, least(11, coalesce((p->>'pal')::int, 5))),
    dark = coalesce((p->>'dark')::boolean, false)
  where id = wid;
  perform put_guests(wid, g);
  return true;
end $$;

/* ---------- permissions ---------- */
revoke all on function norm_text(text), token_ok(text, text), table_cap(text, text, int), put_guests(uuid, jsonb) from public, anon, authenticated;
grant execute on function token_ok(text, text) to service_role;   -- used by the email function
grant execute on function create_wedding(jsonb, jsonb), get_site(text), search_guests(text, text), get_seat(text, uuid),
  get_manage(text, text), save_wedding(text, text, jsonb, jsonb) to anon, authenticated;
