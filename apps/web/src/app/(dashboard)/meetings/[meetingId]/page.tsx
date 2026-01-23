import { MeetingIdView, MeetingIdViewError, MeetingIdViewLoading } from "@/modules/meetings/ui/views/meeting-id-view"
import { getQueryClient, trpc } from "@/trpc/server"
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { Suspense } from "react"
import { ErrorBoundary } from "react-error-boundary"

interface Props {
  params: Promise<{
    meetingId: string
  }>
}

const Page = async ({ params }: Props) => {
  const { meetingId } = await params

  const queryClient = getQueryClient()
  void queryClient.prefetchQuery(
    trpc.meetings.getOne.queryOptions({
      id: meetingId
    })
  )
  //  todo: prefetch meetings.getTranscript
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