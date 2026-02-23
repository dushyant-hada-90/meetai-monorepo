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
import { useAuth } from "@/modules/auth/ui/components/auth-provider";
import { GeneratedAvatar } from "@/components/generated-avatar";

interface InviteScreenProps {
  token: string;
}

export function InviteScreen({
  token
}: InviteScreenProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const { session } = useAuth();
  const currentUser = session?.user;

  const [isAccepting, setIsAccepting] = useState(false);

  const { data } = useSuspenseQuery(
    trpc.meetings.getInviteDetails.queryOptions({
      token: token
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
  }, [currentUser, data?.meeting?.createdByUserId, data?.meeting?.id, router, data.meeting]);


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
    acceptInvite.mutate({ meetingId: data.meeting.id, token: token });
  };


  return (
  <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center space-y-1">
        <CardTitle className="text-2xl font-semibold">
          {data.meeting.name}
        </CardTitle>
        <CardDescription>
          You’ve been invited to join a meeting
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Host */}
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <Avatar className="h-10 w-10">
            <AvatarImage
              src={data.meeting.createdByUserImage ?? undefined}
              alt={data.meeting.createdByUsername}
            />
            <AvatarFallback>
              <GeneratedAvatar
                seed={data.meeting.createdByUsername}
                variant="initials"
              />
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {data.meeting.createdByUsername}
            </span>
            <span className="text-xs text-muted-foreground">
              Host
            </span>
          </div>
        </div>

        {/* Agent */}
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <GeneratedAvatar
            seed={data.meeting.agent.name}
            variant="botttsNeutral"
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {data.meeting.agent.name}
            </span>
            <span className="text-xs text-muted-foreground">
              AI Agent
            </span>
          </div>
        </div>

        {/* Meta */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-left gap-2">
            <span className="text-muted-foreground">Your role</span>
            <Badge variant="secondary">{data.role}</Badge>
          </div>

          {data.meeting.startsAt && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Scheduled</span>
              <span>
                {new Date(data.meeting.startsAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* CTA */}
        <Button
          onClick={handleAcceptInvite}
          disabled={isAccepting}
          size="lg"
          className="w-full"
        >
          {isAccepting ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Accepting…
            </>
          ) : (
            "Accept Invite"
          )}
        </Button>
      </CardContent>
    </Card>
  </div>
);

}
