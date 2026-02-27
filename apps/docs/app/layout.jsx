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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      background: 'rgba(54,226,112,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AudioLines size={16} />
                  </div>
                  <span style={{ fontWeight: 800, fontSize: '1rem' }}>MeetAI Docs</span>
                </div>
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
