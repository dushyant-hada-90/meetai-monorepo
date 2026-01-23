import { auth } from "@/lib/auth"
import { HomeView } from "@/modules/home/ui/views/home-view"
import { createTRPCContext } from "@/trpc/init"
import { headers } from "next/headers"
import { redirect } from "next/navigation"


const Page = async ()=>{
  
  
  return (
    <HomeView/>
  )
}

export default Page