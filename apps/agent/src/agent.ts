import "dotenv/config";
import {
  defineAgent,
  type JobContext,
  cli,
  voice,
  ServerOptions,
} from "@livekit/agents";
import * as google from "@livekit/agents-plugin-google";
import {
  RoomEvent,
  type Participant,
  type RemoteParticipant,
  AudioStream,
  AudioMixer,
  type AudioFrame,
  TrackSource,
  type Track,
  type TrackPublication,
} from "@livekit/rtc-node";
import { fileURLToPath } from "node:url";

// ─────────────────────────────────────────────────────────
// Types matching frontend DB schema
// ─────────────────────────────────────────────────────────
interface MeetingData {
  id: string;
  name: string;
  agentId: string;
  createdByUserId: string;
  status: string;
  [key: string]: unknown;
}

interface AgentData {
  id: string;
  name: string;
  userId: string;
  instructions: string;
  [key: string]: unknown;
}

interface RoomMetadata {
  meetingData?: MeetingData;
  agentData?: AgentData;
}

// ─────────────────────────────────────────────────────────
// Custom Agent class to carry name + instructions
// ─────────────────────────────────────────────────────────
class MeetingAgent extends voice.Agent {
  public agentName: string;

  constructor(name: string, instructions: string) {
    super({ instructions });
    this.agentName = name;
  }
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    try {
      console.log("🚀 Agent entry function called");
      console.log("📦 Job ID:", (ctx as any).job?.id ?? "N/A");
      console.log("📦 Job metadata:", (ctx as any).job?.metadata ?? "N/A");

      await ctx.connect();
      console.log("✅ Connected to room:", ctx.room.name);

      const localParticipant = ctx.room.localParticipant;
      if (!localParticipant) {
        throw new Error("Local participant not initialized after connect()");
      }

      // ─────────────────────────────────────────────────────
      // 1. PARSE ROOM METADATA (agent name, instructions, meeting context)
      //    Also check job metadata as fallback (from dispatch metadata)
      // ─────────────────────────────────────────────────────
      let currentMeeting: MeetingData = {
        id: ctx.room.name ?? "unknown",
        name: "Meeting",
        agentId: "",
        createdByUserId: "",
        status: "active",
      };
      let currentAgent: AgentData = {
        id: "",
        name: "AI Assistant",
        userId: "",
        instructions: "You are a helpful assistant.",
      };

      // Try room metadata first
      let metadataSource = "defaults";
      const rawMetadata = ctx.room.metadata || (ctx as any).job?.metadata;
      if (rawMetadata) {
        try {
          const data: RoomMetadata = JSON.parse(rawMetadata);
          if (data.meetingData) currentMeeting = data.meetingData;
          if (data.agentData) currentAgent = data.agentData;
          metadataSource = ctx.room.metadata ? "room" : "job";
          console.log(`📋 Parsed metadata (source: ${metadataSource}) — Agent: "${currentAgent.name}" | Meeting: "${currentMeeting.name}"`);
        } catch (e) {
          console.error("⚠️ Failed to parse metadata, using defaults:", e);
        }
      } else {
        console.warn("⚠️ No room or job metadata found, using defaults");
      }

    // ─────────────────────────────────────────────────────
    // 2. BUILD SYSTEM PROMPT with meeting context
    // ─────────────────────────────────────────────────────
    const systemPrompt = `
You are "${currentAgent.name}", an AI participant in this meeting.
Meeting name: "${currentMeeting.name}".

Your Core Instructions:
${currentAgent.instructions}

Behavioral Guidelines:
- You behave exactly like another human participant in the meeting.
- Speak naturally and conversationally—avoid sounding robotic.
- Be concise and professional. Do not ramble.
- Wait for the other person to finish speaking before you reply.
- Default language is English unless the user speaks another language.
- When multiple people are in the meeting, address them naturally.
- Introduce yourself as "${currentAgent.name}" if asked who you are.
`.trim();

    // ─────────────────────────────────────────────────────
    // 3. CONFIGURE GEMINI REALTIME MODEL
    // ─────────────────────────────────────────────────────
    const realtimeModel = new google.beta.realtime.RealtimeModel({
      model: "gemini-2.5-flash-native-audio-preview-12-2025",
      voice: "Puck",
      temperature: 0.7,
      instructions: systemPrompt,
      // Native audio models only support AUDIO response modality.
      // TEXT modality causes "invalid argument" error on native audio models.
      // Omit modalities to use the SDK default: [Modality.AUDIO]
    });

    // ─────────────────────────────────────────────────────
    // 4. CREATE AGENT & SESSION
    //    - The session handles turn detection automatically
    //      with Gemini realtime (no manual generateReply on speech stop)
    // ─────────────────────────────────────────────────────
    const agent = new MeetingAgent(currentAgent.name, systemPrompt);

    const session = new voice.AgentSession({
      llm: realtimeModel,
    });

    // Transcript sequence counter for ordered delivery
    let transcriptIndex = 0;

    // ─────────────────────────────────────────────────────
    // 5. TRANSCRIPT BROADCASTING via DataChannel
    //    → Frontend listens on RoomEvent.DataReceived
    // ─────────────────────────────────────────────────────
    session.on(
      voice.AgentSessionEventTypes.ConversationItemAdded,
      async (event) => {
        const text = event.item.textContent;
        if (!text || text.trim().length === 0) return;

        let assignedRole: "human" | "assistant" = "assistant";
        let speakerName: string = currentAgent.name;

        if (event.item.role === "user") {
          assignedRole = "human";

          // Use the last active speaker for attribution (from ActiveSpeakersChanged)
          if (lastActiveSpeakerIdentity) {
            speakerName = lastActiveSpeakerIdentity;
          } else {
            // Fallback: use first remote participant
            const remotes = Array.from(ctx.room.remoteParticipants.values());
            speakerName = remotes[0]?.identity ?? "unknown_user";
          }
        }

        const payload = {
          type: "transcript_update",
          role: assignedRole,
          speaker: speakerName,
          text: text,
          timestamp: Date.now(),
          index: transcriptIndex++,
        };

        try {
          const data = new TextEncoder().encode(JSON.stringify(payload));
          await localParticipant.publishData(data, { reliable: true });
          console.log(
            `📝 Transcript #${payload.index} [${assignedRole}/${speakerName}]: ${text.substring(0, 60)}...`
          );
        } catch (err) {
          console.error("❌ Failed to publish transcript data:", err);
        }
      }
    );

    // ─────────────────────────────────────────────────────
    // 6. DEBUG: LOG STATE CHANGES
    // ─────────────────────────────────────────────────────
    session.on(
      voice.AgentSessionEventTypes.AgentStateChanged,
      (event) => {
        console.log(`🤖 Agent state: ${event.oldState} → ${event.newState}`);
      }
    );

    session.on(
      voice.AgentSessionEventTypes.UserStateChanged,
      (event) => {
        console.log(`👤 User state: ${event.oldState} → ${event.newState}`);
      }
    );

    session.on(
      voice.AgentSessionEventTypes.UserInputTranscribed,
      (event) => {
        if (event.isFinal) {
          console.log(`🎤 User said: "${event.transcript}"`);
        }
      }
    );

    session.on(
      voice.AgentSessionEventTypes.Error,
      (event) => {
        console.error("❌ Session error:", event.error);
      }
    );

    session.on(
      voice.AgentSessionEventTypes.Close,
      (event) => {
        console.log("🔒 Session closed. Reason:", event.reason);
      }
    );

    // ─────────────────────────────────────────────────────
    // 7. MULTI-PARTICIPANT AUDIO MIXER
    //    The SDK pins to ONE participant by default.
    //    We disable RoomIO audio and use AudioMixer to combine
    //    all participants' mic tracks into a single mixed stream.
    // ─────────────────────────────────────────────────────
    const SAMPLE_RATE = 24000;
    const NUM_CHANNELS = 1;

    const mixer = new AudioMixer(SAMPLE_RATE, NUM_CHANNELS, {
      streamTimeoutMs: 2000,
    });
    const trackStreams = new Map<string, AudioStream>();

    // Track the last active human speaker for transcript attribution
    let lastActiveSpeakerIdentity: string | null = null;

    /**
     * Check if a participant is a human (not another agent)
     */
    function isHumanParticipant(participant: { identity: string }): boolean {
      return !participant.identity.startsWith("agent-");
    }

    /**
     * Subscribe a participant's microphone track to the mixer
     */
    function addTrackToMixer(
      track: Track,
      publication: TrackPublication,
      participant: RemoteParticipant
    ) {
      if (publication.source !== TrackSource.SOURCE_MICROPHONE) return;
      if (participant.identity === localParticipant?.identity) return;
      if (!isHumanParticipant(participant)) {
        console.log(`⏭️ Skipping agent track from: ${participant.identity}`);
        return;
      }

      const sid = publication.sid;
      if (!sid || trackStreams.has(sid)) return;

      const stream = new AudioStream(track, {
        sampleRate: SAMPLE_RATE,
        numChannels: NUM_CHANNELS,
      });
      trackStreams.set(sid, stream);
      mixer.addStream(stream);
      console.log(`🎵 Mixed in HUMAN audio from: ${participant.identity} (${sid})`);
    }

    // Listen for new tracks being subscribed
    ctx.room.on(
      RoomEvent.TrackSubscribed,
      (track: Track, publication: TrackPublication, participant: RemoteParticipant) => {
        addTrackToMixer(track, publication, participant);
        console.log(`🎧 Subscribed to track from: ${participant.identity}`);
      }
    );

    // Clean up when tracks are unsubscribed
    ctx.room.on(
      RoomEvent.TrackUnsubscribed,
      (_track: Track, publication: TrackPublication, _participant: RemoteParticipant) => {
        const sid = publication.sid;
        const stream = sid ? trackStreams.get(sid) : undefined;
        if (stream && sid) {
          mixer.removeStream(stream);
          trackStreams.delete(sid);
          console.log(`🔇 Removed audio from mixer: ${sid}`);
        }
      }
    );

    // Subscribe to tracks that are already published (participant joined before agent)
    for (const participant of ctx.room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (
          publication.track &&
          publication.source === TrackSource.SOURCE_MICROPHONE
        ) {
          addTrackToMixer(
            publication.track,
            publication,
            participant as RemoteParticipant
          );
        }
      }
    }

    // ─────────────────────────────────────────────────────
    // 8. ROOM EVENTS — participant & speaker tracking
    // ─────────────────────────────────────────────────────
    ctx.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log(`👋 Participant joined: ${participant.identity} (${participant.name})`);
    });

    ctx.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log(`👋 Participant left: ${participant.identity}`);
    });

    ctx.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const humans = speakers.filter(
        (p) => p.identity !== localParticipant.identity
      );
      if (humans.length > 0) {
        // Track who spoke last for transcript attribution
        lastActiveSpeakerIdentity = humans[0].identity;
        console.log(
          "🗣️ Active speakers:",
          humans.map((h) => h.identity).join(", ")
        );
      }
    });

    // ─────────────────────────────────────────────────────
    // 9. START SESSION
    //    Disable RoomIO's automatic audio input so the SDK
    //    does NOT pin to a single participant. We then attach
    //    our mixed multi-participant stream manually.
    // ─────────────────────────────────────────────────────
    await session.start({
      agent,
      room: ctx.room,
      inputOptions: {
        audioEnabled: false,  // ← prevent SDK from creating single-participant audio
      },
      outputOptions: {
        transcriptionEnabled: true,
        syncTranscription: false,
      },
    });

    // Convert the AudioMixer async iterator → ReadableStream<AudioFrame>
    const mixerIterator = mixer[Symbol.asyncIterator]();
    const mixedAudioReadable = new ReadableStream<AudioFrame>({
      async pull(controller) {
        try {
          const { done, value } = await mixerIterator.next();
          if (done) {
            controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (err) {
          console.error("❌ Mixer stream error:", err);
          controller.close();
        }
      },
    });

    // Attach mixed audio to the activity.
    // Since audioEnabled:false, no prior audio source was set,
    // so attachAudioInput will cleanly set the source on the first call.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activity = (session as any).activity;
    if (activity) {
      activity.attachAudioInput(mixedAudioReadable);
      console.log("✅ Mixed multi-participant audio attached to session");
    } else {
      console.error("❌ No activity found — audio injection failed");
    }

    console.log(
      `✅ Voice session started — mixing audio from ${trackStreams.size} participant(s)`
    );

    // ─────────────────────────────────────────────────────
    // 10. INITIAL GREETING
    // ─────────────────────────────────────────────────────
    const greetHandle = session.generateReply({
      instructions: `Greet the participants as "${currentAgent.name}". Mention that you're ready for the "${currentMeeting.name}" meeting. Keep it brief and natural—like a real person joining a call.`,
    });

    await greetHandle.waitForPlayout();
    console.log("✅ Greeting delivered");

    } catch (err) {
      console.error("💥 FATAL ERROR in agent entry:", err);
      throw err; // Re-throw so the SDK knows the job failed
    }
  },
});

// ─────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────
cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    // No agentName → automatic dispatch.
    // The agent auto-joins any room when a participant connects.
    // Context is read from ctx.room.metadata (set by the Next.js backend).
  })
);