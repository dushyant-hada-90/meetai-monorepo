import { db } from "@/db";
import { inngest } from "./client";
import { meetings, user as userTable, agents, type TranscriptItem } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createAgent, gemini, type TextMessage } from "@inngest/agent-kit";

// 1. Setup the AI Agent
const summarizer = createAgent({
  name: "summarizer",
  system: `
    You are an expert summarizer. You write readable, concise, simple content. 
    You are given a transcript of a meeting (format: "[Time] Speaker: Text") and you need to summarize it.

    Use the following markdown structure for every output:

    ### Overview
    Provide a detailed, engaging summary of the session's content. Focus on major features, user workflows, and any key takeaways.

    ### Notes
    Break down key content into thematic sections with timestamp ranges (e.g., 05:00 - 10:00).
  `.trim(),
  model: gemini({
    model: "gemini-2.5-flash",
    apiKey: process.env.GOOGLE_API_KEY
  })
});

// Helper to format timestamps into readable MM:SS
function formatRelativeTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export const meetingsProcessing = inngest.createFunction(
  { id: "livekit/room_finished" },
  { event: "livekit/room_finished" },
  async ({ event, step }) => {
    const { meetingId, startedAt, endedAt } = event.data;

    // --- STEP 1: update Meeting Data and then return the same ---
    const meeting = await step.run("mark-processing", async () => {
      const [meeting] = await db.update(meetings)
        .set({
          status: "processing",
          startedAt: startedAt ? new Date(startedAt) : undefined,
          endedAt: endedAt ? new Date(endedAt) : undefined,
        })
        .where(eq(meetings.id, meetingId))
        .returning();

      // Ensure transcript is sorted by time before processing
      meeting.transcript.sort((a, b) => a.timestamp - b.timestamp);
      return meeting;
    });

    // --- STEP 2: Resolve Speaker Names & Format Transcript ---
    const formattedTranscript = await step.run("format-transcript", async () => {
      const rawTranscript = meeting.transcript as TranscriptItem[];
      if (!rawTranscript || rawTranscript.length === 0) return "";

      // ---------------------------------------------------------
      // NEW LOGIC: Smart Merge of Consecutive Fragments
      // ---------------------------------------------------------
      // This combines fragmented lines like:
      // [10:01] User: "I want to..."
      // [10:02] User: "know about APIs."
      // INTO:
      // [10:01] User: "I want to... know about APIs."
      // ---------------------------------------------------------
      const mergedTranscript: TranscriptItem[] = [];

      for (const item of rawTranscript) {
        const lastItem = mergedTranscript[mergedTranscript.length - 1];

        // If same speaker & role, merge the text
        if (lastItem && lastItem.speaker === item.speaker && lastItem.role === item.role) {
          lastItem.text += " " + item.text;
        } else {
          // New turn, push a copy to avoid mutating raw data
          mergedTranscript.push({ ...item });
        }
      }

      // 1. Collect unique IDs for Users and Agents
      const speakerIds = Array.from(new Set(mergedTranscript.map((t) => t.speaker)));

      // 2. Fetch User and Agent names in parallel
      const [users, agentRows] = await Promise.all([
        db.select({ id: userTable.id, name: userTable.name })
          .from(userTable)
          .where(inArray(userTable.id, speakerIds.filter(id => id !== "unknownUser"))),
        db.select({ id: agents.id, name: agents.name })
          .from(agents)
          .where(inArray(agents.id, speakerIds))
      ]);

      const nameMap = new Map<string, string>();
      users.forEach((u) => nameMap.set(u.id, u.name ?? "Unknown User"));
      agentRows.forEach((a) => nameMap.set(a.id, a.name ?? "Assistant"));

      // 3. Determine start time for relative timestamps
      const startRef = mergedTranscript[0].timestamp;

      // 4. Transform into readable string using the MERGED transcript
      return mergedTranscript.map((item) => {
        const relativeMs = Math.max(0, item.timestamp - startRef);
        const timestamp = formatRelativeTime(relativeMs);

        // Resolve name based on role and speaker ID
        let speakerName = "Unknown User";
        if (item.role === "assistant") {
          speakerName = nameMap.get(item.speaker) ?? "Assistant";
        } else {
          speakerName = nameMap.get(item.speaker) ?? "User";
        }

        return `[${timestamp}] ${speakerName}: ${item.text}`;
      }).join("\n");
    });

    if (!formattedTranscript) {
      return { success: false, message: "No transcript content" };
    }

    // --- STEP 3: Run AI Summarization ---
    const { output } = await summarizer.run(
      `Please summarize the following transcript:\n\n${formattedTranscript}`
    );
    const lastMessage = output[output.length - 1] as TextMessage;
    const aiResponse = lastMessage.content;

    // --- STEP 4: Save Summary to DB ---
    await step.run("save-summary", async () => {
      await db
        .update(meetings)
        .set({
          summary: aiResponse as string,
          // We save the ORIGINAL transcript to DB for accuracy/playback sync,
          // even though we used the merged one for AI generation.
          transcript: meeting.transcript, 
          status: "completed",
        })
        .where(eq(meetings.id, meetingId)).returning();
    });

    return { success: true };
  }
);