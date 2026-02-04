import 'dotenv/config';
import {
  type JobContext,
  ServerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as silero from '@livekit/agents-plugin-silero';
import {
  RoomEvent,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  TrackKind
} from '@livekit/rtc-node';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Load environment variables
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
    console.log("----------------- AGENT STARTING ----------------------");
    
    // 1. Load VAD (Critical for Modular Pipeline)
    const vad = await silero.VAD.load();
    
    await ctx.connect();

    // --- 1. State & Heuristics ---
    let transcriptIndex = 0;
    let lastActiveSpeakerId = "unknown_human";

    // FIX: Active Speaker Detection (Ignoring the Agent)
    ctx.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      for (const speaker of speakers) {
        // Only update if the speaker is NOT the agent (LocalParticipant)
        if (speaker.identity !== ctx.room.localParticipant?.identity) {
          lastActiveSpeakerId = speaker.identity;
          console.log(`[Speaker Detect] Human speaker changed to: ${lastActiveSpeakerId}`);
        }
      }
    });

    // Debug log for audio subscriptions
    ctx.room.on(RoomEvent.TrackSubscribed, (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (track.kind === TrackKind.KIND_AUDIO && participant) {
        console.log(`[Agent] Subscribed to audio from: ${participant.identity}`);
      }
    });

    // --- 2. Metadata Parsing ---
    const meetingId = ctx.room.name;
    let currentMeeting = { id: "unknown", name: "Meeting" };
    let currentAgent = { name: "AI Assistant", instructions: "You are a helpful assistant." };

    if (ctx.room.metadata) {
      try {
        const data = JSON.parse(ctx.room.metadata);
        if (data.meetingData) currentMeeting = data.meetingData;
        if (data.agentData) currentAgent = data.agentData;
      } catch (e) {
        console.error("Failed to parse metadata", e);
      }
    }

    // --- 3. Configure Instructions ---
    const finalInstructions = `
      You are a helpful voice AI assistant named ${currentAgent.name}.
      The current meeting name is "${currentMeeting.name}".
      
      Your Core Instructions: ${currentAgent.instructions}
      
      IMPORTANT:
      1. Default language is English.
      2. Do NOT use markdown formatting (no asterisks, no bolding, no headers). 
      3. Do NOT use bullet points (e.g. "*"). Instead, use phrases like "First," "Second," or just pause.
      4. Speak in natural, conversational plain text suitable for text-to-speech.
      5. Keep your responses concise and professional.
    `;

    // --- 4. Initialize Modular Pipeline ---
    // We use the Modular setup (STT -> LLM -> TTS) because it supports multi-user mixing
    // and allows us to use Deepgram TTS (which has no strict rate limits).
    const session = new voice.AgentSession({
      vad: vad,
      
      // Ears: Deepgram (Mixes audio from all users automatically)
      stt: new deepgram.STT(), 
      
      // Brain: Gemini 2.0 Flash Exp (Smartest, Fastest, Free-tier friendly Text model)
      llm: new google.LLM({
        model: 'gemini-2.5-flash', 
      }),

      // Mouth: Deepgram (UNLIMITED Free Tier - Fixes the 429 Crash)
      tts: new deepgram.TTS({
        model: 'aura-asteria-en' // High quality voice
      }),
    });

    // Error logging
    session.on(voice.AgentSessionEventTypes.Error, (err) => {
      console.error("----------------- AGENT ERROR -----------------");
      console.error(err);
    });

    // State logging
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (state) => {
      console.log(`[State Change] Agent is now: ${state}`);
    });

    // --- 5. Transcript Broadcasting ---
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, async (event) => {
      const text = event.item.textContent;
      if (!text || text.trim().length === 0) return;

      let assignedRole = "assistant";
      let speakerName = currentAgent.name;

      // Attribute user speech to the last detected ACTIVE HUMAN speaker
      if (event.item.role === 'user') {
        assignedRole = "human";
        speakerName = lastActiveSpeakerId;

        // Fallback: If no speaker detected yet, use the last joined remote
        if (speakerName === "unknown_human") {
          const remotes = Array.from(ctx.room.remoteParticipants.values());
          if (remotes.length > 0) {
            speakerName = remotes[remotes.length - 1]?.identity || "unknown";
          }
        }
      }

      const payload = {
        role: assignedRole,
        speaker: speakerName,
        text: text,
        timestamp: Date.now(),
        type: 'transcript_update',
        index: transcriptIndex++,
      };

      console.log("logging payload ->", payload);

      const data = new TextEncoder().encode(JSON.stringify(payload));

      try {
        await ctx.room.localParticipant?.publishData(data, { reliable: true });
        console.log(`[Broadcasting] #${payload.index} ${assignedRole}: ${text.substring(0, 30)}...`);
      } catch (err) {
        console.error("Failed to publish transcript:", err);
      }
    });

    // --- 6. Start the Session ---
    await session.start({
      agent: new Assistant(currentAgent.name, finalInstructions),
      room: ctx.room,
      outputOptions: {
        transcriptionEnabled: true,
        syncTranscription: false,
      }
    });

    // Initial Greeting
    const handle = session.generateReply({
      instructions: `Greet the user as ${currentAgent.name}. Mention that you are ready for the "${currentMeeting.name}" meeting.`,
    });

    await handle.waitForPlayout();
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));
}