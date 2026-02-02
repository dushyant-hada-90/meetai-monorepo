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

  const safeRedirect = (value?: string | null) => {
    if (!value) return null
    if (!value.startsWith("/")) return null
    if (value.startsWith("//")) return null
    return value
  }

  const sanitizedRedirect = safeRedirect(redirectTo)
  const destination = sanitizedRedirect && sanitizedRedirect !== "/" ? sanitizedRedirect : "/meetings"

  if (session) {
    redirect(destination);
  }

  return <SignInView redirect={destination} />
}

export default Page
