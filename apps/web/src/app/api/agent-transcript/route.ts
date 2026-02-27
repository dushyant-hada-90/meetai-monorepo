import { db } from "@/db";
import { meetings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  meetingId: z.string(),
  INTERNAL_HANDSHAKE_SECRET: z.string(),
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
      console.error("❌ Invalid body for agent-transcript:", parsed.error.format());
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { meetingId, INTERNAL_HANDSHAKE_SECRET: incomingSecret, lines } = parsed.data;
    const serverSecret = process.env.INTERNAL_HANDSHAKE_SECRET;

    // 2. Enhanced Debug Logs
    console.log("--- Agent Auth Debug ---");
    console.log(`Meeting ID: ${meetingId}`);
    console.log(`Server Secret Defined: ${!!serverSecret}`);
    
    if (serverSecret && incomingSecret) {
      const isMatch = incomingSecret === serverSecret;
      console.log(`Secrets Match: ${isMatch}`);
      
      if (!isMatch) {
        // Log lengths and first/last chars to spot hidden whitespace or truncation
        console.log(`Incoming Length: ${incomingSecret.length}, Start: ${incomingSecret.substring(0, 3)}..., End: ...${incomingSecret.slice(-3)}`);
        console.log(`Server Length: ${serverSecret.length}, Start: ${serverSecret.substring(0, 3)}..., End: ...${serverSecret.slice(-3)}`);
      }
    }
    console.log("------------------------");

    // 3. Verify agent secret
    if (!serverSecret || incomingSecret !== serverSecret) {
      console.error(`🚨 Agent transcript auth failed for meeting: ${meetingId}`);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (lines.length === 0) {
      return NextResponse.json({ success: true, stored: 0 });
    }

    // 4. Verify meeting exists
    const [meeting] = await db
      .select({ id: meetings.id })
      .from(meetings)
      .where(eq(meetings.id, meetingId));

    if (!meeting) {
      console.error("Meeting not found for agent transcript:", meetingId);
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // 5. Bulk append transcript lines
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