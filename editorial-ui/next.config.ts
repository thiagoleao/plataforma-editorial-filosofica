import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // Acesso real é sempre via `gcloud run services proxy --port=8081`
      // (8080 já é usado pelo proxy do arquitetura-planner neste mesmo projeto GCP),
      // que reescreve x-forwarded-host para o hostname do Cloud Run enquanto o
      // browser mantém Origin como localhost — sem isso, a proteção CSRF nativa
      // do Next.js para Server Actions rejeita toda requisição de mutação.
      // Ver nota de implementação da ADR-016. A tentativa da ADR-018 de eliminar
      // essa necessidade (acesso público) foi revertida — ver ADR-018.
      // 3100 é só para `npm run dev` local (Server Actions também passam pela mesma
      // checagem de Origin em dev) — não usado em produção.
      allowedOrigins: ["localhost:8081", "localhost:3100"],
    },
  },
};

export default nextConfig;
