import { NextResponse } from "next/server";
import { listConcepts, EditorialApiError } from "@/lib/editorial-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const concepts = await listConcepts(300);
    return NextResponse.json(concepts);
  } catch (error) {
    if (error instanceof EditorialApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}
