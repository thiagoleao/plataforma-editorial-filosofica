import { NextRequest, NextResponse } from "next/server";
import { searchArchive, EditorialApiError } from "@/lib/editorial-api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = String(body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ error: "query é obrigatório" }, { status: 400 });
    }
    const results = await searchArchive(query, { limit: body.limit ?? 12, include: body.include });
    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof EditorialApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}
