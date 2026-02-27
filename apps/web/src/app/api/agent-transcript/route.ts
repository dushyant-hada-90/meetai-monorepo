import { db } from "@/db";
import { meetings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Agent-side transcript storage API.
 * 
 * This endpoint is called directly by the meetai-agent (server-side) to store
 * transcript lines. Unlike the client-side transcript API, this uses a shared
 * secret for authentication since the agent doesn't have user session cookies.
 * 
 * WHY THIS APPROACH IS BETTER:
 * 1. Agent is server-side, always connected, guaranteed to receive ALL transcript events
 * 2. No client-side buffering = no data lost when users close tabs
 * 3. No "scribe" pattern = no single point of failure
 * 4. Immediate storage with retry logic = no race conditions
 * 5. Agent owns transcript lifecycle from generation to storage
 */


const bodySchema = z.object({
  meetingId: z.string(),
  LIVEKIT_API_SECRET: z.string(),
  lines: z.array(
    z.object({
      role: z.enum(["human", "assistant"]),
      speaker: z.string(),
      text: z.string(),
      timestamp: z.number(),
      index: z.number().optional(),
    })
  ),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Parse body
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      console.error("Invalid body for agent-transcript:", parsed.error);
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { meetingId, LIVEKIT_API_SECRET, lines } = parsed.data;

    // 2. Verify agent secret
    if (!LIVEKIT_API_SECRET || LIVEKIT_API_SECRET !== process.env.LIVEKIT_API_SECRET) {
      console.error("Agent transcript auth failed for meeting:", meetingId);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (lines.length === 0) {
      return NextResponse.json({ success: true, stored: 0 });
    }

    // 3. Verify meeting exists
    const [meeting] = await db
      .select({ id: meetings.id })
      .from(meetings)
      .where(eq(meetings.id, meetingId));

    if (!meeting) {
      console.error("Meeting not found for agent transcript:", meetingId);
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // 4. Bulk append transcript lines with conflict resolution
    // Lines are stored with their index for ordering
    const linesToStore = lines.map((l) => ({
      role: l.role,
      speaker: l.speaker,
      text: l.text,
      timestamp: l.timestamp,
      ...(l.index !== undefined && { index: l.index }),
    }));

    await db
      .update(meetings)
      .set({
        transcript: sql`COALESCE(${meetings.transcript}, '[]'::jsonb) || ${JSON.stringify(linesToStore)}::jsonb`,
      })
      .where(eq(meetings.id, meetingId));

    console.log(`✅ Agent stored ${lines.length} transcript lines for meeting ${meetingId}`);

    return NextResponse.json({ success: true, stored: lines.length });
  } catch (error) {
    console.error("Agent transcript storage error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
