"use client";

import {
  useVoiceAssistant,
  BarVisualizer,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  AgentState, // <--- Imported this
  useTracks,
  useLocalParticipant,
  useRoomContext,
  useRemoteParticipants,
  useConnectionState,
  useIsSpeaking,
  TrackReference,
} from "@livekit/components-react";
import { Track, RoomEvent, ParticipantKind, ConnectionState, Participant, LocalAudioTrack, RemoteAudioTrack } from "livekit-client";
import { useEffect, useMemo, useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { Video, VideoOff, Mic, MicOff, PhoneOff } from "lucide-react";
import "@livekit/components-styles";
import { CallEnded } from "./call-ended";

// Wrapper to render the actual video element safely
import { VideoTrack as LiveKitVideoTrack } from "@livekit/components-react";

/* ---------------- 1. The Designated Scribe Logic ---------------- */
const TranscriptHandler = ({ meetingId }: { meetingId: string }) => {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const trpc = useTRPC();

  const { mutate: appendTranscript } = useMutation(
    trpc.meetings.appendTranscript.mutationOptions()
  );

  const amIScribe = useMemo(() => {
    if (!localParticipant || !localParticipant.joinedAt) return false;
    const myJoinTime = localParticipant.joinedAt.getTime();

    for (const p of remoteParticipants) {
      if (p.kind === ParticipantKind.AGENT || p.identity.startsWith("agent-")) continue;
      if (!p.joinedAt) continue;
      if (p.joinedAt.getTime() < myJoinTime) return false;
      if (p.joinedAt.getTime() === myJoinTime && p.identity < localParticipant.identity) return false;
    }
    return true;
  }, [localParticipant, remoteParticipants]);

  useEffect(() => {
    if (!room) return;
    const handleData = (payload: Uint8Array) => {
      if (!amIScribe) return;
      const decoder = new TextDecoder();
      try {
        const data = JSON.parse(decoder.decode(payload));
        if (data.type === "transcript_update") {
          appendTranscript({
            meetingId,
            line: {
              role: data.role,
              speaker: data.speaker,
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
    
    // FIX: Explicitly return void to satisfy useEffect cleanup type
    return () => { 
        room.off(RoomEvent.DataReceived, handleData); 
    };
  }, [room, meetingId, appendTranscript, amIScribe]);

  return null;
};

/* ---------------- UI Components ---------------- */

// 1. Participant Tile Component
function CustomParticipantTile({ 
  participant, 
  trackRef, 
  isLocal = false 
}: { 
  participant: Participant, 
  trackRef?: TrackReference,
  isLocal?: boolean 
}) {
  const isSpeaking = useIsSpeaking(participant);
  const [isVideoEnabled, setIsVideoEnabled] = useState(participant.isCameraEnabled);
  const [isMicEnabled, setIsMicEnabled] = useState(participant.isMicrophoneEnabled);

  useEffect(() => {
    const handleUpdate = () => {
      setIsVideoEnabled(participant.isCameraEnabled);
      setIsMicEnabled(participant.isMicrophoneEnabled);
    };
    // Listen to track mute/unmute events
    participant.on(RoomEvent.TrackMuted, handleUpdate);
    participant.on(RoomEvent.TrackUnmuted, handleUpdate);
    
    // Also update immediately in case it changed before listener attached
    handleUpdate();

    return () => {
      participant.off(RoomEvent.TrackMuted, handleUpdate);
      participant.off(RoomEvent.TrackUnmuted, handleUpdate);
    };
  }, [participant]);

  return (
    <div className={`relative group h-full w-full overflow-hidden rounded-2xl bg-neutral-900 border transition-all duration-300 ${
      isSpeaking ? "border-indigo-500 shadow-[0_0_0_2px_rgba(99,102,241,0.5)]" : "border-white/10 shadow-lg"
    }`}>
      
      {/* Video Layer */}
      {trackRef && isVideoEnabled ? (
         <div className={`h-full w-full ${isLocal ? "-scale-x-100" : ""}`}>
            <LiveKitVideoTrack trackRef={trackRef} className="h-full w-full object-cover" />
         </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-800">
           <div className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-700 text-neutral-400 text-xl font-bold">
             {participant.identity?.slice(0, 2).toUpperCase() || "??"}
           </div>
        </div>
      )}

      {/* Overlays */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-100 transition-opacity">
        <div className="flex items-center gap-2">
           {!isMicEnabled && (
             <div className="rounded-full bg-red-500/20 p-1.5 text-red-500">
               <MicOff size={12} />
             </div>
           )}
           <span className="text-xs font-medium text-white drop-shadow-md">
             {isLocal ? "You" : participant.identity}
           </span>
        </div>
      </div>
    </div>
  );
}

// FIX: Updated `state` type from string to AgentState
function AgentTile({ state, audioTrack }: { state: AgentState; audioTrack: TrackReference | undefined }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950/50 to-purple-950/50 border border-indigo-500/20 shadow-2xl flex items-center justify-center">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay"></div>
        
        <div className="relative z-10 flex flex-col items-center gap-6">
           <div className="relative">
              <div className={`absolute -inset-4 rounded-full bg-indigo-500/20 blur-xl transition-all duration-500 ${state === 'speaking' ? 'opacity-100 scale-110' : 'opacity-0 scale-100'}`} />
              <BarVisualizer
                state={state}
                track={audioTrack?.publication?.track as LocalAudioTrack | RemoteAudioTrack}
                barCount={7}
                options={{ minHeight: 40, maxHeight: 120 }}
                className="h-32 w-48 text-indigo-400"
              />
           </div>
           
           <div className="flex flex-col items-center gap-2">
              <h3 className="text-lg font-semibold text-indigo-100">AI Assistant</h3>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/20 border border-white/5 backdrop-blur-sm">
                 <div className={`h-1.5 w-1.5 rounded-full ${state === 'speaking' ? 'bg-indigo-400 animate-pulse' : 'bg-neutral-500'}`} />
                 <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest">
                   {state === 'listening' ? 'Listening' : state === 'speaking' ? 'Speaking' : 'Standby'}
                 </span>
              </div>
           </div>
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
  const connectionState = useConnectionState();

  const tracks = useTracks(
    [Track.Source.Camera, Track.Source.ScreenShare],
    { onlySubscribed: true }
  );

  const [ended, setEnded] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);

  useEffect(() => {
    setIsCameraOn(localParticipant.isCameraEnabled);
    setIsMicOn(localParticipant.isMicrophoneEnabled);
  }, [localParticipant]);

  const toggleCamera = async () => {
    const newVal = !isCameraOn;
    setIsCameraOn(newVal);
    await localParticipant.setCameraEnabled(newVal);
  };

  const toggleMic = async () => {
    const newVal = !isMicOn;
    setIsMicOn(newVal);
    await localParticipant.setMicrophoneEnabled(newVal);
  };

  const handleLeave = async () => {
    await room.disconnect();
    setEnded(true);
  };

  const totalTiles = tracks.length + 1; 
  const gridClass = useMemo(() => {
    if (totalTiles === 1) return "grid-cols-1"; 
    if (totalTiles === 2) return "grid-cols-1 md:grid-cols-2";
    if (totalTiles <= 4) return "grid-cols-2";
    return "grid-cols-2 md:grid-cols-3";
  }, [totalTiles]);

  if (ended || connectionState === ConnectionState.Disconnected) return <CallEnded />;

  return (
    <div className="flex h-screen w-full flex-col bg-neutral-950 text-white font-sans overflow-hidden">
      
      <TranscriptHandler meetingId={meetingId} />
      <RoomAudioRenderer />

      {/* HEADER */}
      <header className="absolute top-0 left-0 right-0 z-50 flex h-16 items-center justify-between px-6 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
         <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-neutral-900/40 px-4 py-2 backdrop-blur-md border border-white/5">
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-sm font-medium tracking-wide text-neutral-200">{meetingName}</span>
            <div className="h-4 w-px bg-white/10 mx-1" />
            <span className="text-xs text-neutral-400">{String(totalTiles)} People</span>
         </div>
      </header>

      {/* MAIN GRID */}
      <main className="flex-1 p-4 pt-20 pb-24 flex items-center justify-center">
         <div className={`grid ${gridClass} gap-4 w-full h-full max-w-7xl auto-rows-fr`}>
            
            {/* 1. AGENT TILE */}
            <div className="h-full min-h-[300px]">
               <AgentTile state={state} audioTrack={audioTrack} />
            </div>

            {/* 2. REMOTE & LOCAL PARTICIPANTS */}
            {tracks.map((track) => (
              <div key={track.publication.trackSid} className="h-full min-h-[300px]">
                 <CustomParticipantTile 
                    participant={track.participant} 
                    trackRef={track} 
                    isLocal={track.participant === localParticipant}
                 />
              </div>
            ))}
            
            {/* Fallback Local Tile (if camera is off but mic is on, track might not be in 'useTracks' list yet depending on subscription) */}
            {!tracks.find(t => t.participant === localParticipant) && (
               <div className="h-full min-h-[300px]">
                  <CustomParticipantTile participant={localParticipant} isLocal={true} />
               </div>
            )}
         </div>
      </main>

      {/* FOOTER: Controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
         <div className="flex items-center gap-3 rounded-2xl bg-neutral-900/90 p-3 shadow-2xl backdrop-blur-xl border border-white/10">
            
            <button 
               onClick={toggleMic}
               className={`p-4 rounded-xl transition-all duration-200 ${isMicOn ? 'bg-neutral-800 hover:bg-neutral-700 text-white' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
               title="Toggle Microphone"
            >
               {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
            </button>

            <button 
               onClick={toggleCamera}
               className={`p-4 rounded-xl transition-all duration-200 ${isCameraOn ? 'bg-neutral-800 hover:bg-neutral-700 text-white' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
               title="Toggle Camera"
            >
               {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>

            <div className="h-8 w-px bg-white/10 mx-1" />

            <div className="flex gap-2">
                <VoiceAssistantControlBar controls={{ leave: false }} />
            </div>

            <div className="h-8 w-px bg-white/10 mx-1" />

            <button 
               onClick={handleLeave}
               className="bg-red-600 hover:bg-red-700 text-white p-4 rounded-xl transition-colors"
               title="Leave Call"
            >
               <PhoneOff size={20} />
            </button>
         </div>
      </div>
    </div>
  );
}