import { auth } from "@/lib/auth"
import { SignUpView } from "@/modules/auth/ui/views/sign-up-view"
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
  return <SignUpView redirect={destination}/>
}

export default Page