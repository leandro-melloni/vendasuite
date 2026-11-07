--
-- PostgreSQL database dump
--

\restrict i4CcauneePDBdunNhWPxXMWoCahcPp7WrJtkDUtcWFxsgjdug5m6a25ImVyBQ7w

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11+demo EE 1.4.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: perfil_acesso; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.perfil_acesso AS ENUM (
    'administracao',
    'escrita',
    'leitura'
);


--
-- Name: criar_configuracao_tenant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.criar_configuracao_tenant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.configuracoes_metais (tenant_id, id, valor_ouro, valor_prata)
  values (new.id, 1, 0, 0) on conflict (tenant_id, id) do nothing;
  return new;
end; $$;


--
-- Name: criar_perfil_novo_usuario(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.criar_perfil_novo_usuario() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant_id uuid;
begin
  begin
    v_tenant_id := nullif(new.raw_user_meta_data ->> 'tenant_id', '')::uuid;
  exception when invalid_text_representation then
    v_tenant_id := null;
  end;

  insert into public.perfis (id, email, perfil, tenant_id)
  values (new.id, coalesce(new.email, ''), 'leitura', v_tenant_id)
  on conflict (id) do update
    set email = excluded.email,
        tenant_id = coalesce(public.perfis.tenant_id, excluded.tenant_id),
        updated_at = now();
  return new;
end;
$$;


--
-- Name: eh_superadmin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.eh_superadmin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
      from public.perfis p
      join public.tenants t on t.id = p.tenant_id
     where p.id = auth.uid()
       and p.perfil = 'administracao'
       and lower(t.slug) = 'vendasuite'
       and t.ativo = true
  )
$$;


--
-- Name: perfil_atual(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.perfil_atual() RETURNS public.perfil_acesso
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select perfil
    from public.perfis
   where id = auth.uid()
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: tenant_ativo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenant_ativo() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((
    select t.ativo
      from public.perfis p
      join public.tenants t on t.id = p.tenant_id
     where p.id = auth.uid()
  ), false)
$$;


--
-- Name: tenant_ativo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenant_ativo(tenant uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select exists (select 1 from public.tenants where id = tenant and ativo) $$;


--
-- Name: tenant_atual(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenant_atual() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select tenant_id from public.perfis where id = auth.uid() $$;


--
-- Name: tenant_atual_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tenant_atual_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select tenant_id
    from public.perfis
   where id = auth.uid()
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: acertos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acertos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mostruario_id uuid,
    vendedora_id uuid,
    data_acerto date DEFAULT CURRENT_DATE NOT NULL,
    itens jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_pecas integer DEFAULT 0 NOT NULL,
    valor_total numeric(12,2) DEFAULT 0 NOT NULL,
    comissao_percentual numeric(5,2) DEFAULT 50 NOT NULL,
    valor_comissao numeric(12,2) DEFAULT 0 NOT NULL,
    valor_receber numeric(12,2) DEFAULT 0 NOT NULL,
    forma_pagamento text NOT NULL,
    pagamentos jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid DEFAULT public.tenant_atual() NOT NULL,
    CONSTRAINT acertos_forma_pagamento_check CHECK ((forma_pagamento = ANY (ARRAY['Pix'::text, 'Dinheiro'::text])))
);


--
-- Name: configuracoes_metais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracoes_metais (
    id integer DEFAULT 1 NOT NULL,
    valor_ouro numeric(12,2) DEFAULT 0 NOT NULL,
    valor_prata numeric(12,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid DEFAULT public.tenant_atual() NOT NULL,
    CONSTRAINT configuracoes_metais_id_check CHECK ((id = 1))
);


--
-- Name: mostruario_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mostruario_itens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mostruario_id uuid,
    produto_id uuid,
    quantidade integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.tenant_atual() NOT NULL
);


--
-- Name: mostruarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mostruarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text NOT NULL,
    vendedora_id uuid,
    data_envio date,
    data_acerto date,
    status text DEFAULT 'disponivel'::text,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.tenant_atual() NOT NULL
);


--
-- Name: perfis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perfis (
    id uuid NOT NULL,
    email text NOT NULL,
    perfil public.perfil_acesso DEFAULT 'leitura'::public.perfil_acesso NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: plataforma_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plataforma_admins (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: produtos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produtos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    descricao text NOT NULL,
    categoria text,
    tipo text,
    preco numeric(10,2) DEFAULT 0,
    foto_url text,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    quoficiente numeric(12,5) DEFAULT 0,
    tenant_id uuid DEFAULT public.tenant_atual() NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    nome text NOT NULL,
    dominio_customizado text,
    logo_url text,
    cor_primaria text DEFAULT '#7a4f2b'::text NOT NULL,
    cor_secundaria text DEFAULT '#d7b98e'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenants_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text))
);


--
-- Name: vendedoras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendedoras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    cpf text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    celular text,
    ultimo text,
    proximo text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cep text,
    tenant_id uuid DEFAULT public.tenant_atual() NOT NULL
);


--
-- Name: acertos acertos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acertos
    ADD CONSTRAINT acertos_pkey PRIMARY KEY (id);


--
-- Name: configuracoes_metais configuracoes_metais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracoes_metais
    ADD CONSTRAINT configuracoes_metais_pkey PRIMARY KEY (tenant_id, id);


--
-- Name: mostruario_itens mostruario_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mostruario_itens
    ADD CONSTRAINT mostruario_itens_pkey PRIMARY KEY (id);


--
-- Name: mostruarios mostruarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mostruarios
    ADD CONSTRAINT mostruarios_pkey PRIMARY KEY (id);


--
-- Name: perfis perfis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfis
    ADD CONSTRAINT perfis_pkey PRIMARY KEY (id);


--
-- Name: plataforma_admins plataforma_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plataforma_admins
    ADD CONSTRAINT plataforma_admins_pkey PRIMARY KEY (user_id);


--
-- Name: produtos produtos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_dominio_customizado_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_dominio_customizado_key UNIQUE (dominio_customizado);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: vendedoras vendedoras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedoras
    ADD CONSTRAINT vendedoras_pkey PRIMARY KEY (id);


--
-- Name: mostruarios_tenant_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mostruarios_tenant_id_key ON public.mostruarios USING btree (tenant_id, id);


--
-- Name: mostruarios_tenant_numero_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mostruarios_tenant_numero_key ON public.mostruarios USING btree (tenant_id, numero);


--
-- Name: produtos_tenant_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX produtos_tenant_codigo_key ON public.produtos USING btree (tenant_id, codigo);


--
-- Name: produtos_tenant_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX produtos_tenant_id_key ON public.produtos USING btree (tenant_id, id);


--
-- Name: vendedoras_tenant_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vendedoras_tenant_codigo_key ON public.vendedoras USING btree (tenant_id, codigo);


--
-- Name: vendedoras_tenant_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vendedoras_tenant_id_key ON public.vendedoras USING btree (tenant_id, id);


--
-- Name: tenants criar_configuracao_apos_tenant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER criar_configuracao_apos_tenant AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.criar_configuracao_tenant();


--
-- Name: acertos acertos_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acertos
    ADD CONSTRAINT acertos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: acertos acertos_tenant_mostruario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acertos
    ADD CONSTRAINT acertos_tenant_mostruario_fkey FOREIGN KEY (tenant_id, mostruario_id) REFERENCES public.mostruarios(tenant_id, id) ON DELETE SET NULL (mostruario_id);


--
-- Name: acertos acertos_tenant_vendedora_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acertos
    ADD CONSTRAINT acertos_tenant_vendedora_fkey FOREIGN KEY (tenant_id, vendedora_id) REFERENCES public.vendedoras(tenant_id, id) ON DELETE SET NULL (vendedora_id);


--
-- Name: configuracoes_metais configuracoes_metais_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracoes_metais
    ADD CONSTRAINT configuracoes_metais_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: mostruario_itens itens_tenant_mostruario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mostruario_itens
    ADD CONSTRAINT itens_tenant_mostruario_fkey FOREIGN KEY (tenant_id, mostruario_id) REFERENCES public.mostruarios(tenant_id, id) ON DELETE CASCADE;


--
-- Name: mostruario_itens itens_tenant_produto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mostruario_itens
    ADD CONSTRAINT itens_tenant_produto_fkey FOREIGN KEY (tenant_id, produto_id) REFERENCES public.produtos(tenant_id, id) ON DELETE SET NULL (produto_id);


--
-- Name: mostruario_itens mostruario_itens_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mostruario_itens
    ADD CONSTRAINT mostruario_itens_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: mostruarios mostruarios_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mostruarios
    ADD CONSTRAINT mostruarios_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: mostruarios mostruarios_tenant_vendedora_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mostruarios
    ADD CONSTRAINT mostruarios_tenant_vendedora_fkey FOREIGN KEY (tenant_id, vendedora_id) REFERENCES public.vendedoras(tenant_id, id) ON DELETE SET NULL (vendedora_id);


--
-- Name: perfis perfis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfis
    ADD CONSTRAINT perfis_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: perfis perfis_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfis
    ADD CONSTRAINT perfis_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: plataforma_admins plataforma_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plataforma_admins
    ADD CONSTRAINT plataforma_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: produtos produtos_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: vendedoras vendedoras_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendedoras
    ADD CONSTRAINT vendedoras_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: acertos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acertos ENABLE ROW LEVEL SECURITY;

--
-- Name: perfis admin atualiza perfil do tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin atualiza perfil do tenant" ON public.perfis FOR UPDATE TO authenticated USING ((((tenant_id = public.tenant_atual()) AND (public.perfil_atual() = 'administracao'::public.perfil_acesso)) OR public.eh_superadmin())) WITH CHECK ((((tenant_id = public.tenant_atual()) AND (public.perfil_atual() = 'administracao'::public.perfil_acesso)) OR public.eh_superadmin()));


--
-- Name: perfis admin atualiza perfis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin atualiza perfis" ON public.perfis FOR UPDATE TO authenticated USING (((public.perfil_atual() = 'administracao'::public.perfil_acesso) AND (tenant_id = public.tenant_atual_id()))) WITH CHECK (((public.perfil_atual() = 'administracao'::public.perfil_acesso) AND (tenant_id = public.tenant_atual_id())));


--
-- Name: configuracoes_metais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.configuracoes_metais ENABLE ROW LEVEL SECURITY;

--
-- Name: perfis membro le proprio perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "membro le proprio perfil" ON public.perfis FOR SELECT TO authenticated USING (((id = auth.uid()) OR ((tenant_id = public.tenant_atual()) AND (public.perfil_atual() = 'administracao'::public.perfil_acesso)) OR public.eh_superadmin()));


--
-- Name: tenants membro le tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "membro le tenant" ON public.tenants FOR SELECT TO authenticated USING (((id = public.tenant_atual()) OR public.eh_superadmin()));


--
-- Name: mostruario_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mostruario_itens ENABLE ROW LEVEL SECURITY;

--
-- Name: mostruarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mostruarios ENABLE ROW LEVEL SECURITY;

--
-- Name: perfis perfil proprio ou lista admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfil proprio ou lista admin" ON public.perfis FOR SELECT TO authenticated USING (((id = auth.uid()) OR ((public.perfil_atual() = 'administracao'::public.perfil_acesso) AND (tenant_id = public.tenant_atual_id()))));


--
-- Name: perfis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

--
-- Name: plataforma_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plataforma_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: produtos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants superadmin atualiza tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "superadmin atualiza tenant" ON public.tenants FOR UPDATE TO authenticated USING (public.eh_superadmin()) WITH CHECK (public.eh_superadmin());


--
-- Name: tenants superadmin cria tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "superadmin cria tenant" ON public.tenants FOR INSERT TO authenticated WITH CHECK (public.eh_superadmin());


--
-- Name: tenants superadmin gerencia tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "superadmin gerencia tenants" ON public.tenants TO authenticated USING (public.eh_superadmin()) WITH CHECK (public.eh_superadmin());


--
-- Name: tenants superadmin remove tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "superadmin remove tenant" ON public.tenants FOR DELETE TO authenticated USING (public.eh_superadmin());


--
-- Name: plataforma_admins superadmin ve proprio acesso; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "superadmin ve proprio acesso" ON public.plataforma_admins FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: acertos tenant escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant escrita" ON public.acertos TO authenticated USING (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo() AND (public.perfil_atual() = ANY (ARRAY['administracao'::public.perfil_acesso, 'escrita'::public.perfil_acesso])))) WITH CHECK (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo() AND (public.perfil_atual() = ANY (ARRAY['administracao'::public.perfil_acesso, 'escrita'::public.perfil_acesso]))));


--
-- Name: configuracoes_metais tenant escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant escrita" ON public.configuracoes_metais TO authenticated USING (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo() AND (public.perfil_atual() = ANY (ARRAY['administracao'::public.perfil_acesso, 'escrita'::public.perfil_acesso])))) WITH CHECK (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo() AND (public.perfil_atual() = ANY (ARRAY['administracao'::public.perfil_acesso, 'escrita'::public.perfil_acesso]))));


--
-- Name: mostruario_itens tenant escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant escrita" ON public.mostruario_itens TO authenticated USING (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo() AND (public.perfil_atual() = ANY (ARRAY['administracao'::public.perfil_acesso, 'escrita'::public.perfil_acesso])))) WITH CHECK (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo() AND (public.perfil_atual() = ANY (ARRAY['administracao'::public.perfil_acesso, 'escrita'::public.perfil_acesso]))));


--
-- Name: mostruarios tenant escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant escrita" ON public.mostruarios TO authenticated USING (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo() AND (public.perfil_atual() = ANY (ARRAY['administracao'::public.perfil_acesso, 'escrita'::public.perfil_acesso])))) WITH CHECK (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo() AND (public.perfil_atual() = ANY (ARRAY['administracao'::public.perfil_acesso, 'escrita'::public.perfil_acesso]))));


--
-- Name: produtos tenant escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant escrita" ON public.produtos TO authenticated USING (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo() AND (public.perfil_atual() = ANY (ARRAY['administracao'::public.perfil_acesso, 'escrita'::public.perfil_acesso])))) WITH CHECK (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo() AND (public.perfil_atual() = ANY (ARRAY['administracao'::public.perfil_acesso, 'escrita'::public.perfil_acesso]))));


--
-- Name: vendedoras tenant escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant escrita" ON public.vendedoras TO authenticated USING (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo() AND (public.perfil_atual() = ANY (ARRAY['administracao'::public.perfil_acesso, 'escrita'::public.perfil_acesso])))) WITH CHECK (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo() AND (public.perfil_atual() = ANY (ARRAY['administracao'::public.perfil_acesso, 'escrita'::public.perfil_acesso]))));


--
-- Name: acertos tenant leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant leitura" ON public.acertos FOR SELECT TO authenticated USING (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo()));


--
-- Name: configuracoes_metais tenant leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant leitura" ON public.configuracoes_metais FOR SELECT TO authenticated USING (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo()));


--
-- Name: mostruario_itens tenant leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant leitura" ON public.mostruario_itens FOR SELECT TO authenticated USING (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo()));


--
-- Name: mostruarios tenant leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant leitura" ON public.mostruarios FOR SELECT TO authenticated USING (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo()));


--
-- Name: produtos tenant leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant leitura" ON public.produtos FOR SELECT TO authenticated USING (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo()));


--
-- Name: vendedoras tenant leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tenant leitura" ON public.vendedoras FOR SELECT TO authenticated USING (((tenant_id = public.tenant_atual_id()) AND public.tenant_ativo()));


--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants usuario consulta tenant atual; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "usuario consulta tenant atual" ON public.tenants FOR SELECT TO authenticated USING ((((id = public.tenant_atual_id()) AND (ativo = true)) OR public.eh_superadmin()));


--
-- Name: vendedoras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendedoras ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict i4CcauneePDBdunNhWPxXMWoCahcPp7WrJtkDUtcWFxsgjdug5m6a25ImVyBQ7w

