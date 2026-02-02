import { MeetingIdView, MeetingIdViewError, MeetingIdViewLoading } from "@/modules/meetings/ui/views/meeting-id-view"
import { getQueryClient, trpc } from "@/trpc/server"
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { Suspense } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

interface Props {
  params: Promise<{
    meetingId: string
  }>
}

const Page = async ({ params }: Props) => {
  const session = await auth.api.getSession({
    headers: await headers()
  })
  if (!session) redirect("/sign-in")
  
  const { meetingId } = await params

  const queryClient = getQueryClient()

  // Ensure queries settle before hydration to avoid "pending" dehydrated states rejecting later.
  await Promise.allSettled([
    queryClient.prefetchQuery(
      trpc.meetings.getOne.queryOptions({
        id: meetingId
      })
    ),
    queryClient.prefetchQuery(
      trpc.meetings.getTranscript.queryOptions({
        id: meetingId
      })
    )
  ])
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<MeetingIdViewLoading/>}>
        <ErrorBoundary fallback={<MeetingIdViewError/>}>
          <MeetingIdView meetingId={meetingId}/>
        </ErrorBoundary>
      </Suspense>
    </HydrationBoundary>
  )
}

export default Page