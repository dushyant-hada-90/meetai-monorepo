import { auth } from "@/lib/auth"
import { SignInView } from "@/modules/auth/ui/views/sign-in-view"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

interface Props {
  searchParams: Promise<{ redirectTo: string | undefined }>
}

const Page = async ({ searchParams }: Props) => {
  const { redirectTo } = await searchParams
  console.log(redirectTo)
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  const destination =
  redirectTo &&
  redirectTo.startsWith("/") &&
  !redirectTo.startsWith("//") &&
  redirectTo !== "/"
    ? redirectTo
    : "/";

  if (session) {
    redirect(destination);
  }

  return <SignInView redirect={destination} />
}

export default Page
