import Link from "next/link";
import { notFound } from "next/navigation";
import { EditorialApiError, getBookProject, listConcepts } from "@/lib/editorial-api";
import { createChapterAction } from "@/lib/actions";
import StatusBadge from "@/components/StatusBadge";
import ConceptPicker from "@/components/ConceptPicker";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  let project;
  try {
    [project] = await Promise.all([getBookProject(projectId)]);
  } catch (error) {
    if (error instanceof EditorialApiError && error.status === 404) notFound();
    throw error;
  }
  const concepts = await listConcepts(300);

  const nextOrder =
    project.chapters.length === 0
      ? 1
      : Math.max(...project.chapters.map((c) => c.chapter_order)) + 1;

  const createChapterWithProject = createChapterAction.bind(null, projectId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/" className="text-sm text-gray-500 hover:underline">
          ← Projetos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{project.title}</h1>
        {project.description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{project.description}</p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-800">
        {project.chapters.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Nenhum capítulo ainda. Crie o primeiro abaixo.</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {project.chapters
              .slice()
              .sort((a, b) => a.chapter_order - b.chapter_order)
              .map((chapter) => (
                <li key={chapter.id}>
                  <Link
                    href={`/projects/${projectId}/chapters/${chapter.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-100 dark:hover:bg-gray-900"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-400">#{chapter.chapter_order}</span>
                      <span className="font-medium">{chapter.title}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {chapter.source_count} fonte(s)
                      </span>
                      <StatusBadge status={chapter.status} />
                    </div>
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </div>

      {project.chapters.length > 1 && (
        <Link
          href={`/projects/${projectId}/duplicate-report`}
          className="self-start text-sm text-gray-500 hover:underline"
        >
          Ver relatório de duplicidade entre capítulos →
        </Link>
      )}

      <form
        action={createChapterWithProject}
        className="flex flex-col gap-3 rounded-lg border border-gray-200 p-5 dark:border-gray-800"
      >
        <h2 className="font-medium">Criar novo capítulo</h2>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="title" className="text-sm font-medium">
              Título<span className="text-red-500"> *</span>
            </label>
            <input
              id="title"
              name="title"
              required
              className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
          <div className="flex w-28 flex-col gap-1">
            <label htmlFor="chapter_order" className="text-sm font-medium">
              Ordem
            </label>
            <input
              id="chapter_order"
              name="chapter_order"
              type="number"
              defaultValue={nextOrder}
              min={1}
              required
              className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
        </div>
        <ConceptPicker concepts={concepts} />
        <button
          type="submit"
          className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Criar capítulo
        </button>
      </form>
    </div>
  );
}
