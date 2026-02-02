import { SidebarProvider } from "@/components/ui/sidebar"
import { auth } from "@/lib/auth"
import { DashboardNavBar } from "@/modules/dashboard/ui/components/dashboard-navbar"
import { DashboardSidebar } from "@/modules/dashboard/ui/components/dashboard-sidebar"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

interface Props {
  children: React.ReactNode
}

const Layout = async ({ children }: Props) => {
  

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
