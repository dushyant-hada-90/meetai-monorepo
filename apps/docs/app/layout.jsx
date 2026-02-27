import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import { AudioLines } from 'lucide-react'
import 'nextra-theme-docs/style.css'

export const metadata = {
  title: {
    default: 'MeetAI Docs',
    template: '%s – MeetAI',
  },
  description: 'Technical documentation for MeetAI — the AI-powered meeting assistant built with Next.js, LiveKit, Neon DB, and Inngest.',
}

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <body>
        <Layout
          navbar={
            <Navbar
              logo={
                <img src="/logo.svg" alt="MeetAI" style={{ height: 28 }} />
              }
              projectLink="https://github.com/dushyant-hada-90/meetai-monorepo"
            />
          }
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/dushyant-hada-90/meetai-docs/tree/main"
          footer={
            <Footer>
              <span>© {new Date().getFullYear()} MeetAI. Built with Nextra.</span>
            </Footer>
          }
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
