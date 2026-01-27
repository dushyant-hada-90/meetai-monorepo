"use client"

import { Button } from "@/components/ui/button"
import { usePersistentUserChoices } from "@livekit/components-react"
import { LogInIcon, Video, VideoOff, Mic, MicOff, X } from "lucide-react"
import { useEffect, useState, useRef } from "react"
import { createLocalVideoTrack, createLocalAudioTrack, LocalVideoTrack, LocalAudioTrack } from "livekit-client"
import Link from "next/link"

import { ParticipantTile } from "@livekit/components-react";

interface Props {
    onJoin: (opts: { audio: boolean; video: boolean }) => void

}
export const CallLobby = ({ onJoin }: Props) => {

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [cameraOn, setCameraOn] = useState(true);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const audioStreamRef = useRef<MediaStream | null>(null);
    const [micOn, setMicOn] = useState(true);
    const [micError, setMicError] = useState<string | null>(null);

    useEffect(() => {
        startCamera();
        return stopCamera;
    }, []);

    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            setCameraError(null);
            setCameraOn(true);
        } catch (err: any) {
            console.error("startCamera error:", err);
            if (err && err.name === 'NotAllowedError') {
                setCameraError('Camera access was denied. Please allow camera permissions.');
            } else if (err && err.name === 'NotFoundError') {
                setCameraError('No camera device found.');
            } else {
                setCameraError('Unable to access camera.');
            }
            setCameraOn(false);
        }
    }

    async function startMic() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioStreamRef.current = stream;
            setMicError(null);
            setMicOn(true);
        } catch (err: any) {
            console.error("startMic error:", err);
            if (err && err.name === 'NotAllowedError') {
                setMicError('Microphone access was denied. Please allow microphone permissions.');
            } else if (err && err.name === 'NotFoundError') {
                setMicError('No microphone device found.');
            } else {
                setMicError('Unable to access microphone.');
            }
            setMicOn(false);
        }
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
        }
    }
    async function toggleMic() {
        if (micOn) {
            stopMic();
            setMicOn(false);
        } else {
            await startMic();
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

                    {!cameraOn && !cameraError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-neutral-300">
                            Camera is off
                        </div>
                    )}

                    {cameraError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-center px-4">
                            <div className="text-sm text-red-400">{cameraError}</div>
                            <div className="flex gap-2">
                                <button
                                    onClick={startCamera}
                                    className="rounded bg-neutral-800 px-3 py-1 text-sm text-white hover:bg-neutral-700"
                                >
                                    Retry
                                </button>
                                <button
                                    onClick={() => setCameraError(null)}
                                    className="rounded bg-neutral-700 px-3 py-1 text-sm text-white hover:bg-neutral-600"
                                >
                                    Dismiss
                                </button>
                            </div>
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

                            {micError && (
                                <div className="w-full text-xs text-red-400">{micError}</div>
                            )}
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
                        onClick={() => onJoin({ audio: micOn, video: cameraOn })}
                        className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
                    >
                        Join Call
                    </button>
                </div>
            </div>
        </div>

    );

};