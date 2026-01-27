"use client"

import { Button } from "@/components/ui/button"
import { usePersistentUserChoices } from "@livekit/components-react"
import { LogInIcon, Video, VideoOff, Mic, MicOff, X } from "lucide-react"
import { useEffect, useState, useRef } from "react"
import { createLocalVideoTrack, createLocalAudioTrack, LocalVideoTrack, LocalAudioTrack } from "livekit-client"
import Link from "next/link"

import { ParticipantTile } from "@livekit/components-react";

interface Props {
    onJoin: () => void

}
export const CallLobby = ({ onJoin }: Props) => {

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [cameraOn, setCameraOn] = useState(true);
    const audioStreamRef = useRef<MediaStream | null>(null);
    const [micOn, setMicOn] = useState(true);

    useEffect(() => {
        startCamera();
        return stopCamera;
    }, []);

    async function startCamera() {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;

        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }

    async function startMic() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;
    }


    function stopCamera() {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }

    function stopMic() {
        audioStreamRef.current?.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
    }


    async function toggleCamera() {
        if (cameraOn) {
            stopCamera();
            setCameraOn(false);
        } else {
            await startCamera();
            setCameraOn(true);
        }
    }
    async function toggleMic() {
        if (micOn) {
            stopMic();
            setMicOn(false);
        } else {
            await startMic();
            setMicOn(true);
        }
    }




    return (
        <div className="flex h-screen w-full items-center justify-center bg-neutral-950">
            <div className="flex w-full max-w-5xl gap-8 rounded-2xl bg-neutral-900 p-8 shadow-xl">
                {/* Video Preview */}
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                    />

                    {!cameraOn && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-neutral-300">
                            Camera is off
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex w-72 flex-col justify-between">
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-white">
                            Ready to join?
                        </h2>

                        <p className="text-sm text-neutral-400">
                            Configure your mic and camera before entering the call.
                        </p>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={toggleMic}
                                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition
                                    ${micOn
                                        ? "bg-neutral-800 text-white hover:bg-neutral-700"
                                        : "bg-red-600/90 text-white hover:bg-red-600"
                                    }`}
                            >
                                {micOn ? "Mute Mic" : "Mic Off"}
                            </button>

                            <button
                                onClick={toggleCamera}
                                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition
                                    ${cameraOn
                                        ? "bg-neutral-800 text-white hover:bg-neutral-700"
                                        : "bg-red-600/90 text-white hover:bg-red-600"
                                    }`}
                            >
                                {cameraOn ? "Camera On" : "Camera Off"}
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={onJoin}
                        className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
                    >
                        Join Call
                    </button>
                </div>
            </div>
        </div>

    );

};