import { NextRequest, NextResponse } from "next/server";
import { createCampaign } from "@/lib/meta";

export async function POST(req: NextRequest) {
  const { name, objective } = (await req.json()) as {
    name: string;
    objective: string;
  };

  if (!name?.trim() || !objective) {
    return NextResponse.json(
      { error: "name and objective are required" },
      { status: 400 }
    );
  }

  try {
    const result = await createCampaign({
      name: name.trim(),
      objective,
      status: "PAUSED",
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create campaign" },
      { status: 500 }
    );
  }
}
