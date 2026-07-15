--
-- PostgreSQL database dump
--

\restrict 956S8q7LwnTZdkF9wusdu28MALEiY9ZL6xRh4OTcv7C2lI5WbbwzH9QaZBbMR8z

-- Dumped from database version 15.18
-- Dumped by pg_dump version 18.4

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
-- Name: editorial; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA editorial;


--
-- Name: immutable_unaccent(text); Type: FUNCTION; Schema: editorial; Owner: -
--

CREATE FUNCTION editorial.immutable_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $_$
    SELECT unaccent('unaccent', $1)
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: card_concepts; Type: TABLE; Schema: editorial; Owner: -
--

CREATE TABLE editorial.card_concepts (
    card_id uuid NOT NULL,
    concept_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: card_revisions; Type: TABLE; Schema: editorial; Owner: -
--

CREATE TABLE editorial.card_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    card_id uuid NOT NULL,
    card_key text NOT NULL,
    title text,
    summary text,
    concepts jsonb,
    principles jsonb,
    quotes jsonb,
    evidence jsonb,
    relevance_score integer,
    superseded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: concepts; Type: TABLE; Schema: editorial; Owner: -
--

CREATE TABLE editorial.concepts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_name text NOT NULL,
    normalized_key text GENERATED ALWAYS AS (editorial.immutable_unaccent(lower(regexp_replace(TRIM(BOTH FROM canonical_name), '[-_]+'::text, ' '::text, 'g'::text)))) STORED,
    aliases jsonb DEFAULT '[]'::jsonb NOT NULL,
    description text,
    first_observed_at timestamp with time zone DEFAULT now() NOT NULL,
    last_observed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: content_segments; Type: TABLE; Schema: editorial; Owner: -
--

CREATE TABLE editorial.content_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    segment_key text NOT NULL,
    source_id uuid NOT NULL,
    segment_order integer NOT NULL,
    segment_type text NOT NULL,
    title text NOT NULL,
    executive_summary text,
    full_text text NOT NULL,
    keywords jsonb DEFAULT '[]'::jsonb NOT NULL,
    concepts jsonb DEFAULT '[]'::jsonb NOT NULL,
    related_themes jsonb DEFAULT '[]'::jsonb NOT NULL,
    editorial_applications jsonb DEFAULT '[]'::jsonb NOT NULL,
    editorial_relevance integer DEFAULT 0 NOT NULL,
    speaker_type text,
    is_channeled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    speaker_id uuid,
    CONSTRAINT segments_relevance_range CHECK (((editorial_relevance >= 0) AND (editorial_relevance <= 100)))
);


--
-- Name: knowledge_cards; Type: TABLE; Schema: editorial; Owner: -
--

CREATE TABLE editorial.knowledge_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    card_key text NOT NULL,
    source_id uuid NOT NULL,
    theme_id uuid NOT NULL,
    block_number integer,
    title text NOT NULL,
    summary text NOT NULL,
    concepts jsonb DEFAULT '[]'::jsonb NOT NULL,
    principles jsonb DEFAULT '[]'::jsonb NOT NULL,
    quotes jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    relevance_score integer NOT NULL,
    importance_score integer DEFAULT 0 NOT NULL,
    importance_level text DEFAULT 'emergente'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    segment_id uuid,
    CONSTRAINT cards_importance_level_valid CHECK (((importance_level IS NULL) OR (importance_level = ANY (ARRAY['emergente'::text, 'apoio'::text, 'forte'::text, 'pilar'::text])))),
    CONSTRAINT cards_importance_range CHECK (((importance_score >= 0) AND (importance_score <= 100))),
    CONSTRAINT cards_relevance_range CHECK (((relevance_score >= 0) AND (relevance_score <= 100)))
);


--
-- Name: segment_concepts; Type: TABLE; Schema: editorial; Owner: -
--

CREATE TABLE editorial.segment_concepts (
    segment_id uuid NOT NULL,
    concept_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: segment_revisions; Type: TABLE; Schema: editorial; Owner: -
--

CREATE TABLE editorial.segment_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    segment_id uuid NOT NULL,
    segment_key text NOT NULL,
    segment_order integer,
    segment_type text,
    title text,
    executive_summary text,
    full_text text,
    keywords jsonb,
    concepts jsonb,
    related_themes jsonb,
    editorial_applications jsonb,
    editorial_relevance integer,
    speaker_type text,
    is_channeled boolean,
    superseded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: segment_types; Type: TABLE; Schema: editorial; Owner: -
--

CREATE TABLE editorial.segment_types (
    type_key text NOT NULL,
    name text NOT NULL,
    description text,
    editorially_disposable boolean DEFAULT false NOT NULL
);


--
-- Name: sources; Type: TABLE; Schema: editorial; Owner: -
--

CREATE TABLE editorial.sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_file_id text NOT NULL,
    file_name text NOT NULL,
    source_type text NOT NULL,
    session_date date,
    drive_url text,
    transcript_text text,
    processing_status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: speakers; Type: TABLE; Schema: editorial; Owner: -
--

CREATE TABLE editorial.speakers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    speaker_key text NOT NULL,
    canonical_name text NOT NULL,
    aliases jsonb DEFAULT '[]'::jsonb NOT NULL,
    description text,
    is_channeled_entity boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: themes; Type: TABLE; Schema: editorial; Owner: -
--

CREATE TABLE editorial.themes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    theme_key text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    minimum_relevance integer DEFAULT 70 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT themes_relevance_range CHECK (((minimum_relevance >= 0) AND (minimum_relevance <= 100)))
);


--
-- Name: card_concepts card_concepts_pkey; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.card_concepts
    ADD CONSTRAINT card_concepts_pkey PRIMARY KEY (card_id, concept_id);


--
-- Name: card_revisions card_revisions_pkey; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.card_revisions
    ADD CONSTRAINT card_revisions_pkey PRIMARY KEY (id);


--
-- Name: concepts concepts_pkey; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.concepts
    ADD CONSTRAINT concepts_pkey PRIMARY KEY (id);


--
-- Name: content_segments content_segments_pkey; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.content_segments
    ADD CONSTRAINT content_segments_pkey PRIMARY KEY (id);


--
-- Name: content_segments content_segments_segment_key_key; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.content_segments
    ADD CONSTRAINT content_segments_segment_key_key UNIQUE (segment_key);


--
-- Name: knowledge_cards knowledge_cards_card_key_key; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.knowledge_cards
    ADD CONSTRAINT knowledge_cards_card_key_key UNIQUE (card_key);


--
-- Name: knowledge_cards knowledge_cards_pkey; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.knowledge_cards
    ADD CONSTRAINT knowledge_cards_pkey PRIMARY KEY (id);


--
-- Name: segment_concepts segment_concepts_pkey; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.segment_concepts
    ADD CONSTRAINT segment_concepts_pkey PRIMARY KEY (segment_id, concept_id);


--
-- Name: segment_revisions segment_revisions_pkey; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.segment_revisions
    ADD CONSTRAINT segment_revisions_pkey PRIMARY KEY (id);


--
-- Name: segment_types segment_types_pkey; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.segment_types
    ADD CONSTRAINT segment_types_pkey PRIMARY KEY (type_key);


--
-- Name: sources sources_external_file_id_key; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.sources
    ADD CONSTRAINT sources_external_file_id_key UNIQUE (external_file_id);


--
-- Name: sources sources_pkey; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.sources
    ADD CONSTRAINT sources_pkey PRIMARY KEY (id);


--
-- Name: speakers speakers_pkey; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.speakers
    ADD CONSTRAINT speakers_pkey PRIMARY KEY (id);


--
-- Name: speakers speakers_speaker_key_key; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.speakers
    ADD CONSTRAINT speakers_speaker_key_key UNIQUE (speaker_key);


--
-- Name: themes themes_pkey; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.themes
    ADD CONSTRAINT themes_pkey PRIMARY KEY (id);


--
-- Name: themes themes_theme_key_key; Type: CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.themes
    ADD CONSTRAINT themes_theme_key_key UNIQUE (theme_key);


--
-- Name: idx_card_concepts_concept; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_card_concepts_concept ON editorial.card_concepts USING btree (concept_id);


--
-- Name: idx_card_revisions_card; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_card_revisions_card ON editorial.card_revisions USING btree (card_id);


--
-- Name: idx_cards_concepts_gin; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_cards_concepts_gin ON editorial.knowledge_cards USING gin (concepts);


--
-- Name: idx_cards_importance; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_cards_importance ON editorial.knowledge_cards USING btree (importance_score DESC);


--
-- Name: idx_cards_segment; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_cards_segment ON editorial.knowledge_cards USING btree (segment_id);


--
-- Name: idx_cards_source; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_cards_source ON editorial.knowledge_cards USING btree (source_id);


--
-- Name: idx_cards_theme; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_cards_theme ON editorial.knowledge_cards USING btree (theme_id);


--
-- Name: idx_concepts_normalized_key; Type: INDEX; Schema: editorial; Owner: -
--

CREATE UNIQUE INDEX idx_concepts_normalized_key ON editorial.concepts USING btree (normalized_key);


--
-- Name: idx_segment_concepts_concept; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_segment_concepts_concept ON editorial.segment_concepts USING btree (concept_id);


--
-- Name: idx_segment_revisions_segment; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_segment_revisions_segment ON editorial.segment_revisions USING btree (segment_id);


--
-- Name: idx_segments_channeled; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_segments_channeled ON editorial.content_segments USING btree (is_channeled);


--
-- Name: idx_segments_concepts_gin; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_segments_concepts_gin ON editorial.content_segments USING gin (concepts);


--
-- Name: idx_segments_keywords_gin; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_segments_keywords_gin ON editorial.content_segments USING gin (keywords);


--
-- Name: idx_segments_relevance; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_segments_relevance ON editorial.content_segments USING btree (editorial_relevance DESC);


--
-- Name: idx_segments_source; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_segments_source ON editorial.content_segments USING btree (source_id);


--
-- Name: idx_segments_speaker; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_segments_speaker ON editorial.content_segments USING btree (speaker_id);


--
-- Name: idx_segments_type; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_segments_type ON editorial.content_segments USING btree (segment_type);


--
-- Name: idx_sources_session_date; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_sources_session_date ON editorial.sources USING btree (session_date);


--
-- Name: idx_sources_status; Type: INDEX; Schema: editorial; Owner: -
--

CREATE INDEX idx_sources_status ON editorial.sources USING btree (processing_status);


--
-- Name: card_concepts card_concepts_card_id_fkey; Type: FK CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.card_concepts
    ADD CONSTRAINT card_concepts_card_id_fkey FOREIGN KEY (card_id) REFERENCES editorial.knowledge_cards(id) ON DELETE CASCADE;


--
-- Name: card_concepts card_concepts_concept_id_fkey; Type: FK CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.card_concepts
    ADD CONSTRAINT card_concepts_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES editorial.concepts(id) ON DELETE CASCADE;


--
-- Name: card_revisions card_revisions_card_id_fkey; Type: FK CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.card_revisions
    ADD CONSTRAINT card_revisions_card_id_fkey FOREIGN KEY (card_id) REFERENCES editorial.knowledge_cards(id) ON DELETE CASCADE;


--
-- Name: content_segments content_segments_source_id_fkey; Type: FK CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.content_segments
    ADD CONSTRAINT content_segments_source_id_fkey FOREIGN KEY (source_id) REFERENCES editorial.sources(id) ON DELETE CASCADE;


--
-- Name: content_segments content_segments_speaker_id_fkey; Type: FK CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.content_segments
    ADD CONSTRAINT content_segments_speaker_id_fkey FOREIGN KEY (speaker_id) REFERENCES editorial.speakers(id);


--
-- Name: content_segments fk_segments_segment_type; Type: FK CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.content_segments
    ADD CONSTRAINT fk_segments_segment_type FOREIGN KEY (segment_type) REFERENCES editorial.segment_types(type_key);


--
-- Name: knowledge_cards knowledge_cards_segment_id_fkey; Type: FK CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.knowledge_cards
    ADD CONSTRAINT knowledge_cards_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES editorial.content_segments(id) ON DELETE SET NULL;


--
-- Name: knowledge_cards knowledge_cards_source_id_fkey; Type: FK CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.knowledge_cards
    ADD CONSTRAINT knowledge_cards_source_id_fkey FOREIGN KEY (source_id) REFERENCES editorial.sources(id) ON DELETE CASCADE;


--
-- Name: knowledge_cards knowledge_cards_theme_id_fkey; Type: FK CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.knowledge_cards
    ADD CONSTRAINT knowledge_cards_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES editorial.themes(id);


--
-- Name: segment_concepts segment_concepts_concept_id_fkey; Type: FK CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.segment_concepts
    ADD CONSTRAINT segment_concepts_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES editorial.concepts(id) ON DELETE CASCADE;


--
-- Name: segment_concepts segment_concepts_segment_id_fkey; Type: FK CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.segment_concepts
    ADD CONSTRAINT segment_concepts_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES editorial.content_segments(id) ON DELETE CASCADE;


--
-- Name: segment_revisions segment_revisions_segment_id_fkey; Type: FK CONSTRAINT; Schema: editorial; Owner: -
--

ALTER TABLE ONLY editorial.segment_revisions
    ADD CONSTRAINT segment_revisions_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES editorial.content_segments(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 956S8q7LwnTZdkF9wusdu28MALEiY9ZL6xRh4OTcv7C2lI5WbbwzH9QaZBbMR8z

