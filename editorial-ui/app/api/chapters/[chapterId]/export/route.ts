import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await params;
  const apiUrl = process.env.EDITORIAL_API_URL;
  const apiKey = process.env.EDITORIAL_API_KEY;
  if (!apiUrl || !apiKey) {
    return NextResponse.json({ error: "Missing EDITORIAL_API_URL/EDITORIAL_API_KEY" }, { status: 500 });
  }

  const upstream = await fetch(new URL(`/chapters/${chapterId}/export.docx`, apiUrl), {
    headers: { "X-Service-Api-Key": apiKey },
    cache: "no-store",
  });

  if (!upstream.ok) {
    const body = await upstream.text();
    return NextResponse.json(
      { error: body || `Editorial API error (${upstream.status})` },
      { status: upstream.status }
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ??
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": upstream.headers.get("content-disposition") ?? "attachment",
    },
  });
}
