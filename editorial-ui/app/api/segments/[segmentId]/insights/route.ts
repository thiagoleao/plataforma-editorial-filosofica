import { NextResponse } from "next/server";
import { listSegmentInsights, EditorialApiError } from "@/lib/editorial-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ segmentId: string }> }
) {
  const { segmentId } = await params;
  try {
    const insights = await listSegmentInsights(segmentId);
    return NextResponse.json(insights);
  } catch (error) {
    if (error instanceof EditorialApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
  }
}
