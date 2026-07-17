const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  assembled: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  reviewed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  final: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  suggested: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  dismissed: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  promoted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  pilar: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  forte: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  apoio: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  emergente: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  assembled: "Montado",
  reviewed: "Revisado",
  final: "Final",
  suggested: "Sugerido",
  dismissed: "Descartado",
  promoted: "Promovido",
  pilar: "Pilar",
  forte: "Forte",
  apoio: "Apoio",
  emergente: "Emergente",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium backdrop-blur-md ${
        STATUS_STYLES[status] ?? "bg-gray-200 text-gray-700"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
