import { llm } from "@livekit/agents";
import { z } from "zod";

// Keep your existing forwarding function exactly as is
export async function forwardCalendarProposal(
  backendUrl: string,
  meetingId: string,
  agentId: string,
  payload: any
) {
  try {
    const response = await fetch(`${backendUrl}/api/agent-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId,
        agentId,
        type: "create_calendar_event",
        payload,
      }),
    });

    if (!response.ok) {
      console.error("❌ Failed to forward calendar proposal");
      return false;
    } else {
      console.log("📅 Calendar proposal forwarded");
      return true;
    }
  } catch (err) {
    console.error("💥 Backend forwarding error:", err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────
// Wrap it in a factory function so we can pass in the active
// meeting context from the LiveKit room session
// ─────────────────────────────────────────────────────────
export function buildCalendarTool(backendUrl: string, meetingId: string, agentId: string) {
  return llm.tool({
    // ❌ REMOVED: name property (LiveKit infers it from the agent.ts tools mapping)
    description: "Create a calendar event when participants finalize a meeting date or deadline.",
    parameters: z.object({
      title: z.string().describe("Short event title"),
      // ✅ CHANGED: Removed .optional() and updated instructions for the AI
      description: z.string().describe("Event description. Pass an empty string if none."),
      startISO: z.string().describe("Event start time in ISO 8601 format"),
      endISO: z.string().describe("Event end time in ISO 8601 format"),
      // ✅ CHANGED: Removed .optional() and updated instructions for the AI
      attendees: z.array(z.string()).describe("List of attendee email addresses. Pass an empty array if none."),
    }),
    execute: async (payload) => {
      console.log(`🤖 AI triggered calendar event creation: ${payload.title}`);
      
      const success = await forwardCalendarProposal(backendUrl, meetingId, agentId, payload);
      
      // We must return a string back to Gemini so it knows the result of its action
      if (success) {
        return `Successfully forwarded calendar proposal for "${payload.title}" to the system. You can let the user know it's done.`;
      } else {
        return `Failed to forward calendar proposal due to a system error. Let the user know you couldn't complete the action.`;
      }
    }
  });
}