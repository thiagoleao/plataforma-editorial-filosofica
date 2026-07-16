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
        <Link href="/" className="glass-link text-sm text-gray-500 dark:text-gray-400">
          ← Projetos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{project.title}</h1>
        {project.description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{project.description}</p>
        )}
      </div>

      {project.chapters.length === 0 ? (
        <p className="glass-card p-6 text-sm text-gray-500 dark:text-gray-400">
          Nenhum capítulo ainda. Crie o primeiro abaixo.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {project.chapters
            .slice()
            .sort((a, b) => a.chapter_order - b.chapter_order)
            .map((chapter) => (
              <li key={chapter.id}>
                <Link
                  href={`/projects/${projectId}/chapters/${chapter.id}`}
                  className="glass-card glass-card-hover flex items-center justify-between gap-4 p-4"
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

      {project.chapters.length > 1 && (
        <Link
          href={`/projects/${projectId}/duplicate-report`}
          className="glass-link self-start text-sm text-gray-500 dark:text-gray-400"
        >
          Ver relatório de duplicidade entre capítulos →
        </Link>
      )}

      <form action={createChapterWithProject} className="glass-card flex flex-col gap-3 p-5">
        <h2 className="font-medium">Criar novo capítulo</h2>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="title" className="text-sm font-medium">
              Título<span className="text-red-500"> *</span>
            </label>
            <input id="title" name="title" required className="glass-input" />
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
              className="glass-input"
            />
          </div>
        </div>
        <ConceptPicker concepts={concepts} />
        <button type="submit" className="glass-pill glass-pill-primary self-start">
          Criar capítulo
        </button>
      </form>
    </div>
  );
}
