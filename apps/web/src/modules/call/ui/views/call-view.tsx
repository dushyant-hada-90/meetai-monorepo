"use client"
import { ErrorState } from "@/components/error-state"
import { useTRPC } from "@/trpc/client"
import { useMutation, useSuspenseQuery } from "@tanstack/react-query"
import { LiveKitRoom } from "@livekit/components-react"
import { CallLobby } from "../components/call-lobby"
import { CallActive } from "../components/call-active"
import { useEffect, useState } from "react"

interface Props {
    meetingId: string
}

export const CallView = ({ meetingId }: Props) => {
    const [joined, setJoined] = useState<boolean>(false)
    const [audioOn, setAudioOn] = useState<boolean>(false)
    const [videoOn, setVideoOn] = useState<boolean>(false)
    const [token, setToken] = useState<string>("");

    const trpc = useTRPC()
    const { data } = useSuspenseQuery(trpc.meetings.getOne.queryOptions(
        { id: meetingId }
    ))

    const meetingEnded = data.status === "completed";

    const { mutateAsync: generateToken } = useMutation(
        trpc.meetings.generateToken.mutationOptions(),
    );

    useEffect(() => {
        if (meetingEnded) return;

        const fetchToken = async () => {
            try {
                // Ensure the payload matches what your tRPC router expects
                const {token} = await generateToken({ roomName: meetingId });
                setToken(token); 
            } catch (error) {
                console.error("Failed to get token:", error);
            }
        };

        fetchToken();
    }, [generateToken, meetingEnded, meetingId]);

    if (meetingEnded) {
        return (
            <div className="flex h-screen items-center justify-center">
                <ErrorState
                    title="Meeting has ended"
                    description="You can no longer join this meeting"
                />
            </div>
        )
    }

    

    return (
        <LiveKitRoom
            token={token}
            serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
            connect={joined && !!token}
            audio={audioOn}
            video={videoOn}
            style={{ height: '100vh' }}
        >
            {!joined ? (
                <CallLobby onJoin={({ audio, video }) => {
                    setAudioOn(audio);
                    setVideoOn(video);
                    setJoined(true);
                }}  />
            ) : (
                <CallActive meetingId={meetingId}  meetingName={data.name}/>
            )}
        </LiveKitRoom>
    );
}