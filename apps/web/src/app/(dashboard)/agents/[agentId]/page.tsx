import { AgentIdView, AgentIdViewError, AgentIdViewLoading } from "@/modules/agents/ui/views/agent-id-view"
import { getQueryClient, trpc } from "@/trpc/server"
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"
import { Suspense } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

interface Props {
    params: Promise<{ agentId: string }>
}

const Page = async ({ params }: Props) => {
    const session = await auth.api.getSession({
        headers: await headers()
    })
    if (!session) redirect("/sign-in")
    
    const { agentId } = await params
    const queryClient = getQueryClient()
    await queryClient.fetchQuery(
        trpc.agents.getOne.queryOptions({ id: agentId })
    )
    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <Suspense fallback={<AgentIdViewLoading/>}>
                <ErrorBoundary fallback={<AgentIdViewError/>}>
                    <AgentIdView agentId={agentId}/>
                </ErrorBoundary>
            </Suspense>
        </HydrationBoundary>
    )
}

export default Page