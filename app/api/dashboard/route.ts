import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPostgresSnapshot } from "@/lib/postgres";
import { getRailwaySnapshot } from "@/lib/railway";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  hours: z.coerce.number().int().min(1).max(168).default(24),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    hours: request.nextUrl.searchParams.get("hours") || 24,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "The selected time range is not supported." },
      { status: 400 },
    );
  }

  const [railway, postgres] = await Promise.allSettled([
    getRailwaySnapshot(parsed.data.hours),
    getPostgresSnapshot(),
  ]);

  const railwayError =
    railway.status === "rejected"
      ? railway.reason instanceof Error
        ? railway.reason.message
        : "Railway telemetry could not be loaded."
      : null;
  const postgresError =
    postgres.status === "rejected"
      ? postgres.reason instanceof Error
        ? postgres.reason.message
        : "PostgreSQL telemetry could not be loaded."
      : null;

  if (railwayError && postgresError) {
    return NextResponse.json(
      {
        error: "No telemetry source could be reached.",
        sourceErrors: { railway: railwayError, postgres: postgresError },
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      rangeHours: parsed.data.hours,
      railway: railway.status === "fulfilled" ? railway.value : null,
      postgres: postgres.status === "fulfilled" ? postgres.value : null,
      sourceErrors: {
        railway: railwayError,
        postgres: postgresError,
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
