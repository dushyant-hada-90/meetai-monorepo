"use client";

import {
  useVoiceAssistant,
  BarVisualizer,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  useTracks,
  ParticipantTile,
  useLocalParticipant,
  useRoomContext,
  useRemoteParticipants, // <--- 1. Import this
} from "@livekit/components-react";
import { Track, RoomEvent, ParticipantKind } from "livekit-client";
import { useEffect, useMemo, useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { Video, VideoOff, LogOut } from "lucide-react";
import "@livekit/components-styles";
import { CallEnded } from "./call-ended";

/* ---------------- 1. The Designated Scribe Logic ---------------- */
const TranscriptHandler = ({ meetingId }: { meetingId: string }) => {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants(); // Get list of others
  const trpc = useTRPC();

  // tRPC Mutation
  const { mutate: appendTranscript } = useMutation(
    trpc.meetings.appendTranscript.mutationOptions()
  );

  // --- LEADER ELECTION ALGORITHM ---
  // Calculates if "I" am the designated scribe (the oldest human participant)
  const amIScribe = useMemo(() => {
    if (!localParticipant || !localParticipant.joinedAt) return false;

    const myJoinTime = localParticipant.joinedAt.getTime();

    // Check against every other participant in the room
    for (const p of remoteParticipants) {
      // 1. Ignore the Agent (we don't want to compete with the bot)
      if (p.kind === ParticipantKind.AGENT || p.identity.startsWith("agent-")) {
        continue;
      }

      // 2. Ignore participants who haven't fully joined/synced time yet
      if (!p.joinedAt) continue;

      // 3. The Core Check: Is someone else OLDER than me?
      // If yes, I am NOT the scribe. I defer to them.
      if (p.joinedAt.getTime() < myJoinTime) {
        return false;
      }

      // Tie-breaker: If timestamps are identical (rare), use Identity string sorting
      if (p.joinedAt.getTime() === myJoinTime && p.identity < localParticipant.identity) {
        return false;
      }
    }

    // If we survived the loop, we are the oldest human. We are the Scribe.
    return true;
  }, [localParticipant, remoteParticipants]);

  // Debugging helper (Visible in Console)
  useEffect(() => {
    // console.log(`[Scribe Status] Role: ${amIScribe ? "👑 SCRIBE (Active)" : "👁️ VIEWER (Passive)"}`);
  }, [amIScribe]);

  useEffect(() => {
    if (!room) return;

    const handleData = (payload: Uint8Array) => {
      // 1. GATEKEEPER: If I'm not the scribe, I ignore the save responsibility.
      if (!amIScribe) return;

      const decoder = new TextDecoder();
      try {
        const data = JSON.parse(decoder.decode(payload));
        if (data.type === "transcript_update") {
          // console.log("👑 Scribe saving line:", data);

          appendTranscript({
            meetingId,
            line: {
              role: data.role,       // "human" | "assistant"
              speaker: data.speaker, // The AgentId or UserId from the data packet
              text: data.text,
              timestamp: data.timestamp,
            },
          });
        }
      } catch (e) {
        console.error("Failed to parse data packet", e);
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, meetingId, appendTranscript, amIScribe]); // Re-binds listener if scribe status changes

  return null;
};

/* ---------------- UI Components (Unchanged) ---------------- */
function AgentStatus({ state }: { state: string }) {
  const config = {
    initializing: { label: "Initializing…", color: "bg-yellow-400" },
    listening: { label: "Listening", color: "bg-blue-400" },
    speaking: { label: "Speaking", color: "bg-emerald-500" },
    thinking: { label: "Thinking", color: "bg-purple-400" },
  } as const;
  const current = config[state as keyof typeof config] ?? config.initializing;
  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800 border border-white/10 shadow-sm">
      <span className={`h-2 w-2 rounded-full ${current.color} ${state === "speaking" ? "animate-pulse" : ""}`} />
      <span className="text-xs font-medium text-neutral-300 uppercase tracking-wider">{current.label}</span>
    </div>
  );
}

function TileWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl overflow-hidden bg-neutral-900 border border-white/5 flex items-center justify-center w-full h-full shadow-2xl">
      <div className="w-full h-full flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

/* ---------------- Main Component ---------------- */
interface CallActiveProps {
  meetingName: string;
  meetingId: string;
}

export function CallActive({ meetingName, meetingId }: CallActiveProps) {
  const { state, audioTrack } = useVoiceAssistant();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  const tracks = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: true }
  );

  const [ended, setEnded] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const totalTiles = tracks.length + 1;
  const gridClass = useMemo(() => {
    if (totalTiles === 1) return "grid-cols-1 max-w-3xl";
    if (totalTiles === 2) return "grid-cols-1 md:grid-cols-2 max-w-6xl";
    return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-7xl";
  }, [totalTiles]);

  const toggleCamera = async () => {
    const next = !cameraEnabled;
    await localParticipant.setCameraEnabled(next);
    setCameraEnabled(next);
  };

  const handleLeave = async () => {
    await room.disconnect();
    setEnded(true);
  };

  if (ended) return <CallEnded />;

  return (
    <div className="h-screen w-full bg-neutral-950 text-white flex flex-col overflow-hidden font-sans">

      {/* --- INVISIBLE LOGIC --- */}
      {/* 2. Insert the Scribe Logic here */}
      <TranscriptHandler meetingId={meetingId} />
      <RoomAudioRenderer />

      {/* HEADER */}
      <header className="h-16 flex-none flex items-center justify-between px-6 border-b border-white/10 bg-neutral-900/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <h1 className="text-sm font-medium tracking-wide text-neutral-400 uppercase">{meetingName}</h1>
        </div>
        <button
          onClick={handleLeave}
          className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 transition-all duration-200"
        >
          <LogOut size={16} />
          <span className="text-sm font-semibold">End Session</span>
        </button>
      </header>

      {/* MAIN GRID */}
      <main className="flex-1 p-4 md:p-6 flex flex-col items-center justify-center w-full">
        <div className={`grid ${gridClass} gap-6 w-full h-full max-h-[800px]`}>
          {/* AGENT TILE */}
          <TileWrapper>
            <div className="flex flex-col items-center justify-center h-full w-full bg-gradient-to-b from-neutral-800/30 to-neutral-900/30">
              <div className="relative">
                <BarVisualizer
                  state={state}
                  track={audioTrack}
                  barCount={5}
                  options={{ minHeight: 24, maxHeight: 80 }}
                  className="h-48 w-64 text-emerald-400"
                />
                <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full -z-10" />
              </div>
              <div className="flex flex-col items-center gap-4 mt-8">
                <AgentStatus state={state} />
              </div>
            </div>
          </TileWrapper>

          {/* HUMAN TILES */}
          {tracks.map((track) => (
            <TileWrapper key={`${track.participant.identity}-${track.source}`}>
              <ParticipantTile trackRef={track} className="w-full h-full object-cover rounded-xl" />
            </TileWrapper>
          ))}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="h-24 flex-none flex items-center justify-center gap-4 border-t border-white/10 bg-neutral-900/80 backdrop-blur-lg pb-4">
        <button
          onClick={toggleCamera}
          className={`flex items-center justify-center h-12 w-12 rounded-full border transition-all duration-200 ${cameraEnabled
            ? "bg-neutral-800 border-white/10 hover:bg-neutral-700 text-white"
            : "bg-rose-500/20 border-rose-500/50 text-rose-500"
            }`}
        >
          {cameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </button>
        <div className="bg-neutral-800/50 rounded-full px-4 py-2 border border-white/5 flex items-center gap-2">
          <VoiceAssistantControlBar controls={{ leave: false }} />
        </div>
      </footer>
    </div>
  );
}