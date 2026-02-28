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
// ✅ CHANGED: Import the factory function from your updated calendarTool file
import { buildCalendarTool } from "./tools/calendarTool.js";

// ─────────────────────────────────────────────────────────
// TRANSCRIPT STORAGE SERVICE
// Agent-side direct storage - no client buffering needed!
// ─────────────────────────────────────────────────────────
interface TranscriptLine {
  role: "human" | "assistant";
  speaker: string;
  text: string;
  timestamp: number;
  index: number;
}

class TranscriptStorageService {
  private buffer: TranscriptLine[] = [];
  private flushPromise: Promise<void> | null = null;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly BATCH_SIZE = 10;
  private readonly FLUSH_INTERVAL_MS = 3000;
  private readonly MAX_RETRIES = 3;

  constructor(
    private meetingId: string,
    private backendUrl: string,
    private INTERNAL_HANDSHAKE_SECRET: string
  ) {
    // Start periodic flush
    this.flushInterval = setInterval(() => {
      this.flush().catch((err) =>
        console.error("❌ Periodic transcript flush failed:", err)
      );
    }, this.FLUSH_INTERVAL_MS);
  }

  add(line: TranscriptLine): void {
    this.buffer.push(line);
    console.log(`📝 Buffered transcript #${line.index} for storage (buffer: ${this.buffer.length})`);

    // Auto-flush if batch size reached
    if (this.buffer.length >= this.BATCH_SIZE) {
      this.flush().catch((err) =>
        console.error("❌ Auto-flush failed:", err)
      );
    }
  }

  async flush(): Promise<void> {
    // Wait for any in-progress flush
    if (this.flushPromise) {
      await this.flushPromise;
    }

    if (this.buffer.length === 0) return;

    const lines = [...this.buffer];
    this.buffer = [];

    this.flushPromise = this.storeWithRetry(lines);

    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  private async storeWithRetry(lines: TranscriptLine[]): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.backendUrl}/api/agent-transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meetingId: this.meetingId,
            INTERNAL_HANDSHAKE_SECRET: this.INTERNAL_HANDSHAKE_SECRET,
            lines: lines.map((l) => ({
              role: l.role,
              speaker: l.speaker,
              text: l.text,
              timestamp: l.timestamp,
              index: l.index,
            })),
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const result = await response.json();
        console.log(`✅ Stored ${result.stored} transcript lines to DB (attempt ${attempt})`);
        return;
      } catch (err) {
        lastError = err as Error;
        console.warn(`⚠️ Transcript storage attempt ${attempt}/${this.MAX_RETRIES} failed:`, err);

        if (attempt < this.MAX_RETRIES) {
          // Exponential backoff
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
    }

    // All retries failed - put lines back in buffer for next flush
    console.error(`❌ All transcript storage attempts failed. Re-buffering ${lines.length} lines.`);
    this.buffer = [...lines, ...this.buffer];
    throw lastError;
  }

  async shutdown(): Promise<void> {
    // Stop periodic flush
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush with extra retries
    if (this.buffer.length > 0) {
      console.log(`🔄 Final transcript flush: ${this.buffer.length} lines remaining`);
      try {
        await this.flush();
        console.log("✅ Final transcript flush completed");
      } catch (err) {
        console.error("❌ Final transcript flush failed:", err);
      }
    }
  }
}

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

  constructor(name: string, instructions: string, tools: any) {
    // Pass tools down to the underlying LiveKit Agent
    super({ instructions, tools });
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
      // 1b. LISTEN FOR LATE-ARRIVING METADATA
      //     LiveKit may deliver room metadata after connect().
      //     Re-parse it so the agent picks up the correct name
      //     and instructions even if it arrived after entry().
      // ─────────────────────────────────────────────────────
      ctx.room.on(RoomEvent.RoomMetadataChanged, (newMetadata: string) => {
        if (!newMetadata) return;
        try {
          const data: RoomMetadata = JSON.parse(newMetadata);
          if (data.meetingData) {
            currentMeeting = data.meetingData;
            console.log(`📋 Late metadata — meeting name updated to: "${currentMeeting.name}"`);
          }
          if (data.agentData) {
            currentAgent = data.agentData;
            console.log(`📋 Late metadata — agent name updated to: "${currentAgent.name}"`);
          }
        } catch (e) {
          console.error("⚠️ Failed to parse late room metadata:", e);
        }
      });

      // ─────────────────────────────────────────────────────
      // 2. PARTICIPANT TRACKING
      //    Maps participant identity → display name.
      //    Used for speaker attribution in transcripts and
      //    for telling the AI model who is currently speaking.
      // ─────────────────────────────────────────────────────
      const participantNames = new Map<string, string>(); // identity → display name

      /** Get display name for a participant identity */
      function getDisplayName(identity: string): string {
        return participantNames.get(identity) ?? identity;
      }

      /** Build a participant list string for the system prompt */
      function buildParticipantList(): string {
        if (participantNames.size === 0) return "No participants have joined yet.";
        const names = Array.from(participantNames.values());
        return names.join(", ");
      }

      // Seed with any participants already in the room
      for (const p of ctx.room.remoteParticipants.values()) {
        if (p.identity !== localParticipant?.identity) {
          participantNames.set(p.identity, p.name || p.identity);
        }
      }

      // ─────────────────────────────────────────────────────
      // 3. BUILD SYSTEM PROMPT with meeting context
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
        - ALWAYS respond in English. All transcription and responses must be in English script(auto translate while scripting).
        - When multiple people are in the meeting, address them by name.
        - Introduce yourself as "${currentAgent.name}" if asked who you are.
        - If a participant states a factually incorrect claim, briefly and politely correct it with one concise sentence and, if helpful, a short rationale.

        Calendar Tool Rules (strictly follow these):
        - When someone asks you to schedule, add, or create a calendar event, call the create_calendar_event tool IMMEDIATELY — do not ask the user for confirmation first, and do not ask who the target participant is.
        - Determine the target participant from context: who made the request, who was assigned the task, or who was mentioned. If there is only one other human, target them automatically.
        - Each tool call is INDEPENDENT. Results are scoped by callId and participant. Never treat a previous approval as covering a different event.
        - If the user requests multiple events, call the tool once per event. Each fires independently.
        - The tool ALWAYS returns { status: "pending" } immediately — this means the approval dialog is now open on the participant's screen. This is NOT a failure.
        - When the participant approves or rejects, you will receive a spoken instruction containing "CALENDAR_APPROVAL_RESULT [callId:XYZ]:". That carries the real decision.
        - Until you hear that instruction, simply acknowledge the pending state in one sentence and remain conversational.
        - When you hear the APPROVED/REJECTED result, do not announce it to the meeting unless asked.
        Multi-Speaker Awareness:
        - This is a multi-participant meeting. Multiple humans may take turns speaking.
        - You will receive context about who is currently speaking via system updates.
        - When you hear audio, it belongs to the person identified as the current speaker.
        - Address each person by their name when responding to them.
        - Keep track of what each person has said during the conversation.
        - If you're unsure who is speaking, you may ask.

        Current participants: ${buildParticipantList()}
        `.trim();

      // ─────────────────────────────────────────────────────
      // 4. CONFIGURE GEMINI REALTIME MODEL
      // ─────────────────────────────────────────────────────
      const realtimeModel = new google.beta.realtime.RealtimeModel({
        model: "gemini-2.5-flash-native-audio-preview-09-2025", // <-- Use the correct 2.0 experimental model
        voice: "Puck",
        temperature: 0.7,
        language: "en-US", // Fix: prevent wrong-language transcription (Hindi for English)
        instructions: systemPrompt,
        // Native audio models only support AUDIO response modality.
        // TEXT modality causes "invalid argument" error on native audio models.
        // Omit modalities to use the SDK default: [Modality.AUDIO]
      });

      // ─────────────────────────────────────────────────────
      // 5. CREATE AGENT & SESSION
      //    - The session handles turn detection automatically
      //      with Gemini realtime (no manual generateReply on speech stop)
      // ─────────────────────────────────────────────────────

      // ✅ Session is created FIRST so it can be passed into buildCalendarTool.
      //    The tool uses session.generateReply() to inject approval results back
      //    into the LLM turn without blocking audio generation.
      const session = new voice.AgentSession({
        llm: realtimeModel,
      });

      // ✅ CHANGED: Set backend URL and build the tool dynamically
      const backendUrl = process.env.NEXT_PUBLIC_APP_URL!;
      const calendarTool = buildCalendarTool(backendUrl, currentMeeting.id, currentAgent.id, session);

      // ─────────────────────────────────────────────────────
      // 5b. TRANSCRIPT STORAGE SERVICE (Agent-side direct storage)
      //     This eliminates the unreliable client-side "scribe" pattern
      // ─────────────────────────────────────────────────────
      const INTERNAL_HANDSHAKE_SECRET = process.env.INTERNAL_HANDSHAKE_SECRET!;
      const transcriptStorage = new TranscriptStorageService(
        currentMeeting.id,
        backendUrl,
        INTERNAL_HANDSHAKE_SECRET
      );
      console.log("✅ Transcript storage service initialized");

      // ✅ CHANGED: Pass the configured tool map into the Agent
      const agent = new MeetingAgent(currentAgent.name, systemPrompt, {
        create_calendar_event: calendarTool,
      });

      // Transcript sequence counter for ordered delivery
      let transcriptIndex = 0;

      // ─────────────────────────────────────────────────────
      // 6. TRANSCRIPT HANDLING
      //    - Store directly to DB via TranscriptStorageService
      //    - Also broadcast via DataChannel for real-time UI
      //    - LiveKit native transcription is enabled for clients
      // ─────────────────────────────────────────────────────
      session.on(
        voice.AgentSessionEventTypes.ConversationItemAdded,
        async (event) => {
          const text = event.item.textContent;
          if (!text || text.trim().length === 0) return;

          let assignedRole: "human" | "assistant" = "assistant";
          // For DB storage: send IDs, not display names.
          // The getTranscript procedure resolves IDs to names.
          let speakerId: string = currentMeeting.agentId || currentAgent.id || currentAgent.name;

          if (event.item.role === "user") {
            assignedRole = "human";

            // Use the last active speaker's IDENTITY (which is the user ID)
            // LiveKit participant identity = ctx.auth.user.id (set during token generation)
            if (lastActiveSpeakerIdentity) {
              speakerId = lastActiveSpeakerIdentity;
            } else {
              // Fallback: use first remote participant's identity (user ID)
              const remotes = Array.from(ctx.room.remoteParticipants.values());
              const firstRemote = remotes[0];
              speakerId = firstRemote ? firstRemote.identity : "unknownUser";
            }
          }

          const currentIndex = transcriptIndex++;
          const timestamp = Date.now();

          // 1. STORE TO DB (primary - guaranteed persistence)
          transcriptStorage.add({
            role: assignedRole,
            speaker: speakerId,
            text: text,
            timestamp: timestamp,
            index: currentIndex,
          });

          // 2. BROADCAST VIA DATA CHANNEL (secondary - for real-time UI)
          const payload = {
            type: "transcript_update",
            role: assignedRole,
            speaker: speakerId,
            text: text,
            timestamp: timestamp,
            index: currentIndex,
          };

          try {
            const displayName = assignedRole === "human"
              ? getDisplayName(speakerId)
              : currentAgent.name;
            const data = new TextEncoder().encode(JSON.stringify(payload));
            await localParticipant.publishData(data, { reliable: true });
            console.log(
              `📝 Transcript #${payload.index} [${assignedRole}/${displayName}]: ${text.substring(0, 60)}...`
            );
          } catch (err) {
            console.error("❌ Failed to publish transcript data:", err);
            // Note: DB storage already happened, so UI may lag but data is safe
          }
        }
      );

      // ─────────────────────────────────────────────────────
      // 7. DEBUG: LOG STATE CHANGES
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
        async (event) => {
          console.log("🔒 Session closing. Reason:", event.reason);

          // CRITICAL: Flush all pending transcripts before session ends
          try {
            await transcriptStorage.shutdown();
            console.log("✅ Transcript storage shutdown complete");
          } catch (err) {
            console.error("❌ Failed to shutdown transcript storage:", err);
          }
        }
      );

      // ─────────────────────────────────────────────────────
      // 8. MULTI-PARTICIPANT AUDIO MIXER
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
      // 9. ROOM EVENTS — participant & speaker tracking
      //    IMPORTANT: Do NOT use updateInstructions() here!
      //    It causes the Gemini realtime session to fully restart,
      //    which destroys conversation history and disrupts audio.
      //    Instead, we use generateReply() to naturally inject
      //    context about new participants into the conversation.
      // ─────────────────────────────────────────────────────

      /** Lazily resolved session — set after session.start() */
      let sessionReady = false;

      ctx.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        participantNames.set(participant.identity, participant.name || participant.identity);
        const name = getDisplayName(participant.identity);
        console.log(`👋 Participant joined: ${name} (${participant.identity})`);
        console.log(`👥 Participants (${participantNames.size}): ${buildParticipantList()}`);

        // Use generateReply to naturally acknowledge the new participant.
        // This does NOT restart the Gemini session — it just prompts a response
        // that injects the participant context into the conversation history.
        if (sessionReady) {
          session.generateReply({
            instructions: `A new person just joined the meeting: "${name}". There are now ${participantNames.size} human participant(s): ${buildParticipantList()}. Briefly welcome ${name} to the meeting. Keep it to one short sentence.`,
          });
        }
      });

      ctx.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        const name = getDisplayName(participant.identity);
        participantNames.delete(participant.identity);
        console.log(`👋 Participant left: ${name}`);
        console.log(`👥 Participants (${participantNames.size}): ${buildParticipantList()}`);

        // Acknowledge departure without restarting the session.
        if (sessionReady) {
          session.generateReply({
            instructions: `"${name}" has left the meeting. There are now ${participantNames.size} human participant(s) remaining: ${buildParticipantList()}. Briefly acknowledge their departure in one sentence. Do not dwell on it.`,
          });
        }
      });

      /**
       * Track the active speaker for transcript attribution ONLY.
       * No longer calls updateInstructions() — that caused full session restarts.
       */
      let previousSpeakerIdentity: string | null = null;

      ctx.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const humans = speakers.filter(
          (p) => p.identity !== localParticipant.identity
        );
        if (humans.length > 0) {
          const newSpeaker = humans[0];
          lastActiveSpeakerIdentity = newSpeaker.identity;

          if (newSpeaker.identity !== previousSpeakerIdentity) {
            previousSpeakerIdentity = newSpeaker.identity;
            console.log(`🎯 Speaker changed → ${getDisplayName(newSpeaker.identity)}`);
          }

          console.log(
            "🗣️ Active speakers:",
            humans.map((h) => `${getDisplayName(h.identity)}`).join(", ")
          );
        }
      });

      // ─────────────────────────────────────────────────────
      // 10. START SESSION
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
        // Mark session as ready so room event handlers can use generateReply
        sessionReady = true;
        console.log("✅ Mixed multi-participant audio attached to session");
      } else {
        console.error("❌ No activity found — audio injection failed");
      }

      console.log(
        `✅ Voice session started — mixing audio from ${trackStreams.size} participant(s)`
      );

      // ─────────────────────────────────────────────────────
      // 11. INITIAL GREETING
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