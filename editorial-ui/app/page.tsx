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

      <div className="rounded-lg border border-gray-200 dark:border-gray-800">
        {projects.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Nenhum projeto ainda. Crie o primeiro abaixo.</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-100 dark:hover:bg-gray-900"
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
      </div>

      <form
        action={createBookProjectAction}
        className="flex flex-col gap-3 rounded-lg border border-gray-200 p-5 dark:border-gray-800"
      >
        <h2 className="font-medium">Criar novo projeto</h2>
        <div className="flex flex-col gap-1">
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
        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm font-medium">
            Descrição
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <button
          type="submit"
          className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Criar projeto
        </button>
      </form>
    </div>
  );
}
