import { MeetingsListHeader } from "@/modules/meetings/ui/components/meetings-list-header"
import { MeetingsView, MeetingsViewError, MeetingsViewLoading } from "@/modules/meetings/ui/views/meetings-view"
import { createTRPCContext } from "@/trpc/init"
import { getQueryClient, trpc } from "@/trpc/server"
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { ErrorBoundary } from "react-error-boundary"

const Page = async () => {

    const { session } = await createTRPCContext(); // shares cached TRPC context
    if (!session) redirect('./sign-in'); // or redirect('/sign-in') for clarity

    const queryClient = getQueryClient()
    await queryClient.fetchQuery(trpc.meetings.getMany.queryOptions({}))

    return (
        <>
            <MeetingsListHeader />
            <HydrationBoundary state={dehydrate(queryClient)}>
                <Suspense fallback={<MeetingsViewLoading />}>
                    <ErrorBoundary fallback={<MeetingsViewError />}>
                        <MeetingsView />
                    </ErrorBoundary>
                </Suspense>
            </HydrationBoundary>
        </>
    )
}

export default Page