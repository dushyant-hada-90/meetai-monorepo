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
import { agents, meetings } from '@/db/schema';

dotenv.config({ path: '.env.local' });

class Assistant extends voice.Agent {
  public agentName: string;

  constructor(name: string, instructions: string) {
    super({ instructions });
    this.agentName = name;
  }
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    // STEP 1: Get the Room Name (Meeting ID)
    await ctx.connect();
    const meetingId = ctx.room.name;
    
    if (!meetingId) {
      console.error("No meeting ID found in room name.");
      return; 
    }
    console.log(`Current Meeting ID: ${meetingId}`);

    // ---------------------------------------------------------
    // STEP 2: Database Query
    // ---------------------------------------------------------
    // DECLARE THESE OUTSIDE THE TRY BLOCK so they can be used in Step 3
    let agentName = "MeetAi Assistant";
    let meetingTitle = "General Meeting";
    let contextData = "No specific context available.";
    let customInstructions = "You are a helpful assistant.";

    try {
      // 1. Fetch Meeting
      const [existingMeeting] = await db
        .select()
        .from(meetings)
        .where(
          and(
            eq(meetings.id, meetingId),
            not(eq(meetings.status, "completed")),
            not(eq(meetings.status, "processing")),
            not(eq(meetings.status, "cancelled")),
            // not(eq(meetings.status, "active")), // Consider if you want to allow re-joining active meetings
          )
        );

      if (!existingMeeting) {
        console.warn(`Meeting ${meetingId} not found or invalid status.`);
        // You might want to throw here or just let it fall back to defaults
      } else {
        // Update local variables with DB data
        meetingTitle = existingMeeting.name || meetingTitle;
        contextData = existingMeeting.summary || contextData;

        // 2. Mark as Active
        await db
          .update(meetings)
          .set({
            status: "active",
            startedAt: new Date()
          })
          .where(eq(meetings.id, existingMeeting.id));

        // 3. Fetch Agent
        if (existingMeeting.agentId) {
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
      // Logic will continue using the default variables defined above
    }

    // ---------------------------------------------------------
    // NEW STEP: Handle Meeting End (Cleanup)
    // ---------------------------------------------------------
    // This callback runs automatically when the room closes or agent disconnects.
    ctx.addShutdownCallback(async () => {
      console.log(`Resource cleanup: Marking meeting ${meetingId} as completed.`);
      try {
        await db
          .update(meetings)
          .set({ 
            status: "completed",
            // You might want to add an 'endedAt' column to your schema later
            // endedAt: new Date() 
          })
          .where(eq(meetings.id, meetingId));
          
        console.log("DB Updated: Meeting status set to completed.");
      } catch (error) {
        console.error("Failed to update meeting status on disconnect:", error);
      }
    });

    // ---------------------------------------------------------
    // STEP 3: Configure Agent
    // ---------------------------------------------------------
    const finalInstructions = `
      You are a helpful voice AI assistant named ${agentName}.
      The current meeting name is "${meetingTitle}".
      You are currently participating in a meeting with ID: ${meetingId}.
      
      Your Core Instructions:
      ${customInstructions}
      
      Context for this meeting:
      ${contextData}

      Please keep your responses concise and professional.
    `;

    const session = new voice.AgentSession({
      llm: new google.beta.realtime.RealtimeModel({
        voice: 'Puck',
      }),
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

    // ---------------------------------------------------------
    // STEP 4: Initial Greeting
    // ---------------------------------------------------------
    const handle = session.generateReply({
      instructions: `Greet the user as ${agentName}. Mention that you are ready for the "${meetingTitle}" meeting.`,
    });

    await handle.waitForPlayout();
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));