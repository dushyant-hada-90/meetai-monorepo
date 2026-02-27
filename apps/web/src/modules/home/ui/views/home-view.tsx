import Link from "next/link"
import Image from "next/image"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  ArrowRight,
  Bolt,
  CheckCircle2,
  MicOff,
  PlayCircle,
  Rocket,
  Brain,
  Captions,
  Network,
  AudioLines,
} from "lucide-react"

export const HomeView = () => {
  return (
    <main className="bg-background text-foreground min-h-screen flex flex-col font-sans antialiased">
      <Navbar />

      <section className="flex-grow pt-24 pb-16 relative overflow-hidden">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] pointer-events-none z-0"
          style={{ background: "radial-gradient(circle at center, rgba(54,226,112,0.12) 0%, rgba(10,10,10,0) 70%)" }}
        />

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <HeroSection />
          <FeaturesSection />
          <AboutSection />
          <Footer />
        </div>
      </section>
    </main>
  )
}

function Navbar() {
  return (
    <header className="fixed top-0 w-full z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform duration-300">
            <AudioLines size={20} />
          </div>
          <span className="font-bold text-lg tracking-tight text-foreground">MeetAI</span>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          <Link className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" href="#features">
            Features
          </Link>
          <Link className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" href="/upgrade">
            Pricing
          </Link>
          <Link className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" href="#about">
            About
          </Link>
          <Link
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            href="https://meetai-monorepo-docs.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Docs
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link className="hidden sm:block text-sm font-medium text-foreground hover:text-primary transition-colors" href="/sign-in">
            Sign In
          </Link>
          <Link
            href="/sign-in"
            className="h-9 px-4 rounded-lg bg-primary text-black text-sm font-bold hover:bg-[#2dc460] transition-colors flex items-center gap-2 shadow-sm shadow-primary/20"
          >
            <span>Get Started</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </header>
  )
}

function HeroSection() {
  return (
    <div className="grid lg:grid-cols-2 gap-16 items-center pt-12 pb-24">
      <div className="flex flex-col gap-8 max-w-2xl">
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
          Your AI That <br />
          <span className="text-primary drop-shadow-[0_0_30px_rgba(54,226,112,0.2)]">Attends Meetings</span> <br />
          For You
        </h1>

        <p className="text-lg text-muted-foreground leading-relaxed max-w-lg">
          MeetAI joins your calls, records audio, writes notes, and automatically captures action items. Focus on the conversation, not the keyboard.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          <Link href="/meetings" className="h-12 px-8 rounded-xl bg-primary text-black text-base font-bold hover:bg-[#2dc460] transition-all hover:scale-[1.02] flex items-center justify-center gap-2 shadow-[0_0_40px_-10px_rgba(54,226,112,0.3)]">
            <span>Start for Free</span>
            <Rocket size={20} />
          </Link>
          <button className="h-12 px-8 rounded-xl bg-transparent border border-border text-foreground text-base font-bold hover:bg-muted transition-all flex items-center justify-center gap-2">
            <PlayCircle size={20} />
            <span>View Demo</span>
          </button>
        </div>
      </div>

      <div className="relative" style={{ perspective: "1000px" }}>
        <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-3xl blur-2xl opacity-30 transition-opacity duration-700" />

        <div className="relative bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col aspect-[4/3] transform transition-transform duration-500 hover:rotate-y-2 hover:rotate-x-2">
          <div className="h-10 bg-muted border-b border-border flex items-center px-4 gap-2">
            <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
            <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
            <div className="w-3 h-3 rounded-full bg-[#28C840]" />
            <div className="flex-1 text-center text-xs text-muted-foreground font-medium">Weekly Sync - MeetAI</div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 p-4 grid grid-cols-2 gap-4 bg-background">
              <VideoTile
                name="Sarah (Product)"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCgGji7H27NRD4-nGeK9muwQLD7FuP14g1kEdtHO3AxI0JDNisHfVQpAqUXJJx-KQYER9eHZn8ObcU03bkVehkHZW-AHNFXb3Xs_yr89fXx27i2K6xft2WEYLssDtDwCuvf4DhGkkvMEz0Kff5JIx8Be6RgkmLi45_41qpWoVBXhfXPg5zhLNm4e6jJ3SoVlLHXBzSDdcjaQqfyeUprEUtKmODccLfIdVx79e9WH7uU7UQgntEdpQHtRMRpOjc06YOvO4Kg_V79F38"
              />
              <VideoTile
                name="David (Eng)"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCBYpXwuAOSmW5ffAGM5UCZ_KVgRwJydYhXJCWP96rFJF6GyTJJUIRYPZgV6DcEjZkdm8tRvEN_Akmeb9j542b2jrfb-WmcDIJyU04jWUsOsa0FXPJ9g2QNF2boDqTtfHDRzMXNvU8RUrnSBFbSabCEKHQqGuCoyN4XNleysdhoZmmkkQWFxDUmH1mf3P3GFlo5-qoq8p62XvrzTgq9K211Gzz7dWxcFM6C3Jh04W551inaryiPRyNKyiEd224BokMqm8hGUSH1QKk"
              />
              <VideoTile
                name="Marcus (Design)"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCP4_nkg2PZeWdyDCwvyqvvi9pCZLlQ7S6QA-otlvgw54BJfjGdgP1x8cf8_RbaXunI3mRnRY0cI-VQ0m9l4fQyiZwcsqpgr1qPSOBf9s-jTrB5HCpp8SVqLxEgLGP_6Oi_lEFEpI4r1h9x3i86yJi7tm3JYCys7zPq6Fu6iRA-K0nSUhO2wYsx77Rh6-kAp06JijqvhLiWqvmbqX6IojdsfWGVVAtwcd91UFZqloacciAgJsPC2WIEsmDu58etFw0wFzreAXCwH4s"
                muted
              />

              <div className="bg-card border border-primary/20 rounded-xl relative flex flex-col items-center justify-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full animate-pulse" />
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-[#22c55e] flex items-center justify-center relative z-10 shadow-lg shadow-primary/20">
                    <AudioLines size={32} className="text-black" />
                  </div>
                </div>
                <div className="px-2 py-1 bg-primary/10 rounded text-xs font-bold text-primary border border-primary/20">MeetAI Pilot</div>
              </div>
            </div>

            <div className="w-64 bg-card border-l border-border p-4 flex flex-col gap-4 hidden sm:flex">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Live Transcript</h3>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              </div>

              <div className="flex flex-col gap-3 overflow-hidden" style={{ maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)" }}>
                <TranscriptLine initials="S" color="indigo" text="Sarah" message="Let's review the Q3 roadmap timeline." />
                <TranscriptLine initials="D" color="orange" text="David" message="Backend integration is on track for Friday." />

                <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/10 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-primary">
                    <Bolt size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Action Item Detected</span>
                  </div>
                  <p className="text-xs text-foreground">David to finalize backend integration by Friday.</p>
                  <button className="w-full py-1 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold rounded transition-colors">
                    Add to Jira
                  </button>
                </div>

                <TranscriptLine initials="M" color="cyan" text="Marcus" message="I'll have the mocks ready by EOD." faded />
              </div>
            </div>
          </div>
        </div>

        {/* <div className="absolute -right-4 top-20 bg-card/70 backdrop-blur border border-border p-4 rounded-xl shadow-2xl border-l-4 border-l-primary max-w-[240px] hidden lg:block">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">Task Created</h4>
              <p className="text-xs text-muted-foreground mt-1">"Update Q3 Roadmap" assigned to Alex.</p>
            </div>
          </div>
        </div>  */}
      </div>
    </div>
  )
}

type TranscriptLineProps = {
  initials: string
  color: "indigo" | "orange" | "cyan"
  text: string
  message: string
  faded?: boolean
}

function TranscriptLine({ initials, color, text, message, faded }: TranscriptLineProps) {
  const palette: Record<TranscriptLineProps["color"], { bg: string; text: string }> = {
    indigo: { bg: "bg-indigo-500/20", text: "text-indigo-400" },
    orange: { bg: "bg-orange-500/20", text: "text-orange-400" },
    cyan: { bg: "bg-cyan-500/20", text: "text-cyan-400" },
  }

  return (
    <div className={`flex gap-2 ${faded ? "opacity-50" : ""}`}>
      <div className={`w-6 h-6 rounded-full ${palette[color].bg} ${palette[color].text} flex items-center justify-center text-[10px] font-bold shrink-0`}>
        {initials}
      </div>
      <div className="text-xs text-muted-foreground leading-relaxed">
        <span className="text-foreground font-medium">{text}:</span> {message}
      </div>
    </div>
  )
}

type VideoTileProps = {
  name: string
  src: string
  muted?: boolean
}

function VideoTile({ name, src, muted }: VideoTileProps) {
  return (
    <div className="bg-muted rounded-xl overflow-hidden relative group">
      <Image className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" src={src} alt={name} width={400} height={300} unoptimized />
      <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/60 backdrop-blur rounded text-xs font-medium text-white">{name}</div>
      {muted ? (
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
          <MicOff size={14} className="text-white" />
        </div>
      ) : null}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TrustedLogos() {
  return (
    <div className="pt-10 mt-4 border-t border-border flex flex-col gap-6">
      <p className="text-xs text-muted-foreground font-semibold tracking-[0.2em] uppercase">
        Powering productivity for forward-thinking teams
      </p>
      <div className="flex flex-wrap gap-10 items-center opacity-50 grayscale hover:grayscale-0 transition-all duration-700">
        <svg className="h-6 w-auto text-muted-foreground hover:text-foreground transition-colors" fill="currentColor" viewBox="0 0 100 30">
          <path d="M10,15 L20,5 L30,15 L40,5 M60,25 L90,25" fill="none" stroke="currentColor" strokeWidth="3" />
        </svg>
        <svg className="h-6 w-auto text-muted-foreground hover:text-foreground transition-colors" fill="currentColor" viewBox="0 0 100 30">
          <circle cx="15" cy="15" r="10" fill="none" stroke="currentColor" strokeWidth="3" />
          <rect x="35" y="5" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M70,15 L90,15" stroke="currentColor" strokeWidth="3" />
        </svg>
        <svg className="h-6 w-auto text-muted-foreground hover:text-foreground transition-colors" fill="currentColor" viewBox="0 0 100 30">
          <path d="M10,5 L10,25 L30,25 M50,5 L50,25 M70,5 L90,25" fill="none" stroke="currentColor" strokeWidth="3" />
        </svg>
        <svg className="h-6 w-auto text-muted-foreground hover:text-foreground transition-colors" fill="currentColor" viewBox="0 0 100 30">
          <circle cx="15" cy="15" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="35" cy="15" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M60,15 Q75,5 90,15" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
    </div>
  )
}

function FeaturesSection() {
  const features = [
    {
      title: "Real-time Transcription",
      description: "Instant speech-to-text with 99% accuracy across 30+ languages. Searchable and editable in real-time.",
      icon: <Captions className="w-5 h-5" />,
    },
    {
      title: "Contextual Intelligence",
      description: "AI that understands context, not just keywords. It distinguishes between a joke and a commitment.",
      icon: <Brain className="w-5 h-5" />,
    },
    {
      title: "Workflow Automation",
      description: "Push action items directly to Notion, Linear, Jira, or Slack without lifting a finger.",
      icon: <Network className="w-5 h-5" />,
    },
  ]

  return (
    <div className="py-24 border-t border-border" id="features">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-12">
        <div className="max-w-xl">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Supercharge your productivity</h2>
          <p className="text-muted-foreground text-lg">Don&apos;t just record meetings. Understand them.</p>
        </div>
        <Link className="text-primary font-bold hover:text-foreground transition-colors flex items-center gap-1 group" href="#features-all">
          View all features
          <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} />
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-colors group"
          >
            <div className="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center mb-6 text-foreground group-hover:bg-primary group-hover:text-black transition-colors">
              {feature.icon}
            </div>
            <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AboutSection() {
  return (
    <div className="py-24 border-t border-border" id="about">
      <div className="grid md:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold mb-6">About MeetAI</h2>
          <p className="text-muted-foreground text-lg leading-relaxed mb-6">
            MeetAI was built for teams who spend too much time in meetings and too little time acting on them. We believe every conversation should produce clear outcomes — not just recordings gathering dust.
          </p>
          <p className="text-muted-foreground text-lg leading-relaxed mb-8">
            Our AI attends your calls as a silent participant, capturing every detail so you don&apos;t have to. From live transcripts to automatic task creation, MeetAI turns passive listening into active productivity.
          </p>
          <div className="grid grid-cols-2 gap-6">
            <div className="p-5 rounded-xl bg-card border border-border">
              <div className="text-3xl font-bold text-primary mb-1">10x</div>
              <div className="text-sm text-muted-foreground">Faster meeting follow-ups</div>
            </div>
            <div className="p-5 rounded-xl bg-card border border-border">
              <div className="text-3xl font-bold text-primary mb-1">30+</div>
              <div className="text-sm text-muted-foreground">Languages supported</div>
            </div>
            <div className="p-5 rounded-xl bg-card border border-border">
              <div className="text-3xl font-bold text-primary mb-1">99%</div>
              <div className="text-sm text-muted-foreground">Transcription accuracy</div>
            </div>
            <div className="p-5 rounded-xl bg-card border border-border">
              <div className="text-3xl font-bold text-primary mb-1">50k+</div>
              <div className="text-sm text-muted-foreground">Meetings processed</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-colors">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">Our Mission</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">To make every meeting meaningful by eliminating the friction between conversation and action. We&apos;re building the AI layer that connects what&apos;s said to what gets done.</p>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-colors">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Network className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">Built for Teams</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">Whether you&apos;re a startup of 5 or an enterprise of 5,000, MeetAI scales with your workflow. Deep integrations with the tools your team already uses.</p>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-colors">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">Privacy First</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">End-to-end encrypted transcripts. Your meeting data stays yours. We never train on your conversations, ever.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="py-12 border-t border-border flex flex-col md:flex-row justify-between items-center gap-6 text-muted-foreground text-sm">
      <div className="flex items-center gap-2">
        <AudioLines size={20} className="text-muted-foreground" />
        <span className="font-bold text-foreground">MeetAI</span>
        <span>© {new Date().getFullYear()}</span>
      </div>
      <div className="flex gap-6">
        <Link className="hover:text-foreground transition-colors" href="#privacy">
          Privacy
        </Link>
        <Link className="hover:text-foreground transition-colors" href="#terms">
          Terms
        </Link>
        <Link className="hover:text-foreground transition-colors" href="#twitter">
          Twitter
        </Link>
        <Link className="hover:text-foreground transition-colors" href="#linkedin">
          LinkedIn
        </Link>
      </div>
    </footer>
  )
}