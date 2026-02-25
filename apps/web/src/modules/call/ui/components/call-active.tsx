"use client";

import {
  useVoiceAssistant,
  BarVisualizer,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  AgentState,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  useRemoteParticipants,
  useConnectionState,
  useIsSpeaking,
  TrackReference,
  VideoTrack as LiveKitVideoTrack,
} from "@livekit/components-react";
import {
  Track,
  RoomEvent,
  ParticipantKind,
  ConnectionState,
  Participant,
  LocalAudioTrack,
  RemoteAudioTrack,
} from "livekit-client";
import {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  MessageSquareText,
  X,
  Users,
  Clock,
  MoreVertical,
  Pin,
} from "lucide-react";
import "@livekit/components-styles";
import { CallEnded } from "./call-ended";

// ────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
interface TranscriptLine {
  role: "human" | "assistant";
  speaker: string;
  text: string;
  timestamp: number;
  index?: number;
  segmentId?: string;
  isFinal?: boolean;
}

// ─────────────────────────────────────────────────────────
// 1. TRANSCRIPT RECEIVER (Display only - NO storage)
//    The agent now handles all DB storage directly.
//    This component receives transcripts from TWO sources:
//    1. LiveKit native transcription (lk.transcription topic)
//    2. Custom DataChannel messages (transcript_update type)
//    Both are merged for a complete live transcript view.
// ─────────────────────────────────────────────────────────
function useTranscriptReceiver(
  onTranscriptLine: (line: TranscriptLine) => void
) {
  const room = useRoomContext();
  const processedSegments = useRef<Set<string>>(new Set());
  const handlerRegistered = useRef(false);

  useEffect(() => {
    if (!room) return;

    // Handler for custom DataChannel transcript messages (from agent)
    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const decoder = new TextDecoder();
        const data = JSON.parse(decoder.decode(payload));
        
        if (data.type === "transcript_update") {
          onTranscriptLine({
            role: data.role,
            speaker: data.speaker,
            text: data.text,
            timestamp: data.timestamp,
            index: data.index,
            isFinal: true, // DataChannel messages are always final
          });
        }
      } catch (e) {
        // Silently ignore non-transcript data packets
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);

    // Handler for LiveKit native transcription (lk.transcription topic)
    const handleTextStream = async (
      reader: { info: { attributes: Record<string, string>; topic: string }; readAll: () => Promise<string> },
      participantOrIdentity: string | Participant
    ) => {
      try {
        const info = reader.info;
        
        // Only process transcription topic
        if (info.topic !== "lk.transcription") return;

        const isFinal = info.attributes["lk.transcription_final"] === "true";
        const segmentId = info.attributes["lk.segment_id"];
        const trackId = info.attributes["lk.transcribed_track_id"];

        // Skip interim transcriptions to avoid duplicates
        // Only process final transcriptions
        if (!isFinal) return;

        // Deduplicate by segment ID
        if (segmentId && processedSegments.current.has(segmentId)) {
          return;
        }
        if (segmentId) {
          processedSegments.current.add(segmentId);
        }

        const text = await reader.readAll();
        if (!text || text.trim().length === 0) return;

        // Extract identity string - SDK may pass Participant object or string
        const identity = typeof participantOrIdentity === "string" 
          ? participantOrIdentity 
          : participantOrIdentity?.identity ?? "unknown";

        // Determine speaker role based on participant
        const isAgent = identity.startsWith("agent-") || 
                       (typeof participantOrIdentity !== "string" && participantOrIdentity?.kind === ParticipantKind.AGENT) ||
                       room.remoteParticipants.get(identity)?.kind === ParticipantKind.AGENT;

        onTranscriptLine({
          role: isAgent ? "assistant" : "human",
          speaker: identity,
          text: text,
          timestamp: Date.now(),
          segmentId,
          isFinal: true,
        });
      } catch (e) {
        console.error("Failed to process transcription stream:", e);
      }
    };

    // Register for LiveKit native transcription streams (only once)
    const textStreamApi = room as unknown as {
      registerTextStreamHandler?: (
        topic: string,
        handler: (reader: unknown, participantOrIdentity: unknown) => void
      ) => void;
      unregisterTextStreamHandler?: (topic: string) => void;
    };

    // Adapter keeps type-narrowed handler while matching the relaxed API shape
    const textStreamHandler = (
      reader: unknown,
      participantOrIdentity: unknown
    ) =>
      handleTextStream(
        reader as {
          info: { attributes: Record<string, string>; topic: string };
          readAll: () => Promise<string>;
        },
        participantOrIdentity as string | Participant
      );

    if (textStreamApi.registerTextStreamHandler && !handlerRegistered.current) {
      try {
        textStreamApi.registerTextStreamHandler(
          "lk.transcription",
          textStreamHandler
        );
        handlerRegistered.current = true;
      } catch (e) {
        // Handler may already be registered (e.g., from StrictMode double-invoke)
        console.debug("Text stream handler already registered:", e);
      }
    }

    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
      // Unregister the text stream handler on cleanup
      if (
        textStreamApi.unregisterTextStreamHandler &&
        handlerRegistered.current
      ) {
        try {
          textStreamApi.unregisterTextStreamHandler("lk.transcription");
          handlerRegistered.current = false;
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [room, onTranscriptLine]);
}

// ─────────────────────────────────────────────────────────
// 2. PARTICIPANT TILE - Google Meet Style
// ─────────────────────────────────────────────────────────
function ParticipantTile({
  participant,
  trackRef,
  isLocal = false,
  isPinned = false,
  onPin,
}: {
  participant: Participant;
  trackRef?: TrackReference;
  isLocal?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
}) {
  const isSpeaking = useIsSpeaking(participant);
  const [isVideoEnabled, setIsVideoEnabled] = useState(
    participant.isCameraEnabled
  );
  const [isMicEnabled, setIsMicEnabled] = useState(
    participant.isMicrophoneEnabled
  );
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const update = () => {
      setIsVideoEnabled(participant.isCameraEnabled);
      setIsMicEnabled(participant.isMicrophoneEnabled);
    };
    participant.on(RoomEvent.TrackMuted, update);
    participant.on(RoomEvent.TrackUnmuted, update);
    update();
    return () => {
      participant.off(RoomEvent.TrackMuted, update);
      participant.off(RoomEvent.TrackUnmuted, update);
    };
  }, [participant]);

  const initials = (participant.name || participant.identity || "??")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`group relative h-full w-full overflow-hidden rounded-xl bg-card transition-all duration-300 ${
        isSpeaking
          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
          : "ring-1 ring-border"
      } ${isPinned ? "ring-2 ring-primary" : ""}`}
    >
      {/* Video */}
      {trackRef && isVideoEnabled ? (
        <div className={`h-full w-full ${isLocal ? "-scale-x-100" : ""}`}>
          <LiveKitVideoTrack
            trackRef={trackRef}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <div className="flex h-20 w-20 md:h-24 md:w-24 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl md:text-2xl font-bold shadow-lg">
            {initials}
          </div>
        </div>
      )}

      {/* Hover Menu */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={() => setShowMenu(!showMenu)}
          className="p-2 rounded-full bg-background/80 backdrop-blur-sm text-foreground hover:bg-background transition-colors"
        >
          <MoreVertical size={16} />
        </button>
        {showMenu && onPin && (
          <div className="absolute top-full right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[140px]">
            <button 
              onClick={() => { onPin(); setShowMenu(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted rounded-md"
            >
              <Pin size={14} />
              {isPinned ? "Unpin" : "Pin"}
            </button>
          </div>
        )}
      </div>

      {/* Bottom overlay */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
        <div className="flex items-center gap-2">
          {!isMicEnabled && (
            <div className="rounded-full bg-destructive/20 p-1.5 text-destructive">
              <MicOff size={12} />
            </div>
          )}
          {isSpeaking && isMicEnabled && (
            <div className="flex items-end gap-0.5 h-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-0.5 bg-primary rounded-full animate-pulse"
                  style={{
                    height: `${40 + i * 20}%`,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
            </div>
          )}
          <span className="text-xs font-medium text-white truncate">
            {isLocal ? "You" : participant.name || participant.identity}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 3. AGENT TILE - Theme Aware
// ─────────────────────────────────────────────────────────
function AgentTile({
  state,
  audioTrack,
  agentName,
}: {
  state: AgentState;
  audioTrack: TrackReference | undefined;
  agentName: string;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-card ring-1 ring-border flex items-center justify-center">
      {/* Glow effect when speaking */}
      <div
        className={`absolute inset-0 bg-primary/5 transition-opacity duration-500 ${
          state === "speaking" ? "opacity-100" : "opacity-0"
        }`}
      />

      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="relative">
          <div
            className={`absolute -inset-6 rounded-full bg-primary/15 blur-2xl transition-all duration-500 ${
              state === "speaking"
                ? "opacity-100 scale-110"
                : "opacity-0 scale-95"
            }`}
          />
          <BarVisualizer
            state={state}
            track={
              audioTrack?.publication?.track as
                | LocalAudioTrack
                | RemoteAudioTrack
            }
            barCount={7}
            options={{ minHeight: 36, maxHeight: 100 }}
            className="h-28 w-44 text-primary"
          />
        </div>

        <div className="flex flex-col items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">
            {agentName}
          </h3>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted border border-border">
            <div
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                state === "speaking"
                  ? "bg-primary animate-pulse"
                  : state === "listening"
                  ? "bg-green-500"
                  : "bg-muted-foreground"
              }`}
            />
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
              {state === "listening"
                ? "Listening"
                : state === "speaking"
                ? "Speaking"
                : "Thinking"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 4. LIVE TRANSCRIPT PANEL (sidebar) - Theme Aware
// ─────────────────────────────────────────────────────────
function TranscriptPanel({
  lines,
  agentName,
}: {
  lines: TranscriptLine[];
  agentName: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  // Merge consecutive lines from the same speaker for readability
  const merged = useMemo(() => {
    const result: TranscriptLine[] = [];
    for (const line of lines) {
      const last = result[result.length - 1];
      if (last && last.speaker === line.speaker && last.role === line.role) {
        last.text += " " + line.text;
      } else {
        result.push({ ...line });
      }
    }
    return result;
  }, [lines]);

  if (merged.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <MessageSquareText size={24} className="opacity-50" />
        <p className="text-xs">Transcript will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto h-full pr-1">
      {merged.map((line, i) => {
        const isAgent = line.role === "assistant";
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                isAgent ? "text-primary" : "text-green-600 dark:text-green-400"
              }`}
            >
              {isAgent ? agentName : line.speaker}
            </span>
            <p className="text-xs text-foreground/80 leading-relaxed">
              {line.text}
            </p>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 5. ELAPSED TIMER - Theme Aware
// ─────────────────────────────────────────────────────────
function ElapsedTimer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <span className="text-xs tabular-nums text-muted-foreground font-mono">
      {mm}:{ss}
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// 6. MAIN COMPONENT
// ─────────────────────────────────────────────────────────
interface CallActiveProps {
  meetingName: string;
  meetingId: string;
}

export function CallActive({ meetingName, meetingId: _meetingId }: CallActiveProps) {
  // Note: meetingId is kept in props for future use (e.g., analytics, debug)
  // Transcript storage is now handled by the agent directly
  const { state, audioTrack } = useVoiceAssistant();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const remoteParticipants = useRemoteParticipants();

  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: true,
  });

  const [ended, setEnded] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [callStartTime] = useState(Date.now());

  // Use the transcript receiver hook (display only - storage is handled by agent)
  const handleTranscriptLine = useCallback((line: TranscriptLine) => {
    setTranscriptLines((prev) => {
      // Deduplicate by index if available
      if (line.index !== undefined) {
        const exists = prev.some((l) => l.index === line.index);
        if (exists) return prev;
      }
      return [...prev, line];
    });
  }, []);

  useTranscriptReceiver(handleTranscriptLine);

  useEffect(() => {
    setIsCameraOn(localParticipant.isCameraEnabled);
    setIsMicOn(localParticipant.isMicrophoneEnabled);
  }, [localParticipant]);

  const toggleCamera = async () => {
    const v = !isCameraOn;
    setIsCameraOn(v);
    await localParticipant.setCameraEnabled(v);
  };

  const toggleMic = async () => {
    const v = !isMicOn;
    setIsMicOn(v);
    await localParticipant.setMicrophoneEnabled(v);
  };

  // Simple leave: No client-side transcript flushing needed anymore
  // Agent handles all transcript storage directly
  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    await room.disconnect();
    setEnded(true);
  };

  // Count human participants (exclude agent)
  const humanCount = useMemo(() => {
    return (
      1 +
      remoteParticipants.filter(
        (p) =>
          p.kind !== ParticipantKind.AGENT &&
          !p.identity.startsWith("agent-")
      ).length
    );
  }, [remoteParticipants]);

  const totalTiles = tracks.length + 1;
  const gridClass = useMemo(() => {
    if (totalTiles === 1) return "grid-cols-1";
    if (totalTiles === 2) return "grid-cols-1 md:grid-cols-2";
    if (totalTiles <= 4) return "grid-cols-2";
    return "grid-cols-2 md:grid-cols-3";
  }, [totalTiles]);

  const callDurationSec = Math.floor((Date.now() - callStartTime) / 1000);

  if (ended || connectionState === ConnectionState.Disconnected) {
    return <CallEnded duration={callDurationSec} participants={humanCount} />;
  }

  return (
    <div className="flex h-screen w-full bg-background text-foreground font-sans overflow-hidden transition-colors">
      {/* Transcript receiver is now handled by useTranscriptReceiver hook */}
      <RoomAudioRenderer />

      {/* MAIN AREA */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* HEADER BAR - Google Meet Style */}
        <header className="flex h-14 items-center justify-between px-4 md:px-6 border-b border-border bg-background/80 backdrop-blur-md z-20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 border border-border">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
                {meetingName}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock size={12} />
                <ElapsedTimer />
              </div>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <Users size={12} />
                <span className="text-xs">{humanCount}</span>
              </div>
            </div>
          </div>

          {/* Transcript toggle */}
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              showTranscript
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground border border-border"
            }`}
          >
            <MessageSquareText size={14} />
            <span className="hidden sm:inline">Transcript</span>
          </button>
        </header>

        {/* VIDEO GRID - Centered Google Meet Style */}
        <main className="flex-1 p-3 md:p-4 pb-28 flex items-center justify-center overflow-hidden bg-muted/30">
          <div
            className={`grid ${gridClass} gap-3 md:gap-4 w-full h-full max-w-6xl auto-rows-fr`}
          >
            {/* Agent tile */}
            <div className="h-full min-h-[200px] md:min-h-[280px]">
              <AgentTile
                state={state}
                audioTrack={audioTrack}
                agentName={meetingName}
              />
            </div>

            {/* Participant tiles */}
            {tracks.map((track) => (
              <div key={track.publication.trackSid} className="h-full min-h-[200px] md:min-h-[280px]">
                <ParticipantTile
                  participant={track.participant}
                  trackRef={track}
                  isLocal={track.participant === localParticipant}
                />
              </div>
            ))}

            {/* Fallback local tile when camera off */}
            {!tracks.find((t) => t.participant === localParticipant) && (
              <div className="h-full min-h-[200px] md:min-h-[280px]">
                <ParticipantTile participant={localParticipant} isLocal />
              </div>
            )}
          </div>
        </main>

        {/* BOTTOM CONTROLS - Floating Google Meet Style */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 rounded-full bg-card/95 p-2 md:p-2.5 shadow-2xl backdrop-blur-xl border border-border">
            <button
              onClick={toggleMic}
              className={`p-3 md:p-3.5 rounded-full transition-all duration-200 ${
                isMicOn
                  ? "bg-muted hover:bg-muted/80 text-foreground"
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }`}
              title={isMicOn ? "Turn off microphone" : "Turn on microphone"}
            >
              {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
            </button>

            <button
              onClick={toggleCamera}
              className={`p-3 md:p-3.5 rounded-full transition-all duration-200 ${
                isCameraOn
                  ? "bg-muted hover:bg-muted/80 text-foreground"
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }`}
              title={isCameraOn ? "Turn off camera" : "Turn on camera"}
            >
              {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>

            <div className="h-8 w-px bg-border" />

            <div className="flex gap-1.5 [&_button]:rounded-full [&_button]:bg-muted [&_button]:p-3 [&_button]:text-foreground hover:[&_button]:bg-muted/80">
              <VoiceAssistantControlBar controls={{ leave: false }} />
            </div>

            <div className="h-8 w-px bg-border" />

            <button
              onClick={handleLeave}
              disabled={leaving}
              className={`p-3 md:p-3.5 rounded-full transition-all duration-200 ${
                leaving
                  ? "bg-destructive/50 text-destructive-foreground/70 cursor-wait"
                  : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              }`}
              title="Leave call"
            >
              {leaving ? (
                <div className="h-5 w-5 border-2 border-destructive-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <PhoneOff size={20} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* TRANSCRIPT SIDEBAR — slides in from right */}
      <div
        className={`border-l border-border bg-background transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${
          showTranscript ? "w-80" : "w-0"
        }`}
      >
        {showTranscript && (
          <div className="flex flex-col h-full w-80">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquareText size={14} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Live Transcript
                </span>
              </div>
              <button
                onClick={() => setShowTranscript(false)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-4">
              <TranscriptPanel
                lines={transcriptLines}
                agentName={meetingName}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
