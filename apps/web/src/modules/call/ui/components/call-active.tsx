"use client";

import {
  useVoiceAssistant,
  BarVisualizer,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  useTracks,
  ParticipantTile,
  useLocalParticipant,
  useRoomContext, // <--- 1. Import this
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useMemo, useState, useEffect } from "react";
import "@livekit/components-styles";
import { CallEnded } from "./call-ended";

/* ---------------- Agent Status ---------------- */

function AgentStatus({ state }: { state: string }) {
  const config = {
    initializing: { label: "Initializing…", color: "bg-yellow-400" },
    listening: { label: "Listening", color: "bg-blue-400" },
    speaking: { label: "Speaking", color: "bg-emerald-500" },
    thinking: { label: "Thinking", color: "bg-purple-400" },
  } as const;

  const current =
    config[state as keyof typeof config] ?? config.initializing;

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
      <span
        className={`h-2 w-2 rounded-full ${current.color} ${state === "speaking" ? "animate-pulse" : ""
          }`}
      />
      <span className="text-xs text-neutral-300">{current.label}</span>
    </div>
  );
}

/* ---------------- Transcript Panel ---------------- */

// todo

/* ---------------- Main Component ---------------- */

export function CallActive({ meetingName }: { meetingName: string }) {
  const { state, audioTrack, } = useVoiceAssistant();
  const room = useRoomContext()
  

  const { localParticipant } = useLocalParticipant();

  const tracks = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: true }
  );

  const [ended, setEnded] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const totalTiles = tracks.length + 1; // + agent

  const gridClass = useMemo(() => {
    if (totalTiles === 1) return "grid-cols-1";
    if (totalTiles === 2) return "grid-cols-2";
    if (totalTiles === 3) return "grid-cols-2 grid-rows-2";
    return "grid-cols-2 grid-rows-2";
  }, [totalTiles]);

  const toggleCamera = async () => {
    const next = !cameraEnabled;
    await localParticipant.setCameraEnabled(next);
    setCameraEnabled(next);
  };

  const handleLeave = async () => {
    await room.disconnect(); // Actually closes the connection
    setEnded(true);          // Updates the UI
  };

  if (ended) return <CallEnded />;

  return (
    <div className="h-screen w-full bg-black text-white flex flex-col overflow-hidden">

      {/* HEADER */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-white/10 bg-neutral-950/80">
        <h1 className="text-lg font-semibold">{meetingName}</h1>

        <div className="flex items-center gap-3">
          

          <button
            onClick={handleLeave}
            className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 font-medium"
          >
            Leave
          </button>
        </div>
      </header>

      {/* GRID */}
      <main className="flex-1 p-4">
        <div className={`grid ${gridClass} gap-4 h-full`}>
          {/* AGENT TILE */}
          <TileWrapper>
            <div className="flex flex-col items-center justify-center h-full">
              <BarVisualizer
                state={state}
                trackRef={audioTrack}
                barCount={7}
                options={{ minHeight: 16, maxHeight: 80 }}
                className="h-32 w-48"
              />
              <div className="flex flex-col items-center gap-3 mt-3">
                <span className="text-sm text-neutral-400">AI Agent</span>
                <AgentStatus state={state} />
              </div>
            </div>
          </TileWrapper>

          {/* HUMAN TILES */}
          {tracks.map((track) => (
            <TileWrapper
              key={`${track.participant.identity}-${track.source}`}
            >
              <ParticipantTile trackRef={track} />
            </TileWrapper>
          ))}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="h-20 flex items-center justify-center gap-4 border-t border-white/10 bg-neutral-950">
        <button
          onClick={toggleCamera}
          className={`px-4 py-2 rounded-md border text-sm font-medium transition ${cameraEnabled
            ? "bg-neutral-800 border-white/10 hover:bg-neutral-700"
            : "bg-rose-600 border-rose-500 hover:bg-rose-700"
            }`}
        >
          {cameraEnabled ? "Camera On" : "Camera Off"}
        </button>

        <VoiceAssistantControlBar controls={{ leave: false }} />
      </footer>

  


      <RoomAudioRenderer />
    </div>
  );
}

/* ---------------- Tile Wrapper ---------------- */

function TileWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-xl overflow-hidden bg-neutral-900 border border-white/10 flex items-center justify-center">
      <div className="w-full h-full aspect-video flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
