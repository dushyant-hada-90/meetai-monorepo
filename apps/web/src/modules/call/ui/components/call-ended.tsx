"use client";

import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  Users,
  Calendar,
  FileText,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

interface CallEndedProps {
  duration?: number;
  participants?: number;
  meetingId?: string;
}

export const CallEnded = ({
  duration = 0,
  participants = 0,
  meetingId,
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
    <div className="flex min-h-screen w-full items-center justify-center bg-neutral-950 p-4 font-sans">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/20 via-neutral-950 to-neutral-950" />

      <div
        className={`relative z-10 flex flex-col items-center gap-8 transition-all duration-700 ${
          showContent
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4"
        }`}
      >
        {/* Success icon with animated ring */}
        <div className="relative">
          <div className="absolute -inset-3 rounded-full bg-emerald-500/10 animate-ping" style={{ animationDuration: "3s" }} />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          </div>
        </div>

        {/* Main text */}
        <div className="flex flex-col items-center gap-2 text-center max-w-sm">
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            Meeting Ended
          </h1>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Your meeting has been recorded. An AI summary is being generated and will be available shortly.
          </p>
        </div>

        {/* Stats cards */}
        {(duration > 0 || participants > 0) && (
          <div className="flex items-center gap-3">
            {duration > 0 && (
              <div className="flex items-center gap-2.5 rounded-xl bg-neutral-900/60 border border-white/5 px-4 py-3">
                <Clock size={16} className="text-indigo-400" />
                <div className="flex flex-col">
                  <span className="text-xs text-neutral-500 font-medium">
                    Duration
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {formattedDuration}
                  </span>
                </div>
              </div>
            )}
            {participants > 0 && (
              <div className="flex items-center gap-2.5 rounded-xl bg-neutral-900/60 border border-white/5 px-4 py-3">
                <Users size={16} className="text-purple-400" />
                <div className="flex flex-col">
                  <span className="text-xs text-neutral-500 font-medium">
                    Participants
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {participants}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Processing indicator */}
        <div className="flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-4 py-2">
          <Sparkles size={14} className="text-indigo-400 animate-pulse" />
          <span className="text-xs font-medium text-indigo-300">
            AI is generating your summary...
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          {meetingId && (
            <Button
              asChild
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-11 shadow-lg shadow-indigo-500/20"
            >
              <Link href={`/meetings/${meetingId}`}>
                <FileText className="w-4 h-4 mr-2" />
                View Transcript
                <ArrowRight className="w-4 h-4 ml-auto" />
              </Link>
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            className="w-full rounded-xl h-11 border-white/10 bg-neutral-900/50 hover:bg-neutral-800 text-neutral-300"
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
