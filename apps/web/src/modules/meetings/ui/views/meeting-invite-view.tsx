"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

import { useTRPC } from "@/trpc/client";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

interface InviteScreenProps {
  token: string;
}

export function InviteScreen({
  token
}: InviteScreenProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const currentUser = authClient.useSession().data?.user

  const [isAccepting, setIsAccepting] = useState(false);

  const { data } = useSuspenseQuery(
    trpc.meetings.getInviteDetails.queryOptions({
      token:token
    })
  )
  
  useEffect(() => {
  if (
    currentUser &&
    data?.meeting &&
    data.meeting.createdByUserId === currentUser.id
  ) {
    router.replace(`${data.meeting.id}`);
  }
}, [currentUser, data?.meeting?.createdByUserId, data?.meeting?.id, router]);


  const acceptInvite = useMutation(
    trpc.meetings.acceptInvite.mutationOptions({
      onSuccess: () => {
        toast.success("Successfully joined the meeting!");
        router.push(`${data.meeting.id}`);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to join meeting");
      },
      onSettled: () => {
        setIsAccepting(false);
      },
    })
  );

  const handleAcceptInvite = () => {
    setIsAccepting(true);
    acceptInvite.mutate({ meetingId:data.meeting.id, token:token });
  };


  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Meeting Invitation</CardTitle>
          <CardDescription>
            You've been invited to join a meeting
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg">{data.meeting.name}</h3>
              <p className="text-sm text-muted-foreground">
                Hosted by {data.meeting.agent.name}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src="" />
                <AvatarFallback>
                  {data.meeting.agent.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">AI Agent</p>
                <p className="text-xs text-muted-foreground">
                  {data.meeting.agent.name}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Your Role:</span>
              <Badge variant="secondary">{data.role}</Badge>
            </div>

            {data.meeting.startsAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm">Scheduled:</span>
                <span className="text-sm">
                  {new Date(data.meeting.startsAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          <Button
            onClick={handleAcceptInvite}
            disabled={isAccepting}
            className="w-full"
          >
            {isAccepting ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Joining...
              </>
            ) : (
              "Accept Invitation"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
