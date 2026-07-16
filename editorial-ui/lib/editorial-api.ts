import "server-only";

export class EditorialApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `Editorial API error (${status})`
    );
    this.status = status;
    this.body = body;
  }
}

function getConfig(): { apiUrl: string; apiKey: string } {
  const apiUrl = process.env.EDITORIAL_API_URL;
  const apiKey = process.env.EDITORIAL_API_KEY;
  if (!apiUrl) throw new Error("Missing EDITORIAL_API_URL env var");
  if (!apiKey) throw new Error("Missing EDITORIAL_API_KEY env var");
  return { apiUrl, apiKey };
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; searchParams?: Record<string, string | number | boolean | undefined> } = {}
): Promise<T> {
  const { apiUrl, apiKey } = getConfig();
  const url = new URL(path, apiUrl);
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "X-Service-Api-Key": apiKey,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new EditorialApiError(response.status, data);
  }
  return data as T;
}

// ---------- Tipos ----------

export type Segment = {
  id: string;
  segment_key: string;
  title: string;
  executive_summary: string | null;
  full_text: string;
  segment_type: string;
  keywords: string[];
  concepts: string[];
  related_themes: string[];
  editorial_applications: string[];
  editorial_relevance: number;
  speaker_type: string | null;
  is_channeled: boolean;
  external_file_id: string;
  source_file_name: string;
  session_date: string | null;
};

export type KnowledgeCard = {
  id: string;
  card_key: string;
  title: string;
  summary: string;
  concepts: string[];
  principles: string[];
  quotes: string[];
  evidence: string[];
  relevance_score: number;
  importance_score: number;
  importance_level: string;
  segment_id: string | null;
  external_file_id: string;
  source_file_name: string;
  session_date: string | null;
  theme_key: string;
  theme_name: string;
};

export type Concept = {
  id: string;
  canonical_name: string;
  aliases: string[];
  description: string | null;
  importance_score: number;
  importance_level: string;
  scope: "universal" | "tematico";
  segment_count: number;
  card_count: number;
};

export type SegmentInsight = {
  id: string;
  segment_id: string;
  concept_title: string;
  explanation: string;
  philosophical_context: string;
  practical_application: string;
  related_concepts: string[];
  status: "suggested" | "reviewed" | "dismissed";
  generated_at: string;
  model: string;
};

export type ConceptRelation = {
  id: string;
  relation_type: string;
  direction: string | null;
  cooccurrence_count: number;
  related_concept_id: string;
  related_concept_name: string;
  related_concept_importance_score: number;
};

export type SearchResult = {
  result_type: "segment" | "knowledge_card";
  id: string;
  title: string;
  executive_summary?: string;
  summary?: string;
  segment_type?: string;
  editorial_relevance?: number;
  is_channeled?: boolean;
  importance_score?: number;
  importance_level?: string;
  external_file_id: string;
  source_file_name: string;
  session_date: string | null;
  similarity: number;
};

export type BookProject = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  chapter_count?: number;
};

export type ChapterSummary = {
  id: string;
  chapter_order: number;
  title: string;
  status: string;
  thematic_scope: string[];
  source_count: number;
};

export type BookProjectDetail = BookProject & { chapters: ChapterSummary[] };

export type ChapterSource = {
  id: string;
  source_order: number;
  inclusion_type: "literal_segment" | "card_synthesis" | "transition_context";
  content: string | null;
  segment_id: string | null;
  knowledge_card_id: string | null;
  segment_title: string | null;
  segment_full_text: string | null;
  segment_type: string | null;
  is_channeled: boolean | null;
  card_title: string | null;
  card_summary: string | null;
};

export type ChapterDetail = {
  id: string;
  book_project_id: string;
  book_project_title: string;
  chapter_order: number;
  title: string;
  thematic_scope: string[];
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  sources: ChapterSource[];
};

export type ConsolidationIssue = {
  type: string;
  detail?: string;
  chapter_source_id?: string;
  chapter_source_ids?: string[];
  alias_found?: string;
  canonical_name?: string;
  adjacent_segment_id?: string;
  similarity?: number;
};

export type ConsolidationCheck = {
  chapter_id: string;
  issues: ConsolidationIssue[];
  note: string;
};

export type DuplicateConflict = {
  chapter_a_id: string;
  chapter_b_id: string;
  source_a_id: string;
  source_b_id: string;
  title_a: string;
  title_b: string;
  similarity: number;
};

export type DuplicateReport = {
  book_project_id: string;
  threshold: number;
  conflicts: DuplicateConflict[];
};

export type ChapterSuggestionSummary = {
  id: string;
  title: string;
  summary: string;
  thematic_scope: string[];
  status: "suggested" | "dismissed" | "promoted";
  generated_at: string;
};

export type ChapterSuggestionDetail = ChapterSuggestionSummary & {
  proposed_sources: ChapterSourceInput[];
  promoted_chapter_id: string | null;
  model: string;
  sources: ChapterSource[];
};

// ---------- Leitura / navegação do acervo ----------

export function listSegments(params: {
  theme?: string;
  type?: string;
  channeled?: boolean;
  concept?: string;
  limit?: number;
}) {
  return request<Segment[]>("/segments", {
    searchParams: {
      theme: params.theme,
      type: params.type,
      channeled: params.channeled === undefined ? undefined : String(params.channeled),
      concept: params.concept,
      limit: params.limit,
    },
  });
}

export function listKnowledgeCards(params: { theme?: string; concept?: string; limit?: number }) {
  return request<KnowledgeCard[]>("/knowledge-cards", { searchParams: params });
}

export function listConcepts(limit = 200) {
  return request<Concept[]>("/concepts", { searchParams: { limit } });
}

export function getConceptRelations(conceptId: string) {
  return request<{ concept: { id: string; canonical_name: string }; relations: ConceptRelation[] }>(
    `/concepts/${conceptId}/relations`
  );
}

export function listSegmentInsights(segmentId: string) {
  return request<SegmentInsight[]>(`/segments/${segmentId}/insights`);
}

export function generateSegmentInsights(segmentId: string) {
  return request<SegmentInsight[]>(`/segments/${segmentId}/insights`, { method: "POST" });
}

export function reviewSegmentInsight(id: string) {
  return request<SegmentInsight>(`/segment-insights/${id}/review`, { method: "POST" });
}

export function dismissSegmentInsight(id: string) {
  return request<SegmentInsight>(`/segment-insights/${id}/dismiss`, { method: "POST" });
}

export function setConceptScope(id: string, scope: "universal" | "tematico") {
  return request<{ id: string; canonical_name: string; scope: string }>(`/concepts/${id}/scope`, {
    method: "POST",
    body: { scope },
  });
}

export function searchArchive(query: string, opts: { limit?: number; include?: string[] } = {}) {
  return request<SearchResult[]>("/search", {
    method: "POST",
    body: { query, limit: opts.limit ?? 10, include: opts.include },
  });
}

// ---------- Projetos e capítulos ----------

export function listBookProjects() {
  return request<BookProject[]>("/book-projects");
}

export function getBookProject(id: string) {
  return request<BookProjectDetail>(`/book-projects/${id}`);
}

export function createBookProject(input: { title: string; description?: string }) {
  return request<BookProject>("/book-projects", { method: "POST", body: input });
}

export function createChapter(
  bookProjectId: string,
  input: { title: string; chapter_order: number; thematic_scope: string[] }
) {
  return request<ChapterSummary>(`/book-projects/${bookProjectId}/chapters`, {
    method: "POST",
    body: input,
  });
}

export function getChapter(id: string) {
  return request<ChapterDetail>(`/chapters/${id}`);
}

export function proposeChapterSources(id: string, opts: { limit?: number } = {}) {
  return request<ChapterDetail>(`/chapters/${id}/propose`, { method: "POST", body: opts });
}

export type ChapterSourceInput = {
  segment_id?: string | null;
  knowledge_card_id?: string | null;
  inclusion_type: "literal_segment" | "card_synthesis" | "transition_context";
  content?: string | null;
};

export function setChapterSources(id: string, sources: ChapterSourceInput[]) {
  return request<ChapterDetail>(`/chapters/${id}/sources`, { method: "PUT", body: { sources } });
}

export function approveChapter(id: string) {
  return request<ChapterDetail>(`/chapters/${id}/approve`, { method: "POST" });
}

export function reviewChapter(id: string, reviewedBy: string) {
  return request<ChapterDetail>(`/chapters/${id}/review`, {
    method: "POST",
    body: { reviewed_by: reviewedBy },
  });
}

export function getConsolidationCheck(id: string) {
  return request<ConsolidationCheck>(`/chapters/${id}/consolidation-check`);
}

export function getDuplicateReport(bookProjectId: string, threshold = 0.9) {
  return request<DuplicateReport>(`/book-projects/${bookProjectId}/duplicate-report`, {
    searchParams: { threshold },
  });
}

// ---------- Sugestões automáticas de capítulo (ADR-019) ----------

export function listChapterSuggestions() {
  return request<ChapterSuggestionSummary[]>("/chapter-suggestions");
}

export function getChapterSuggestion(id: string) {
  return request<ChapterSuggestionDetail>(`/chapter-suggestions/${id}`);
}

export function promoteChapterSuggestion(
  id: string,
  input: { book_project_id: string; chapter_order?: number; title?: string }
) {
  return request<ChapterDetail>(`/chapter-suggestions/${id}/promote`, {
    method: "POST",
    body: input,
  });
}

export function dismissChapterSuggestion(id: string) {
  return request<ChapterSuggestionSummary>(`/chapter-suggestions/${id}/dismiss`, { method: "POST" });
}
