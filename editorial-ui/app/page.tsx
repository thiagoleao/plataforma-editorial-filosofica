import Link from "next/link";
import { listBookProjects } from "@/lib/editorial-api";
import { createBookProjectAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await listBookProjects();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Projetos de livro</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Consulte o acervo e escolha manualmente o que entra em cada capítulo — nada aqui é
          gerado automaticamente sem sua aprovação.
        </p>
      </div>

      {projects.length === 0 ? (
        <p className="glass-card p-6 text-sm text-gray-500 dark:text-gray-400">
          Nenhum projeto ainda. Crie o primeiro abaixo.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="glass-card glass-card-hover flex items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="font-medium">{project.title}</p>
                  {project.description && (
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                      {project.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
                  {project.chapter_count ?? 0} capítulo(s)
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form action={createBookProjectAction} className="glass-card flex flex-col gap-3 p-5">
        <h2 className="font-medium">Criar novo projeto</h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="text-sm font-medium">
            Título<span className="text-red-500"> *</span>
          </label>
          <input id="title" name="title" required className="glass-input" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm font-medium">
            Descrição
          </label>
          <textarea id="description" name="description" rows={2} className="glass-input" />
        </div>
        <button type="submit" className="glass-pill glass-pill-primary self-start">
          Criar projeto
        </button>
      </form>
    </div>
  );
}
