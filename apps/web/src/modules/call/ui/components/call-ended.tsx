"use client";

import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  Users,
  Calendar,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

interface CallEndedProps {
  duration?: number;
  participants?: number;
}

export const CallEnded = ({
  duration = 0,
  participants = 0,
}: CallEndedProps) => {
  const [formattedDuration, setFormattedDuration] = useState("");
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    // Staggered entrance animation
    const timer = setTimeout(() => setShowContent(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (duration > 0) {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const seconds = duration % 60;

      if (hours > 0) {
        setFormattedDuration(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setFormattedDuration(`${minutes}m ${seconds}s`);
      } else {
        setFormattedDuration(`${seconds}s`);
      }
    }
  }, [duration]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 font-sans transition-colors">
      {/* Background gradient - theme aware */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

      <div
        className={`relative z-10 flex flex-col items-center gap-8 transition-all duration-700 ${
          showContent
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4"
        }`}
      >
        {/* Success icon with animated ring */}
        <div className="relative">
          <div className="absolute -inset-3 rounded-full bg-green-500/10 animate-ping" style={{ animationDuration: "3s" }} />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
        </div>

        {/* Main text */}
        <div className="flex flex-col items-center gap-2 text-center max-w-sm">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Meeting Ended
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your meeting has been recorded. An AI summary is being generated and will be available shortly.
          </p>
        </div>

        {/* Stats cards */}
        {(duration > 0 || participants > 0) && (
          <div className="flex items-center gap-3">
            {duration > 0 && (
              <div className="flex items-center gap-2.5 rounded-xl bg-card border border-border px-4 py-3">
                <Clock size={16} className="text-primary" />
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground font-medium">
                    Duration
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {formattedDuration}
                  </span>
                </div>
              </div>
            )}
            {participants > 0 && (
              <div className="flex items-center gap-2.5 rounded-xl bg-card border border-border px-4 py-3">
                <Users size={16} className="text-primary" />
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground font-medium">
                    Participants
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {participants}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Processing indicator */}
        <div className="flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-4 py-2">
          <Sparkles size={14} className="text-primary animate-pulse" />
          <span className="text-xs font-medium text-primary">
            AI is generating your summary...
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <Button
            asChild
            variant="outline"
            className="w-full rounded-xl h-11"
          >
            <Link href="/meetings">
              <Calendar className="w-4 h-4 mr-2" />
              All Meetings
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};
