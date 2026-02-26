import { llm, getJobContext, voice } from "@livekit/agents";
import { z } from "zod";

// ─────────────────────────────────────────────────────────
// RPC-based Tool Calling Architecture
// Instead of HTTP POST to backend, we use LiveKit RPC to
// stream tool call data directly to the client for human approval.
// 
// KEY FEATURES:
// - AI specifies WHO should receive the approval popup
// - Supports batch mode: multiple targets with different payloads
// - Returns detailed response including who approved/rejected
// ─────────────────────────────────────────────────────────

interface CalendarEventPayload {
  title: string;
  description: string;
  startISO: string;
  endISO: string;
  attendees: string[];
}

interface TargetedCalendarEvent {
  // Who should receive this approval request
  // Can be participant name OR identity (user ID)
  targetParticipant: string;
  // The event details for this specific target
  payload: CalendarEventPayload;
}

interface ApprovalResponse {
  approved: boolean;
  modifiedPayload?: CalendarEventPayload;
  reason?: string;
}

interface TargetedApprovalResult {
  targetParticipant: string;
  targetIdentity: string;
  targetName: string;
  approved: boolean;
  modifiedPayload?: CalendarEventPayload;
  reason?: string;
}

// ─────────────────────────────────────────────────────────
// Module-scope concurrency primitives
//
// pendingApprovals — deduplicates identical in-flight RPC calls (same
//   participant + event) that can arise when a speech interruption
//   fires a second model generation while the first is awaiting response.
//
// approvalLockTail — tail of a chained-promise sequential queue.
//   Each execute() appends itself to the tail so dialogs are shown
//   one at a time without ever failing or blocking the LLM.
//   The LLM always gets a real approved/rejected result, never an error.
// ─────────────────────────────────────────────────────────
const pendingApprovals = new Map<string, Promise<TargetedApprovalResult>>();
let approvalLockTail: Promise<void> = Promise.resolve();

/**
 * Find a participant by name or identity.
 * Priority: exact identity → exact name → case-insensitive exact → single partial match.
 * Ambiguous partial matches deliberately return undefined (fail-safe).
 * Searches through remote participants matching by name (case-insensitive) or identity.
 */
function findParticipant(targetParticipant: string) {
  const jobContext = getJobContext();
  const room = jobContext.room;
  const remoteParticipants = Array.from(room.remoteParticipants.values());

  // Exclude agent participants
  const humanParticipants = remoteParticipants.filter(
    (p) => !p.identity.startsWith("agent-")
  );

  // Tier 1: exact identity
  const byIdentity = humanParticipants.find(
    (p) => p.identity === targetParticipant
  );
  if (byIdentity) return byIdentity;

  // Tier 2: exact name (case-sensitive)
  const byExactName = humanParticipants.find(
    (p) => (p.name || "") === targetParticipant
  );
  if (byExactName) return byExactName;

  // Tier 3: case-insensitive exact match
  const targetLower = targetParticipant.toLowerCase();
  const byCaseInsensitive = humanParticipants.find(
    (p) => (p.name || "").toLowerCase() === targetLower ||
           p.identity.toLowerCase() === targetLower
  );
  if (byCaseInsensitive) return byCaseInsensitive;

  // Tier 4: partial substring match — ONLY if exactly one candidate matches.
  // If multiple names contain the substring, return undefined (ambiguous = fail-safe).
  const partialMatches = humanParticipants.filter(
    (p) => (p.name || "").toLowerCase().includes(targetLower) ||
           p.identity.toLowerCase().includes(targetLower)
  );
  if (partialMatches.length === 1) return partialMatches[0];

  if (partialMatches.length > 1) {
    console.warn(
      `⚠️ findParticipant: "${targetParticipant}" is ambiguous — matched [${partialMatches.map(p => p.name || p.identity).join(", ")}]. Returning undefined.`
    );
  }

  return undefined;
}

/**
 * Request human approval for a calendar event via LiveKit RPC.
 * The client UI will show a popup and the user can approve/reject.
 */
async function requestCalendarApproval(
  meetingId: string,
  agentId: string,
  targetParticipant: string,
  payload: CalendarEventPayload
): Promise<TargetedApprovalResult> {
  const jobContext = getJobContext();
  const room = jobContext.room;
  const participant = findParticipant(targetParticipant);

  if (!participant) {
    console.warn(`⚠️ Target participant "${targetParticipant}" not found in room`);
    return {
      targetParticipant,
      targetIdentity: "unknown",
      targetName: targetParticipant,
      approved: false,
      reason: `Participant "${targetParticipant}" not found in the meeting`,
    };
  }

  const targetIdentity = participant.identity;
  const targetName = participant.name || participant.identity;

  // Fix 3: guard against calling RPC before the local participant's identity
  // has been assigned by the LiveKit server (seen as empty string in logs).
  if (!room.localParticipant?.identity) {
    console.error("\u274c Local participant identity not ready — agent may not be fully connected.");
    return {
      targetParticipant,
      targetIdentity: "unknown",
      targetName: targetParticipant,
      approved: false,
      reason: "Agent not fully connected yet. Please try again in a moment.",
    };
  }

  // Total time the user has to respond.
  // MUST match responseTimeout below so the client countdown is in sync.
  const RESPONSE_TIMEOUT_MS = 60000;

  try {
    console.log(`📤 Requesting calendar approval from: ${targetName} (${targetIdentity})`);

    // invokedAt is stamped HERE — right before the RPC is sent — so the
    // client can compute exactly how many milliseconds remain even after
    // accounting for network transit time.
    const invokedAt = Date.now();

    // Call RPC on the frontend to request approval
    const response = await room.localParticipant!.performRpc({
      destinationIdentity: targetIdentity,
      method: "approveCalendarEvent",
      payload: JSON.stringify({
        meetingId,
        agentId,
        type: "create_calendar_event",
        targetParticipant: targetName,
        payload,
        invokedAt,          // epoch ms when the agent sent this request
        timeoutMs: RESPONSE_TIMEOUT_MS, // how long the agent will wait
      }),
      responseTimeout: RESPONSE_TIMEOUT_MS,
    });

    const result: ApprovalResponse = JSON.parse(response);
    console.log(`📥 Approval from ${targetName}: ${result.approved ? "APPROVED" : "REJECTED"}`);
    
    return {
      targetParticipant,
      targetIdentity,
      targetName,
      approved: result.approved,
      modifiedPayload: result.modifiedPayload,
      reason: result.reason,
    };

  } catch (err: any) {
    // Handle timeout or other errors
    if (err.message?.includes("timeout") || err.code === 1502) {
      console.warn(`⏰ Approval request to ${targetName} timed out`);
      return {
        targetParticipant,
        targetIdentity,
        targetName,
        approved: false,
        reason: "User did not respond in time",
      };
    }
    console.error(`💥 RPC approval error for ${targetName}:`, err);
    return {
      targetParticipant,
      targetIdentity,
      targetName,
      approved: false,
      reason: "Failed to reach user for approval",
    };
  }
}

/**
 * Get list of all human participants in the room (for AI reference)
 */
function getHumanParticipantsList(): string[] {
  const jobContext = getJobContext();
  const room = jobContext.room;
  const remoteParticipants = Array.from(room.remoteParticipants.values());
  
  return remoteParticipants
    .filter((p) => !p.identity.startsWith("agent-"))
    .map((p) => p.name || p.identity);
}

// ─────────────────────────────────────────────────────────
// Factory function to build the calendar tool with meeting context
// ─────────────────────────────────────────────────────────
export function buildCalendarTool(
  backendUrl: string,
  meetingId: string,
  agentId: string,
  session: voice.AgentSession,   // used to inject approval results back into the LLM turn
) {
  // Note: backendUrl is kept for potential future use (e.g., storing approved events)
  
  return llm.tool({
    description: `Schedule a calendar event on behalf of a participant and send it to them for approval via a UI dialog.

WHEN TO CALL:
- Call this tool IMMEDIATELY whenever a user asks to schedule, add, block, or create a calendar event.
- do not tell that you are calling or you have called a tool unless explicitly asked  , just silently call it 
- Do NOT ask the user for confirmation before calling — the approval dialog shown in the UI IS the confirmation step.
- Do NOT ask the user who the target participant is — infer it from context:
    * If the user says "add it for me" or "put it on my calendar", target the speaker.
    * If the user says "schedule this for John" or assigns a task to another participant, target that person.
    * If there is only one other human participant in the meeting, target them by default.
    * Use the current participant list provided in your system context.

MULTIPLE EVENTS / MULTIPLE PARTICIPANTS:
- Each invocation is FULLY INDEPENDENT. Results are scoped by callId.
- If the user requests N events, call this tool N times — once per event.
- Each call will automatically queue and wait for any open dialog to close before showing the next.
- Do NOT assume an event is handled because a prior call returned. Each must resolve independently.
- For multi-participant events, call this tool once per participant. Each will get their own dialog in sequence.

TOOL RESULT FIELDS:
- "status": "approved" or "rejected" — the participant's decision for THIS specific call.
- "target": which participant responded.
- "callId": unique ID for this invocation — use it to match requests to responses.
- "reason": present only on rejection.

AFTER THE TOOL RETURNS:
-  do not Acknowledge the result through voice, just keep context of it in yoour memory about tool called and which participant responded how.
- Do NOT repeat the event details verbatim.`,
    parameters: z.object({
      targetParticipant: z.string().describe("Name of the participant who should receive and approve this event. Must match a participant in the meeting."),
      title: z.string().describe("Short event title (e.g., 'Submit Report', 'Team Meeting')"),
      description: z.string().describe("Event description. Pass an empty string if none."),
      startISO: z.string().describe("Event start time in ISO 8601 format (e.g., '2026-03-04T11:30:00Z')"),
      endISO: z.string().describe("Event end time in ISO 8601 format"),
      attendees: z.string().describe("Comma-separated list of attendee emails, or empty string if none"),
    }),
    execute: async ({ targetParticipant, title, description, startISO, endISO, attendees }) => {
      // Unique ID per invocation — every tool-result in the LLM conversation
      // history is structurally distinct so the model cannot confuse outcomes.
      const callId = Math.random().toString(36).slice(2, 8).toUpperCase();

      const participants = getHumanParticipantsList();
      console.log(`🤖 [${callId}] AI requesting calendar event "${title}" for ${targetParticipant}`);
      console.log(`👥 [${callId}] Available participants: ${participants.join(", ")}`);

      const attendeesList = attendees
        ? attendees.split(",").map((e) => e.trim()).filter(Boolean)
        : [];

      const payload: CalendarEventPayload = {
        title,
        description,
        startISO,
        endISO,
        attendees: attendeesList,
      };

      const dedupeKey = `${meetingId}:${targetParticipant}:${title}:${startISO}`;

      // ── Fast-path dedup ──────────────────────────────────────────────────────
      // A speech interruption may re-invoke the same tool while the original
      // RPC is still running. Return pending immediately — the background chain
      // of the first call will fire generateReply() for everyone.
      if (pendingApprovals.has(dedupeKey)) {
        console.log(`🔁 [${callId}] Duplicate in-flight — returning pending for "${dedupeKey}".`);
        return JSON.stringify({
          callId,
          status: "pending",
          target: targetParticipant,
          note: "Duplicate request detected. Waiting for the existing approval dialog to resolve.",
        });
      }

      // ── Sequential queue (background, non-blocking) ────────────────────────
      // Append to the global promise chain so only one approval dialog
      // is visible at a time.  execute() returns IMMEDIATELY — the LLM
      // is never blocked waiting for user input.
      const waitFor = approvalLockTail;
      let releaseLock!: () => void;
      approvalLockTail = new Promise<void>((res) => { releaseLock = res; });

      // Deferred promise stored in the dedup map so fast-path callers can
      // attach to it without starting a second RPC.
      let deferResolve!: (r: TargetedApprovalResult) => void;
      let deferReject!:  (e: unknown) => void;
      const deferredResult = new Promise<TargetedApprovalResult>((res, rej) => {
        deferResolve = res;
        deferReject  = rej;
      });
      pendingApprovals.set(dedupeKey, deferredResult);

      // Background IIFE — does NOT block the LLM turn.
      //   1. Waits for any prior dialog to close (queue).
      //   2. Sends the RPC → shows the approval dialog on the client.
      //   3. Injects the real result back into the LLM via generateReply().
      (async () => {
        try {
          await waitFor;  // wait until previous dialog has resolved
          console.log(`▶️ [${callId}] Lock acquired — sending RPC approval request to ${targetParticipant}.`);

          const result = await requestCalendarApproval(meetingId, agentId, targetParticipant, payload);
          deferResolve(result);

          console.log(`📨 [${callId}] Approval resolved for ${result.targetName}: ${result.approved ? "APPROVED" : "REJECTED"}`);

          // Inject the real decision back into the LLM as a new turn.
          // This is equivalent to a human saying the result out loud — the
          // model hears it and can respond naturally.
          const instruction = result.approved
            ? `CALENDAR_APPROVAL_RESULT [callId:${callId}]: ${result.targetName} has APPROVED the calendar event "${title}" scheduled for ${new Date(startISO).toLocaleString()}. Inform the meeting of this approval in one short sentence.`
            : `CALENDAR_APPROVAL_RESULT [callId:${callId}]: ${result.targetName} has REJECTED the calendar event "${title}". Reason: ${
                result.reason || "No reason given"
              }. Acknowledge the rejection in one sentence and ask if they\'d like to make any changes.`;

          session.generateReply({ instructions: instruction });
        } catch (err) {
          console.error(`💥 [${callId}] Background approval error:`, err);
          deferReject(err);
        } finally {
          // Always release — even on timeout or error — so the queue drains.
          pendingApprovals.delete(dedupeKey);
          releaseLock();
        }
      })();

      // Return immediately — audio generation resumes at once.
      // The LLM knows a dialog is open and simply waits for the voice update.
      return JSON.stringify({
        callId,
        status: "pending",
        target: targetParticipant,
        message: `Approval dialog sent to ${targetParticipant}. You will be notified of their decision via a spoken update when they respond.`,
      });
    }
  });
}