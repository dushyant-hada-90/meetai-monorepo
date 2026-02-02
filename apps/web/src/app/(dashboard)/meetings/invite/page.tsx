import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth"; // Your Better Auth setup
import { useTRPC } from "@/trpc/client";
import { getQueryClient, trpc } from "@/trpc/server";
import { InviteScreen } from "@/modules/meetings/ui/views/meeting-invite-view";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";

interface Props {
  searchParams: Promise<{ token: string | undefined; meetingId: string | undefined }>
}

export default async function InvitePage({ searchParams}:Props) {
  const session = await auth.api.getSession({
    headers: await headers()
  })
  if (!session) redirect("/sign-in")
  
  // 1. Extract & Await Params (Next.js 15 requirement)
  const { token } = await searchParams;

  if (!token) {
    redirect("/404"); // Or specific 404 page
  }
  
  const queryClient = getQueryClient()
  
  // Fetch invite details server-side
  console.log("here ok")
  const inviteDetails = await queryClient.fetchQuery(
    trpc.meetings.getInviteDetails.queryOptions({
      token
    })
  );
  console.log(inviteDetails)
  

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<div>loading</div>}>
        <ErrorBoundary fallback={<div>Error</div>}>
        <InviteScreen
        token={token}
        />
        </ErrorBoundary>
      </Suspense>
    </HydrationBoundary>
  );
}