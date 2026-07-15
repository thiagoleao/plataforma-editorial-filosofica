import { NextRequest, NextResponse } from "next/server";
import { listKnowledgeCards, EditorialApiError } from "@/lib/editorial-api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const cards = await listKnowledgeCards({
      theme: params.get("theme") ?? undefined,
      concept: params.get("concept") ?? undefined,
      limit: params.has("limit") ? Number(params.get("limit")) : 30,
    });
    return NextResponse.json(cards);
  } catch (error) {
    if (error instanceof EditorialApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}
