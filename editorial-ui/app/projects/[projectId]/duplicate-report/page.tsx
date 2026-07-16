import Link from "next/link";
import { getBookProject, getDuplicateReport } from "@/lib/editorial-api";

export const dynamic = "force-dynamic";

export default async function DuplicateReportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, report] = await Promise.all([
    getBookProject(projectId),
    getDuplicateReport(projectId),
  ]);

  const chapterTitleById = new Map(project.chapters.map((c) => [c.id, c.title]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/projects/${projectId}`} className="glass-link text-sm text-gray-500 dark:text-gray-400">
          ← {project.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Relatório de duplicidade</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Só sinaliza sobreposição de conteúdo entre capítulos — nada é removido ou realocado
          automaticamente. Limiar de similaridade: {report.threshold}.
        </p>
      </div>

      {report.conflicts.length === 0 ? (
        <p className="glass-card p-6 text-sm text-gray-500 dark:text-gray-400">
          Nenhuma sobreposição encontrada entre os capítulos deste projeto.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {report.conflicts.map((conflict, i) => (
            <li key={i} className="glass-alert-warning text-sm">
              <p className="font-medium">
                Similaridade {(conflict.similarity * 100).toFixed(1)}%
              </p>
              <p className="mt-1">
                <span className="font-medium">
                  {chapterTitleById.get(conflict.chapter_a_id) ?? conflict.chapter_a_id}
                </span>
                : {conflict.title_a}
              </p>
              <p>
                <span className="font-medium">
                  {chapterTitleById.get(conflict.chapter_b_id) ?? conflict.chapter_b_id}
                </span>
                : {conflict.title_b}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
