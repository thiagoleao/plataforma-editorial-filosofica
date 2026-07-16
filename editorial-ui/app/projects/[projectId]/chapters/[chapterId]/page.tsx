import Link from "next/link";
import { notFound } from "next/navigation";
import { EditorialApiError, getChapter, listConcepts } from "@/lib/editorial-api";
import ChapterBuilder from "@/components/ChapterBuilder";

export const dynamic = "force-dynamic";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;

  let chapter;
  try {
    chapter = await getChapter(chapterId);
  } catch (error) {
    if (error instanceof EditorialApiError && error.status === 404) notFound();
    throw error;
  }
  const concepts = await listConcepts(300);

  const sourcesKey = chapter.sources.map((s) => s.id).join("|") || "empty";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/projects/${projectId}`} className="text-sm text-gray-500 hover:underline">
          ← {chapter.book_project_title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">
            #{chapter.chapter_order} {chapter.title}
          </h1>
          <Link
            href={`/projects/${projectId}/chapters/${chapterId}/manuscript`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Ver manuscrito
          </Link>
        </div>
      </div>
      <ChapterBuilder key={sourcesKey} chapter={chapter} concepts={concepts} />
    </div>
  );
}
