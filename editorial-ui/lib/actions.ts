"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as api from "./editorial-api";
import type { ChapterSourceInput } from "./editorial-api";

type ActionResult = { ok: true } | { ok: false; error: string };

function errorMessage(error: unknown): string {
  if (error instanceof api.EditorialApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Erro inesperado";
}

export async function createBookProjectAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title) throw new Error("Título é obrigatório");
  const project = await api.createBookProject({ title, description: description || undefined });
  revalidatePath("/");
  redirect(`/projects/${project.id}`);
}

export async function createChapterAction(bookProjectId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const chapterOrder = Number(formData.get("chapter_order") ?? 1);
  const thematicScope = formData
    .getAll("thematic_scope")
    .map(String)
    .filter(Boolean);
  if (!title) throw new Error("Título é obrigatório");
  const chapter = await api.createChapter(bookProjectId, {
    title,
    chapter_order: chapterOrder,
    thematic_scope: thematicScope,
  });
  revalidatePath(`/projects/${bookProjectId}`);
  redirect(`/projects/${bookProjectId}/chapters/${chapter.id}`);
}

export async function saveChapterSourcesAction(
  chapterId: string,
  bookProjectId: string,
  sources: ChapterSourceInput[]
): Promise<ActionResult> {
  try {
    await api.setChapterSources(chapterId, sources);
    revalidatePath(`/projects/${bookProjectId}/chapters/${chapterId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function saveChapterManuscriptAction(
  chapterId: string,
  bookProjectId: string,
  manuscriptContent: api.ManuscriptDoc
): Promise<ActionResult> {
  try {
    await api.setChapterManuscript(chapterId, manuscriptContent);
    revalidatePath(`/projects/${bookProjectId}/chapters/${chapterId}/manuscript`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function checkpointChapterManuscriptAction(
  chapterId: string,
  label?: string
): Promise<ActionResult> {
  try {
    await api.checkpointChapterManuscript(chapterId, label);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function proposeChapterAction(
  chapterId: string,
  bookProjectId: string,
  limit: number
): Promise<ActionResult> {
  try {
    await api.proposeChapterSources(chapterId, { limit });
    revalidatePath(`/projects/${bookProjectId}/chapters/${chapterId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function approveChapterAction(
  chapterId: string,
  bookProjectId: string
): Promise<ActionResult> {
  try {
    await api.approveChapter(chapterId);
    revalidatePath(`/projects/${bookProjectId}/chapters/${chapterId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function reviewChapterAction(
  chapterId: string,
  bookProjectId: string,
  reviewedBy: string
): Promise<ActionResult> {
  try {
    await api.reviewChapter(chapterId, reviewedBy);
    revalidatePath(`/projects/${bookProjectId}/chapters/${chapterId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function runConsolidationCheckAction(
  chapterId: string
): Promise<{ ok: true; data: api.ConsolidationCheck } | { ok: false; error: string }> {
  try {
    const data = await api.getConsolidationCheck(chapterId);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function promoteChapterSuggestionAction(suggestionId: string, formData: FormData) {
  // redirect() lança um erro interno do Next.js (NEXT_REDIRECT) — nunca envolver em
  // try/catch, senão ele é engolido e tratado como falha real (ver createChapterAction).
  const bookProjectId = String(formData.get("book_project_id") ?? "").trim();
  if (!bookProjectId) throw new Error("Selecione um projeto");
  const chapterOrderRaw = String(formData.get("chapter_order") ?? "").trim();

  const chapter = await api.promoteChapterSuggestion(suggestionId, {
    book_project_id: bookProjectId,
    chapter_order: chapterOrderRaw ? Number(chapterOrderRaw) : undefined,
  });
  revalidatePath("/chapter-suggestions");
  revalidatePath(`/projects/${bookProjectId}`);
  redirect(`/projects/${bookProjectId}/chapters/${chapter.id}`);
}

export async function dismissChapterSuggestionAction(suggestionId: string) {
  await api.dismissChapterSuggestion(suggestionId);
  revalidatePath("/chapter-suggestions");
  redirect("/chapter-suggestions");
}

export async function generateSegmentInsightsAction(
  segmentId: string
): Promise<{ ok: true; data: api.SegmentInsight[] } | { ok: false; error: string }> {
  try {
    const data = await api.generateSegmentInsights(segmentId);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function reviewSegmentInsightAction(
  insightId: string
): Promise<{ ok: true; data: api.SegmentInsight } | { ok: false; error: string }> {
  try {
    const data = await api.reviewSegmentInsight(insightId);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function dismissSegmentInsightAction(
  insightId: string
): Promise<{ ok: true; data: api.SegmentInsight } | { ok: false; error: string }> {
  try {
    const data = await api.dismissSegmentInsight(insightId);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function generateSegmentInsightsBatchAction(): Promise<
  { ok: true; data: api.BatchInsightResult } | { ok: false; error: string }
> {
  try {
    const data = await api.generateSegmentInsightsBatch(5);
    revalidatePath("/acervo");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
