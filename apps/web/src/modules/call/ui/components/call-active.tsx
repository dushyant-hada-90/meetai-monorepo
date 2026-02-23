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
  forwardRef,
  useImperativeHandle,
} from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
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
}

interface TranscriptHandlerRef {
  flush: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────
// 1. TRANSCRIPT HANDLER — Buffered + Flush-before-leave
//    The "scribe" (earliest-joined human) buffers incoming
//    DataChannel messages and flushes them to the DB in bulk.
//    On leave, the parent calls flush() before disconnecting.
//    As a safety net, beforeunload uses sendBeacon to a REST
//    endpoint so nothing is lost on tab close.
// ─────────────────────────────────────────────────────────
const TranscriptHandler = forwardRef<
  TranscriptHandlerRef,
  {
    meetingId: string;
    onTranscriptLine?: (line: TranscriptLine) => void;
  }
>(({ meetingId, onTranscriptLine }, ref) => {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const trpc = useTRPC();

  const { mutateAsync: bulkAppend } = useMutation(
    trpc.meetings.bulkAppendTranscript.mutationOptions()
  );

  // Buffer for pending transcript lines
  const bufferRef = useRef<TranscriptLine[]>([]);
  const flushingRef = useRef(false);

  // Am I the designated scribe? (earliest-joined human)
  const amIScribe = useMemo(() => {
    if (!localParticipant || !localParticipant.joinedAt) return false;
    const myJoinTime = localParticipant.joinedAt.getTime();

    for (const p of remoteParticipants) {
      if (p.kind === ParticipantKind.AGENT || p.identity.startsWith("agent-"))
        continue;
      if (!p.joinedAt) continue;
      if (p.joinedAt.getTime() < myJoinTime) return false;
      if (
        p.joinedAt.getTime() === myJoinTime &&
        p.identity < localParticipant.identity
      )
        return false;
    }
    return true;
  }, [localParticipant, remoteParticipants]);

  // Flush buffer to DB
  const flush = useCallback(async () => {
    if (flushingRef.current || bufferRef.current.length === 0) return;
    flushingRef.current = true;

    const lines = [...bufferRef.current];
    bufferRef.current = [];

    try {
      await bulkAppend({ meetingId, lines });
    } catch (e) {
      // Put them back if flush failed
      bufferRef.current = [...lines, ...bufferRef.current];
      console.error("Transcript flush failed:", e);
    } finally {
      flushingRef.current = false;
    }
  }, [bulkAppend, meetingId]);

  // Expose flush to parent
  useImperativeHandle(ref, () => ({ flush }), [flush]);

  // Periodic flush every 5 seconds
  useEffect(() => {
    if (!amIScribe) return;
    const interval = setInterval(() => {
      flush();
    }, 5000);
    return () => clearInterval(interval);
  }, [amIScribe, flush]);

  // Listen for DataChannel transcript messages
  useEffect(() => {
    if (!room) return;

    const handleData = (payload: Uint8Array) => {
      const decoder = new TextDecoder();
      try {
        const data = JSON.parse(decoder.decode(payload));
        if (data.type === "transcript_update") {
          const line: TranscriptLine = {
            role: data.role,
            speaker: data.speaker,
            text: data.text,
            timestamp: data.timestamp,
            index: data.index,
          };

          // Always update the live UI
          onTranscriptLine?.(line);

          // Only the scribe buffers for DB persistence
          if (amIScribe) {
            bufferRef.current.push({
              role: line.role,
              speaker: line.speaker,
              text: line.text,
              timestamp: line.timestamp,
            });
          }
        }
      } catch (e) {
        console.error("Failed to parse data packet", e);
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, amIScribe, onTranscriptLine]);

  // Safety net: beforeunload → sendBeacon to REST endpoint
  useEffect(() => {
    if (!amIScribe) return;

    const handleBeforeUnload = () => {
      if (bufferRef.current.length === 0) return;

      const payload = JSON.stringify({
        meetingId,
        lines: bufferRef.current.map((l) => ({
          role: l.role,
          speaker: l.speaker,
          text: l.text,
          timestamp: l.timestamp,
        })),
      });

      navigator.sendBeacon(
        "/api/transcript",
        new Blob([payload], { type: "application/json" })
      );
      bufferRef.current = [];
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [amIScribe, meetingId]);

  return null;
});

TranscriptHandler.displayName = "TranscriptHandler";

// ─────────────────────────────────────────────────────────
// 2. PARTICIPANT TILE
// ─────────────────────────────────────────────────────────
function ParticipantTile({
  participant,
  trackRef,
  isLocal = false,
}: {
  participant: Participant;
  trackRef?: TrackReference;
  isLocal?: boolean;
}) {
  const isSpeaking = useIsSpeaking(participant);
  const [isVideoEnabled, setIsVideoEnabled] = useState(
    participant.isCameraEnabled
  );
  const [isMicEnabled, setIsMicEnabled] = useState(
    participant.isMicrophoneEnabled
  );

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
      className={`relative group h-full w-full overflow-hidden rounded-2xl bg-neutral-900 transition-all duration-300 ${
        isSpeaking
          ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-neutral-950"
          : "ring-1 ring-white/10"
      }`}
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
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white text-xl font-bold shadow-lg">
            {initials}
          </div>
        </div>
      )}

      {/* Bottom overlay */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
        <div className="flex items-center gap-2">
          {!isMicEnabled && (
            <div className="rounded-full bg-red-500/20 p-1 text-red-400">
              <MicOff size={11} />
            </div>
          )}
          {isSpeaking && isMicEnabled && (
            <div className="flex items-end gap-0.5 h-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-0.5 bg-indigo-400 rounded-full animate-pulse"
                  style={{
                    height: `${40 + i * 20}%`,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
            </div>
          )}
          <span className="text-xs font-medium text-white/90 truncate">
            {isLocal ? "You" : participant.name || participant.identity}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 3. AGENT TILE
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
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950/60 to-purple-950/60 ring-1 ring-indigo-500/20 flex items-center justify-center">
      {/* Glow effect when speaking */}
      <div
        className={`absolute inset-0 bg-indigo-500/5 transition-opacity duration-500 ${
          state === "speaking" ? "opacity-100" : "opacity-0"
        }`}
      />

      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="relative">
          <div
            className={`absolute -inset-6 rounded-full bg-indigo-500/15 blur-2xl transition-all duration-500 ${
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
            className="h-28 w-44 text-indigo-400"
          />
        </div>

        <div className="flex flex-col items-center gap-2">
          <h3 className="text-base font-semibold text-indigo-100">
            {agentName}
          </h3>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/30 border border-white/5">
            <div
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                state === "speaking"
                  ? "bg-indigo-400 animate-pulse"
                  : state === "listening"
                  ? "bg-emerald-400"
                  : "bg-neutral-500"
              }`}
            />
            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest">
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
// 4. LIVE TRANSCRIPT PANEL (sidebar)
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
      <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-2">
        <MessageSquareText size={24} className="opacity-50" />
        <p className="text-xs">Transcript will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto h-full pr-1 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
      {merged.map((line, i) => {
        const isAgent = line.role === "assistant";
        return (
          <div key={i} className="flex flex-col gap-0.5">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                isAgent ? "text-indigo-400" : "text-emerald-400"
              }`}
            >
              {isAgent ? agentName : line.speaker}
            </span>
            <p className="text-xs text-neutral-300 leading-relaxed">
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
// 5. ELAPSED TIMER
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
    <span className="text-xs tabular-nums text-neutral-400 font-mono">
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

export function CallActive({ meetingName, meetingId }: CallActiveProps) {
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

  const transcriptRef = useRef<TranscriptHandlerRef>(null);

  useEffect(() => {
    setIsCameraOn(localParticipant.isCameraEnabled);
    setIsMicOn(localParticipant.isMicrophoneEnabled);
  }, [localParticipant]);

  const handleTranscriptLine = useCallback((line: TranscriptLine) => {
    setTranscriptLines((prev) => [...prev, line]);
  }, []);

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

  // Graceful leave: flush transcript buffer BEFORE disconnecting
  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);

    try {
      // Flush any pending transcript lines before disconnecting
      await transcriptRef.current?.flush();
    } catch (e) {
      console.error("Flush before leave failed:", e);
    }

    // Small delay so the last batch arrives at the server
    await new Promise((r) => setTimeout(r, 300));
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
    return <CallEnded duration={callDurationSec} participants={humanCount} meetingId={meetingId} />;
  }

  return (
    <div className="flex h-screen w-full bg-neutral-950 text-white font-sans overflow-hidden">
      {/* Invisible transcript handler */}
      <TranscriptHandler
        ref={transcriptRef}
        meetingId={meetingId}
        onTranscriptLine={handleTranscriptLine}
      />
      <RoomAudioRenderer />

      {/* MAIN AREA */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* HEADER BAR */}
        <header className="flex h-14 items-center justify-between px-5 border-b border-white/5 bg-neutral-950/80 backdrop-blur-md z-20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-neutral-900/60 px-3 py-1.5 border border-white/5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-sm font-medium text-neutral-200 truncate max-w-[200px]">
                {meetingName}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-neutral-500">
              <div className="flex items-center gap-1.5">
                <Clock size={12} />
                <ElapsedTimer />
              </div>
              <div className="h-3 w-px bg-white/10" />
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
                ? "bg-indigo-600 text-white"
                : "bg-neutral-900/60 text-neutral-400 hover:text-white border border-white/5"
            }`}
          >
            <MessageSquareText size={14} />
            <span className="hidden sm:inline">Transcript</span>
            {transcriptLines.length > 0 && (
              <span
                className={`flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold ${
                  showTranscript
                    ? "bg-white/20 text-white"
                    : "bg-indigo-500/20 text-indigo-400"
                }`}
              >
                {transcriptLines.length}
              </span>
            )}
          </button>
        </header>

        {/* VIDEO GRID */}
        <main className="flex-1 p-3 pb-24 flex items-center justify-center overflow-hidden">
          <div
            className={`grid ${gridClass} gap-3 w-full h-full max-w-6xl auto-rows-fr`}
          >
            {/* Agent tile */}
            <div className="h-full min-h-[240px]">
              <AgentTile
                state={state}
                audioTrack={audioTrack}
                agentName={meetingName}
              />
            </div>

            {/* Participant tiles */}
            {tracks.map((track) => (
              <div key={track.publication.trackSid} className="h-full min-h-[240px]">
                <ParticipantTile
                  participant={track.participant}
                  trackRef={track}
                  isLocal={track.participant === localParticipant}
                />
              </div>
            ))}

            {/* Fallback local tile when camera off */}
            {!tracks.find((t) => t.participant === localParticipant) && (
              <div className="h-full min-h-[240px]">
                <ParticipantTile participant={localParticipant} isLocal />
              </div>
            )}
          </div>
        </main>

        {/* BOTTOM CONTROLS */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 rounded-2xl bg-neutral-900/90 p-2.5 shadow-2xl backdrop-blur-xl border border-white/10">
            <button
              onClick={toggleMic}
              className={`p-3.5 rounded-xl transition-all duration-200 ${
                isMicOn
                  ? "bg-neutral-800 hover:bg-neutral-700 text-white"
                  : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              }`}
              title="Toggle Microphone"
            >
              {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>

            <button
              onClick={toggleCamera}
              className={`p-3.5 rounded-xl transition-all duration-200 ${
                isCameraOn
                  ? "bg-neutral-800 hover:bg-neutral-700 text-white"
                  : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              }`}
              title="Toggle Camera"
            >
              {isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
            </button>

            <div className="h-8 w-px bg-white/10" />

            <div className="flex gap-1.5">
              <VoiceAssistantControlBar controls={{ leave: false }} />
            </div>

            <div className="h-8 w-px bg-white/10" />

            <button
              onClick={handleLeave}
              disabled={leaving}
              className={`p-3.5 rounded-xl transition-all duration-200 ${
                leaving
                  ? "bg-red-900/50 text-red-300 cursor-wait"
                  : "bg-red-600 hover:bg-red-500 text-white"
              }`}
              title="Leave Call"
            >
              {leaving ? (
                <div className="h-[18px] w-[18px] border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
              ) : (
                <PhoneOff size={18} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* TRANSCRIPT SIDEBAR — slides in from right */}
      <div
        className={`border-l border-white/5 bg-neutral-950 transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${
          showTranscript ? "w-80" : "w-0"
        }`}
      >
        {showTranscript && (
          <div className="flex flex-col h-full w-80">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquareText size={14} className="text-indigo-400" />
                <span className="text-sm font-semibold text-neutral-200">
                  Live Transcript
                </span>
              </div>
              <button
                onClick={() => setShowTranscript(false)}
                className="p-1 rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-white transition-colors"
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
