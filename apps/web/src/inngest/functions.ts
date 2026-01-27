import { db } from "@/db";
import { inngest } from "./client";
import { meetings, user as userTable, type TranscriptItem } from "@/db/schema";
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
    Provide a detailed, engaging summary of the session's content. Focus on major features, user workflows, and any key takeaways. Write in a narrative style, using full sentences. Highlight unique or powerful aspects of the discussion.

    ### Notes
    Break down key content into thematic sections with timestamp ranges (e.g., 05:00 - 10:00). Each section should summarize key points, actions, or demos in bullet format.

    Example:
    #### Section Name (00:00 - 05:30)
    - Main point or demo shown here
    - Another key insight or interaction
    - Follow-up tool or explanation provided
  `.trim(),
  model: gemini({ 
    model: "gemini-2.5-flash", // Using 1.5-flash for speed/cost-efficiency
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
  { id: "meetings/processing" },
  { event: "meetings/processing" },
  async ({ event, step }) => {
    const { meetingId } = event.data;

    // --- STEP 1: Fetch Meeting Data ---
    const meeting = await step.run("fetch-meeting", async () => {
      const [row] = await db
        .select()
        .from(meetings)
        .where(eq(meetings.id, meetingId));
      return row;
    });

    if (!meeting) throw new Error(`Meeting ${meetingId} not found`);

    // --- STEP 2: Resolve Speaker Names & Format Transcript ---
    const formattedTranscript = await step.run("format-transcript", async () => {
      const rawTranscript = meeting.transcript as TranscriptItem[];
      if (!rawTranscript || rawTranscript.length === 0) return "";

      // 1. Extract unique User IDs (excluding 'assistant')
      const userIds = Array.from(
        new Set(
          rawTranscript
            .map((t) => t.role)
            .filter((role) => role !== "assistant")
        )
      ) as string[];

      // 2. Map User IDs to Names
      const userMap = new Map<string, string>();
      if (userIds.length > 0) {
        const users = await db
          .select({ id: userTable.id, name: userTable.name })
          .from(userTable)
          .where(inArray(userTable.id, userIds));
        users.forEach((u) => userMap.set(u.id, u.name));
      }

      // 3. Determine start time for relative timestamps
      const startRef = meeting.startedAt 
        ? new Date(meeting.startedAt).getTime() 
        : new Date(rawTranscript[0].time).getTime();

      // 4. Transform into readable string
      return rawTranscript.map((item) => {
        const msgTime = new Date(item.time).getTime();
        const relativeMs = Math.max(0, msgTime - startRef);
        const timestamp = formatRelativeTime(relativeMs);
        
        const speakerName = item.role === "assistant" 
          ? "AI Assistant" 
          : (userMap.get(item.role) || "User");

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
      // Extract the content from the last message in the output
      const lastMessage = output[output.length - 1] as TextMessage;
      const aiResponse = lastMessage.content;
    

    // --- STEP 4: Save Summary to DB ---
    await step.run("save-summary", async () => {
      await db
        .update(meetings)
        .set({
          summary: aiResponse as string,
          status: "completed",
          endedAt: new Date(),
        })
        .where(eq(meetings.id, meetingId));
    });

    return { success: true };
  }
);