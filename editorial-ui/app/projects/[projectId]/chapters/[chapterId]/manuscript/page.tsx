import Link from "next/link";
import { notFound } from "next/navigation";
import { EditorialApiError, getChapter, getChapterManuscript } from "@/lib/editorial-api";
import ManuscriptEditor from "@/components/ManuscriptEditor";

export const dynamic = "force-dynamic";

export default async function ChapterManuscriptPage({
  params,
}: {
  params: Promise<{ projectId: string; chapterId: string }>;
}) {
  const { projectId, chapterId } = await params;

  let chapter;
  let manuscript;
  try {
    chapter = await getChapter(chapterId);
    manuscript = await getChapterManuscript(chapterId);
  } catch (error) {
    if (error instanceof EditorialApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href={`/projects/${projectId}/chapters/${chapterId}`}
          className="text-sm text-gray-500 hover:underline"
        >
          ← #{chapter.chapter_order} {chapter.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Manuscrito — {chapter.title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Blocos de canalização (🔒) são preservados literalmente — não podem ser editados nem
          removidos aqui. O resto do texto pode ser polido livremente.
        </p>
      </div>
      <ManuscriptEditor
        chapterId={chapterId}
        bookProjectId={projectId}
        initialContent={manuscript.manuscript_content}
        initialUpdatedAt={manuscript.manuscript_updated_at}
      />
    </div>
  );
}
