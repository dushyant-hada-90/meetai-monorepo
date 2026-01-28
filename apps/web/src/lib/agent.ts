import 'dotenv/config';
import {
  type JobContext,
  ServerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { db } from '@/db';
import { and, eq, not } from 'drizzle-orm';
import { AgentId, agents, meetings, TranscriptItem, UserId } from '@/db/schema';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { inngest } from "@/inngest/client";
dotenv.config({ path: '.env.local' });

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

class Assistant extends voice.Agent {
  public agentName: string;

  constructor(name: string, instructions: string) {
    super({ instructions });
    this.agentName = name;
  }
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();
    const meetingId = ctx.room.name;

    if (!meetingId) {
      console.error("No meeting ID found in room name.");
      return;
    }
    console.log(`Current Meeting ID: ${meetingId}`);

    // Adjusted type to match your schema's TranscriptItem (using number for time to match Date.now())
    const transcript: TranscriptItem[] = [];
    let agentName = "MeetAi Assistant";
    let agentId: AgentId = ""
    let meetingTitle = "General Meeting";
    let contextData = "No specific context available.";
    let customInstructions = "You are a helpful assistant.";

    try {
      const [existingMeeting] = await db
        .select()
        .from(meetings)
        .where(
          and(
            eq(meetings.id, meetingId),
            not(eq(meetings.status, "completed")),
            not(eq(meetings.status, "processing")),
            not(eq(meetings.status, "cancelled")),
          )
        );

      if (!existingMeeting) {
        console.warn(`Meeting ${meetingId} not found or invalid status.`);
      } else {
        meetingTitle = existingMeeting.name || meetingTitle;
        contextData = existingMeeting.summary || contextData;

        await db
          .update(meetings)
          .set({
            status: "active",
            startedAt: new Date()
          })
          .where(eq(meetings.id, existingMeeting.id));

        if (existingMeeting.agentId) {
          agentId = existingMeeting.agentId
          const [existingAgent] = await db
            .select()
            .from(agents)
            .where(eq(agents.id, existingMeeting.agentId));

          if (existingAgent) {
            agentName = existingAgent.name;
            customInstructions = existingAgent.instructions || customInstructions;
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch meeting/agent context:", error);
    }

    // ---------------------------------------------------------
    // STEP 3: Handle Meeting End (Summary & Cleanup)
    // ---------------------------------------------------------
    ctx.addShutdownCallback(async () => {
      console.log(`Resource cleanup: Marking meeting ${meetingId} as completed.`);

      try {
        await db.update(meetings)
          .set({
            transcript: transcript,
            status: "processing",
          })
          .where(eq(meetings.id, meetingId));

        console.log("DB Updated: Meeting status set to processing and saved transcript array.");

        await inngest.send({
          name: "meetings/processing", // This MUST match the event name in your inngest function
          data: {
            meetingId: meetingId
          }
        });

        console.log("Inngest event sent successfully.");
      } catch (error) {
        console.error("Failed to process meeting cleanup:", error);
      }
    });

    // ---------------------------------------------------------
    // STEP 4: Configure Agent
    // ---------------------------------------------------------
    const finalInstructions = `
      You are a helpful voice AI assistant named ${agentName}.
      The current meeting name is "${meetingTitle}".
      You are currently participating in a meeting with ID: ${meetingId}.
      
      Your Core Instructions:
      ${customInstructions}
      default language is english, no other language should be used neither in audio nor in chat transcripts
      
      Context for this meeting:
      ${contextData}

      Please keep your responses concise and professional.
    `;

    const session = new voice.AgentSession({
      llm: new google.beta.realtime.RealtimeModel({
        voice: 'Puck',
      }),
    });

    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, async (event) => {
      const text = event.item.textContent;
      if (!text) return;

      let assignedRole: "human" | "assistant" = "assistant";
      let speaker: UserId | AgentId = "unknown"

      if (event.item.role === 'assistant') {
        assignedRole = "assistant";
        speaker = agentId || "unknown"
      } else {
        // Look at the session to see who was just speaking
        // In most versions of @livekit/agents, the session tracks the 'last_user_id'
        // or you can pull it from the room's current active speakers.
        const activeSpeaker = ctx.room.remoteParticipants.values().next().value;

        // In a 1-on-1, the first remote participant is the user.
        // In a multi-user meeting, we use the identity from the room's remote participants:
        // assignedRole = (activeSpeaker?.identity as UserId) || "unknown_user";
        assignedRole = "human";
        speaker = (activeSpeaker?.identity as UserId) || "unknownUser"
      }

      const timestamp = Date.now();

      transcript.push({
        role: assignedRole,
        speaker,
        text: text,
        time: timestamp
      });

      // Broadcast to Frontend
      const data = new TextEncoder().encode(JSON.stringify({
        role: assignedRole,
        text,
        timestamp,
        type: 'transcript_update'
      }));

      await ctx.room.localParticipant?.publishData(data, { reliable: true });
    });

    await session.start({
      agent: new Assistant(agentName, finalInstructions),
      room: ctx.room,
      inputOptions: {
        noiseCancellation: BackgroundVoiceCancellation(),
      },
      outputOptions: {
        transcriptionEnabled: true,
        syncTranscription: false,
      }
    });

    console.log("-------------------- Agent Started ------------------------------");

    const handle = session.generateReply({
      instructions: `Greet the user as ${agentName}. Mention that you are ready for the "${meetingTitle}" meeting.`,
    });

    await handle.waitForPlayout();
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));