import { SidebarProvider } from "@/components/ui/sidebar"
import { auth } from "@/lib/auth"
import { DashboardNavBar } from "@/modules/dashboard/ui/components/dashboard-navbar"
import { DashboardSidebar } from "@/modules/dashboard/ui/components/dashboard-sidebar"
import { createTRPCContext } from "@/trpc/init"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

interface Props {
  children: React.ReactNode
}

const Layout = async ({ children }: Props) => {
  const session = await auth.api.getSession({
          headers : await headers()
        })

  if (!session) {
    console.log("session does not exist")
    redirect("/sign-in")
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <DashboardSidebar />

        <main className="flex flex-col flex-1 bg-muted overflow-hidden">
          <DashboardNavBar />
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}

export default Layout
