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
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useMemo, useState, useEffect, useRef } from "react";
import "@livekit/components-styles";
import { CallEnded } from "./call-ended";
import { useDataChannel } from '@livekit/components-react';
// import { useTRPC } from "@/trpc/client"; // Keep if you use it

/* ---------------- Agent Status ---------------- */
function AgentStatus({ state }: { state: string }) {
  const config = {
    initializing: { label: "Initializing…", color: "bg-yellow-400" },
    listening: { label: "Listening", color: "bg-blue-400" },
    speaking: { label: "Speaking", color: "bg-emerald-500" },
    thinking: { label: "Thinking", color: "bg-purple-400" },
  } as const;

  const current = config[state as keyof typeof config] ?? config.initializing;

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
      <span
        className={`h-2 w-2 rounded-full ${current.color} ${state === "speaking" ? "animate-pulse" : ""}`}
      />
      <span className="text-xs text-neutral-300">{current.label}</span>
    </div>
  );
}

/* ---------------- Tile Wrapper ---------------- */
function TileWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-xl overflow-hidden bg-neutral-900 border border-white/10 flex items-center justify-center w-full h-full">
      <div className="w-full h-full aspect-video flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

/* ---------------- Main Component ---------------- */
export function CallActive({ meetingName }: { meetingName: string }) {
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
    if (totalTiles === 1) return "grid-cols-1";
    if (totalTiles === 2) return "grid-cols-2";
    return "grid-cols-2 grid-rows-2";
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
      
      {/* HEADER */}
      <header className="h-16 flex-none flex items-center justify-between px-6 border-b border-white/10 bg-neutral-900">
        <h1 className="text-lg font-semibold tracking-wide">{meetingName}</h1>
        <button
          onClick={handleLeave}
          className="px-4 py-2 rounded-md bg-red-600/90 hover:bg-red-600 text-sm font-medium transition-colors"
        >
          Leave Call
        </button>
      </header>

      {/* MIDDLE CONTENT AREA (Flex Row) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT: Video Grid */}
        <main className="flex-1 p-4 flex flex-col justify-center">
          <div className={`grid ${gridClass} gap-4 w-full h-full max-h-[800px] mx-auto`}>
            
            {/* AGENT TILE */}
            <TileWrapper>
              <div className="flex flex-col items-center justify-center h-full w-full bg-neutral-800/50">
                <BarVisualizer
                  state={state}
                  track={audioTrack}
                  barCount={7}
                  options={{ minHeight: 20, maxHeight: 80 }}
                  className="h-32 w-48"
                />
                <div className="flex flex-col items-center gap-3 mt-4">
                  <span className="text-sm font-medium text-neutral-400">AI Agent</span>
                  <AgentStatus state={state} />
                </div>
              </div>
            </TileWrapper>

            {/* HUMAN TILES */}
            {tracks.map((track) => (
              <TileWrapper key={`${track.participant.identity}-${track.source}`}>
                <ParticipantTile trackRef={track} className="w-full h-full object-cover" />
              </TileWrapper>
            ))}
          </div>
        </main>

        
      </div>

      {/* FOOTER */}
      <footer className="h-20 flex-none flex items-center justify-center gap-4 border-t border-white/10 bg-neutral-900">
        <button
          onClick={toggleCamera}
          className={`px-4 py-2 rounded-md border text-sm font-medium transition-all ${
            cameraEnabled
              ? "bg-neutral-800 border-white/10 hover:bg-neutral-700 text-white"
              : "bg-rose-600 border-rose-500 hover:bg-rose-700 text-white"
          }`}
        >
          {cameraEnabled ? "Turn Camera Off" : "Turn Camera On"}
        </button>
        <VoiceAssistantControlBar controls={{ leave: false }} />
      </footer>

      <RoomAudioRenderer />
    </div>
  );
}