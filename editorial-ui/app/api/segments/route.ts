import { NextRequest, NextResponse } from "next/server";
import { listSegments, EditorialApiError } from "@/lib/editorial-api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const segments = await listSegments({
      theme: params.get("theme") ?? undefined,
      type: params.get("type") ?? undefined,
      channeled: params.has("channeled") ? params.get("channeled") === "true" : undefined,
      concept: params.get("concept") ?? undefined,
      limit: params.has("limit") ? Number(params.get("limit")) : 30,
    });
    return NextResponse.json(segments);
  } catch (error) {
    if (error instanceof EditorialApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}
