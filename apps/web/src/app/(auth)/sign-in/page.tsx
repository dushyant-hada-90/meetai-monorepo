import { auth } from "@/lib/auth"
import { SignInView } from "@/modules/auth/ui/views/sign-in-view"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

interface Props {
  searchParams: Promise<{ redirectTo: string | undefined }>
}

const Page = async ({ searchParams }: Props) => {
  const { redirectTo } = await searchParams
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  const destination = redirectTo?.startsWith("/") ? redirectTo : "/agents";
  if (session) {
    redirect(destination);
  }

  return <SignInView redirect={destination} />
}

export default Page
