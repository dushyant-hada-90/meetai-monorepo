import { loadSearchParams } from "@/modules/meetings/params"
import { MeetingsListHeader } from "@/modules/meetings/ui/components/meetings-list-header"
import { MeetingsView, MeetingsViewError, MeetingsViewLoading } from "@/modules/meetings/ui/views/meetings-view"
import { getQueryClient, trpc } from "@/trpc/server"
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { SearchParams } from "nuqs"
import { Suspense } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

interface Props {
    searchParams:Promise<SearchParams>
}

const Page = async ({searchParams}:Props) => {
    const session = await auth.api.getSession({
        headers: await headers()
    })
    if (!session) redirect("/sign-in")
    
    const filters = await loadSearchParams(searchParams)
    // console.log(filters)

    const queryClient = getQueryClient()
    await queryClient.prefetchQuery(trpc.meetings.getMany.queryOptions({
        ...filters
    }))

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