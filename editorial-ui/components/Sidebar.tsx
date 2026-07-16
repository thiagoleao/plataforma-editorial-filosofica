import Image from "next/image";
import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Projetos", icon: BookOpen },
  { href: "/chapter-suggestions", label: "Sugestões", icon: Sparkles },
];

const NAV_ITEM_CLASS =
  "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-all duration-150 hover:scale-[1.03] hover:bg-white/80 hover:text-gray-900 hover:shadow-[0_2px_8px_rgba(15,23,42,0.12)] dark:text-gray-300 dark:hover:bg-white/20 dark:hover:text-white dark:hover:shadow-[0_2px_10px_rgba(0,0,0,0.5)]";

export default function Sidebar() {
  return (
    <aside className="glass-bar sticky top-0 flex h-screen w-56 shrink-0 flex-col items-center gap-6 border-r border-t-0 px-4 py-6">
      <Link href="/" className="flex flex-col items-center gap-2 text-center">
        <Image
          src="/images/icon.png"
          alt=""
          width={56}
          height={56}
          className="h-14 w-14"
          priority
        />
        <span className="text-sm leading-tight font-semibold text-indigo-950 dark:text-indigo-100">
          Plataforma Editorial Filosófica
        </span>
      </Link>
      <nav className="flex w-full flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={NAV_ITEM_CLASS}>
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
