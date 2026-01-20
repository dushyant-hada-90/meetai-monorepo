import { auth } from "@/lib/auth"
import { HomeView } from "@/modules/home/ui/views/home-view"
import { createTRPCContext } from "@/trpc/init"
import { headers } from "next/headers"
import { redirect } from "next/navigation"


const Page = async ()=>{
  const { session } = await createTRPCContext(); // shares cached TRPC context
  if (!session) redirect('./sign-in'); // or redirect('/sign-in') for clarity
  
  return (
    <HomeView/>
  )
}

export default Page