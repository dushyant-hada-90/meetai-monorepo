"use client"

import React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight,
  Brain,
  ShieldCheck,
  LayoutDashboard,
  CheckCircle2,
  Sparkles,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { authClient } from "@/lib/auth-client"

/* ---------------------------------- utils --------------------------------- */

const Fade = ({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-80px" }}
    transition={{ duration: 0.4, ease: "easeOut", delay }}
    className={className}
  >
    {children}
  </motion.div>
)

/* ---------------------------------- page ---------------------------------- */

export const HomeView = () => {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <div className="min-h-screen flex flex-col">
        <Hero />
        <SocialProof />
      </div>
      <Features />
      <ProductPreview />
      <CTA />
    </main>
  )
}

/* ---------------------------------- hero ---------------------------------- */

function Hero() {
  const { data: session, isPending } = authClient.useSession()

  return (
    <section className="relative flex-1 flex flex-col justify-center border-b overflow-hidden">
      {/* background gradient + blobs */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-500/10 via-background to-background" />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-400/20 rounded-full blur-3xl" />
      <div className="absolute top-40 -right-32 w-96 h-96 bg-teal-400/20 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 py-24 text-center max-w-5xl">
        <Fade>
          <Badge className="mb-6 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-foreground border-emerald-500/30">
            <Sparkles className="w-3 h-3 mr-1 text-emerald-500" />
            AI‑powered meeting intelligence
          </Badge>
        </Fade>

        <Fade delay={0.05}>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            Meetings that{" "}
            <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-lime-400 bg-clip-text text-transparent">
              turn talk into action
            </span>
          </h1>
        </Fade>

        <Fade delay={0.1}>
          <p className="mt-6 text-lg text-muted-foreground max-w-3xl mx-auto">
            MeetAI joins your meetings, understands the conversation, and
            automatically generates summaries, decisions, and action items —
            ready to share, search, and execute.
          </p>
        </Fade>

        {/* product bullets */}
        <Fade delay={0.15}>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm max-w-4xl mx-auto">
            <HeroPoint text="Instant meeting summaries" />
            <HeroPoint text="Action items with owners & deadlines" />
            <HeroPoint text="Export to Notion, Slack & CRMs" />
          </div>
        </Fade>

        <Fade delay={0.2}>
          <div className="mt-12 flex flex-col sm:flex-row justify-center gap-4">
            {session ? (
              <Button
                size="lg"
                className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:opacity-90"
                asChild
              >
                <Link href="/agents">
                  Go to Dashboard <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
            ) : (
              <Button
                size="lg"
                className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:opacity-90"
                asChild
              >
                <Link href="/sign-up">
                  Get started free <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
            )}

            <Button size="lg" variant="outline" asChild>
              <Link href="/demo">View live demo</Link>
            </Button>
          </div>
        </Fade>
      </div>
    </section>
  )
}

function HeroPoint({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border bg-background/70 backdrop-blur px-4 py-3 shadow-sm">
      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      <span>{text}</span>
    </div>
  )
}


/* ------------------------------- social proof ------------------------------ */

function SocialProof() {
  return (
    <section className="py-10 bg-muted/20">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <Stat value="12k+" label="Meetings analyzed" />
          <Stat value="94%" label="Action items captured" />
          <Stat value="<2s" label="Post-call summary" />
          <Stat value="SOC-2" label="Security ready" />
        </div>
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-3xl font-bold bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
        {value}
      </div>
      <div className="text-xs mt-1 text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
    </div>
  )
}

/* -------------------------------- features -------------------------------- */

function Features() {
  return (
    <section className="py-28">
      <div className="container mx-auto px-4 max-w-6xl">
        <Fade>
          <h2 className="text-3xl md:text-4xl font-bold text-center">
            Designed for real teams
          </h2>
        </Fade>

        <div className="mt-16 grid md:grid-cols-3 gap-8">
          <Feature
            icon={<Brain />}
            title="Autonomous agents"
            text="Agents that attend meetings, understand context, and continuously improve summaries."
            gradient="from-emerald-500 to-teal-500"
            delay={0}
          />
          <Feature
            icon={<LayoutDashboard />}
            title="Unified workspace"
            text="All transcripts, decisions, and action items searchable in one place."
            gradient="from-teal-500 to-lime-400"
            delay={0.05}
          />
          <Feature
            icon={<ShieldCheck />}
            title="Enterprise-grade security"
            text="Encrypted by default. Designed to meet SOC-2 and GDPR standards."
            gradient="from-lime-400 to-emerald-500"
            delay={0.1}
          />
        </div>
      </div>
    </section>
  )
}

function Feature({
  icon,
  title,
  text,
  gradient,
  delay,
}: {
  icon: React.ReactNode
  title: string
  text: string
  gradient: string
  delay: number
}) {
  return (
    <Fade delay={delay}>
      <Card className="h-full relative overflow-hidden">
        <div
          className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${gradient}`}
        />
        <CardHeader>
          <div
            className={`w-11 h-11 rounded-xl bg-gradient-to-r ${gradient} text-white flex items-center justify-center mb-4`}
          >
            {icon}
          </div>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{text}</p>
        </CardContent>
      </Card>
    </Fade>
  )
}

/* ----------------------------- product preview ----------------------------- */

function ProductPreview() {
  return (
    <section className="py-24 bg-gradient-to-b from-muted/40 to-background border-y">
      <div className="container mx-auto px-4 max-w-6xl">
        <Fade>
          <h2 className="text-3xl md:text-4xl font-bold text-center">
            From call → clarity in seconds
          </h2>
        </Fade>

        <Fade delay={0.1}>
          <p className="mt-4 text-muted-foreground text-center max-w-2xl mx-auto">
            MeetAI listens once, then works forever — organizing every meeting
            into searchable, structured knowledge.
          </p>
        </Fade>

        <Fade delay={0.15}>
          <div className="mt-16 grid md:grid-cols-2 gap-10 items-center">
            {/* left: workflow */}
            <div className="space-y-4">
              <PreviewItem text="Live transcription with speaker detection" />
              <PreviewItem text="AI‑generated summary & key decisions" />
              <PreviewItem text="Action items auto‑assigned to participants" />
              <PreviewItem text="One workspace for all past meetings" />
            </div>

            {/* right: visual container */}
            <div className="relative rounded-2xl border bg-background/70 backdrop-blur p-8 shadow-lg">
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-emerald-400/30 rounded-full blur-2xl" />
              <div className="space-y-3 text-sm">
                <div className="font-medium">Meeting Summary</div>
                <ul className="text-muted-foreground space-y-2 list-disc list-inside">
                  <li>Decision: Launch onboarding redesign next sprint</li>
                  <li>Action: Alex → prepare Figma by Friday</li>
                  <li>Action: Team → review metrics</li>
                </ul>
              </div>
            </div>
          </div>
        </Fade>
      </div>
    </section>
  )
}


function PreviewItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
      <span>{text}</span>
    </li>
  )
}

/* ---------------------------------- cta ---------------------------------- */

function CTA() {
  const { data: session } = authClient.useSession()

  return (
    <section className="py-28">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-500 via-teal-500 to-lime-400 text-white px-8 py-20 text-center shadow-xl">
          <Fade>
            <h2 className="text-4xl font-bold">
              Stop taking notes. Start making decisions.
            </h2>
          </Fade>

          <Fade delay={0.1}>
            <p className="mt-4 text-white/80 text-lg max-w-xl mx-auto">
              MeetAI works silently in the background so you can focus on the
              conversation.
            </p>
          </Fade>

          <Fade delay={0.15}>
            <div className="mt-10">
              <Button size="lg" variant="secondary" asChild>
                <Link href={session ? "/agents" : "/sign-up"}>
                  {session ? "Go to Dashboard" : "Create free account"}
                </Link>
              </Button>
              <p className="mt-4 text-xs text-white/70">
                No credit card required
              </p>
            </div>
          </Fade>
        </div>
      </div>
    </section>
  )
}
