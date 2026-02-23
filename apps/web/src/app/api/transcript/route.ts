import { db } from "@/db";
import { meetingParticipants, meetings } from "@/db/schema";
import { auth } from "@/lib/auth";
import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * REST endpoint for transcript flush via sendBeacon.
 * sendBeacon sends a POST with a Blob body — it cannot use tRPC.
 * This endpoint verifies the session cookie and appends lines in bulk.
 */

const bodySchema = z.object({
  meetingId: z.string(),
  lines: z.array(
    z.object({
      role: z.enum(["human", "assistant"]),
      speaker: z.string(),
      text: z.string(),
      timestamp: z.number(),
    })
  ),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Verify session using cookie (sendBeacon sends cookies automatically)
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { meetingId, lines } = parsed.data;
    if (lines.length === 0) {
      return NextResponse.json({ success: true });
    }

    // 3. Verify user is a participant
    const [participant] = await db
      .select()
      .from(meetingParticipants)
      .where(
        and(
          eq(meetingParticipants.meetingId, meetingId),
          eq(meetingParticipants.userId, session.user.id)
        )
      );

    if (!participant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4. Bulk append transcript lines
    await db
      .update(meetings)
      .set({
        transcript: sql`COALESCE(${meetings.transcript}, '[]'::jsonb) || ${JSON.stringify(lines)}::jsonb`,
      })
      .where(eq(meetings.id, meetingId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Transcript flush error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
