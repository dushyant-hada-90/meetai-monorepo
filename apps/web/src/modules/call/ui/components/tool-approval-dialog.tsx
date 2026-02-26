"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, Users, X, Check, Pencil, TimerReset } from "lucide-react";

// ─────────────────────────────────────────────────────────
// Types for Tool Approval System
// ─────────────────────────────────────────────────────────

export interface CalendarEventPayload {
  title: string;
  description: string;
  startISO: string;
  endISO: string;
  attendees: string[];
}

export interface ToolApprovalRequest {
  meetingId: string;
  agentId: string;
  type: "create_calendar_event";
  targetParticipant?: string;
  payload: CalendarEventPayload;
  /** epoch ms when the agent called performRpc — used to seed the countdown */
  invokedAt?: number;
  /** how long (ms) the agent will wait before timing out — mirrors responseTimeout */
  timeoutMs?: number;
}

export interface ToolApprovalResponse {
  approved: boolean;
  modifiedPayload?: CalendarEventPayload;
  reason?: string;
}

interface ToolApprovalDialogProps {
  request: ToolApprovalRequest | null;
  onRespond: (response: ToolApprovalResponse) => void;
}

// ─────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────
function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function formatDateTimeInput(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────
// Countdown Timer Sub-component
// Seeds from invokedAt + timeoutMs so network transit time is
// automatically subtracted — the bar starts already partially
// depleted by however long the RPC took to arrive.
// ─────────────────────────────────────────────────────────
function CountdownTimer({
  invokedAt,
  timeoutMs,
  onExpire,
}: {
  invokedAt: number;
  timeoutMs: number;
  onExpire: () => void;
}) {
  const totalSec = Math.round(timeoutMs / 1000);

  const calcRemaining = () =>
    Math.max(0, Math.round((invokedAt + timeoutMs - Date.now()) / 1000));

  const [remainingSec, setRemainingSec] = useState<number>(calcRemaining);

  useEffect(() => {
    // Re-seed immediately in case the component mounts after some lag
    setRemainingSec(calcRemaining());

    const tick = setInterval(() => {
      const next = calcRemaining();
      setRemainingSec(next);
      if (next <= 0) {
        clearInterval(tick);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invokedAt, timeoutMs]);

  const fraction = totalSec > 0 ? remainingSec / totalSec : 0;

  const barColor =
    fraction > 0.5
      ? "bg-primary"
      : fraction > 0.25
      ? "bg-amber-500"
      : "bg-destructive";

  const textColor =
    fraction > 0.5
      ? "text-muted-foreground"
      : fraction > 0.25
      ? "text-amber-500"
      : "text-destructive";

  return (
    <div className="flex items-center gap-2 pb-1">
      <TimerReset className={`h-3.5 w-3.5 shrink-0 ${textColor}`} />
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <span className={`text-xs font-mono tabular-nums font-semibold min-w-[3ch] text-right ${textColor}`}>
        {remainingSec}s
      </span>
    </div>
  );
}

export function ToolApprovalDialog({ request, onRespond }: ToolApprovalDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedPayload, setEditedPayload] = useState<CalendarEventPayload | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  
  // Keep track of the last known request to allow closing animations to finish
  // without TypeScript or runtime errors about missing data.
  const [lastKnownRequest, setLastKnownRequest] = useState<ToolApprovalRequest | null>(null);

  // Sync incoming requests and reset state
  useEffect(() => {
    console.log("📥 request prop changed", { request });
    if (request) {
      console.log("📋 New approval request received, resetting dialog state", { request });
      setLastKnownRequest(request);
      setIsEditing(false);
      setEditedPayload(null);
      setRejectionReason("");
      setShowRejectInput(false);
    }
  }, [request]);

  const isOpen = request !== null;
  
  // log open state changes
  useEffect(() => {
    console.log("🔳 dialog open state changed", { isOpen });
  }, [isOpen]);

  // Use lastKnownRequest so the UI doesn't crash during the closing animation
  const activeRequest = request || lastKnownRequest;
  const payload = editedPayload || activeRequest?.payload;

  // log whenever activeRequest changes
  useEffect(() => {
    console.log("ℹ️ activeRequest changed", { activeRequest });
  }, [activeRequest]);

  // Auto-reject when the countdown expires so UI stays in sync with agent timeout
  const handleTimerExpire = useCallback(() => {
    if (!request) return;
    console.log("⏰ Countdown expired — auto-rejecting approval request");
    onRespond({ approved: false, reason: "Timed out — no response from user" });
  }, [onRespond, request]);

  const handleClose = useCallback(() => {
    console.log("🚪 dialog closing via handleClose");
    if (!request) return; // Prevent double-fires
    onRespond({ approved: false, reason: "User dismissed the dialog" });
    setIsEditing(false);
    setShowRejectInput(false);
  }, [onRespond, request]);

  const handleApprove = useCallback(() => {
    console.log("✅ Approve button clicked", {
      payload: editedPayload || activeRequest?.payload,
    });
    if (!activeRequest) return;
    onRespond({
      approved: true,
      modifiedPayload: editedPayload || undefined,
    });
  }, [onRespond, editedPayload, activeRequest]);

  const handleReject = useCallback(() => {
    console.log("❌ Reject button clicked", { reason: rejectionReason });
    if (!activeRequest) return;
    if (!showRejectInput) {
      setShowRejectInput(true);
      return;
    }
    onRespond({
      approved: false,
      reason: rejectionReason || "User declined",
    });
  }, [onRespond, rejectionReason, showRejectInput, activeRequest]);

  const handleStartEdit = useCallback(() => {
    if (activeRequest?.payload) {
      setEditedPayload({ ...activeRequest.payload });
      setIsEditing(true);
    }
  }, [activeRequest]);

  const updateField = useCallback((field: keyof CalendarEventPayload, value: string | string[]) => {
    setEditedPayload((prev) => {
      // Fallback to activeRequest payload if prev is null
      if (!prev && activeRequest?.payload) {
        return { ...activeRequest.payload, [field]: value };
      }
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
  }, [activeRequest]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        console.log("🔁 onOpenChange fired", { open });
        if (!open) handleClose();
      }}>
      <DialogContent className="sm:max-w-125">
        {/* Only render contents if we have a valid payload */}
        {activeRequest && payload && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Calendar Event Request
              </DialogTitle>
              <DialogDescription>
                {activeRequest.targetParticipant ? (
                  <>
                    <span className="font-medium text-foreground">{activeRequest.targetParticipant}</span>, the AI assistant wants to add this event to your calendar.
                  </>
                ) : (
                  "The AI assistant is requesting to create the following calendar event."
                )}
                {" "}Review and approve or reject.
              </DialogDescription>
            </DialogHeader>

            {/* Countdown timer — only shown when the agent supplied timing metadata */}
            {activeRequest.invokedAt !== undefined && activeRequest.timeoutMs !== undefined && (
              <CountdownTimer
                invokedAt={activeRequest.invokedAt}
                timeoutMs={activeRequest.timeoutMs}
                onExpire={handleTimerExpire}
              />
            )}

            <div className="space-y-4 py-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-medium">
                  Event Title
                </Label>
                {isEditing ? (
                  <Input
                    id="title"
                    value={payload.title}
                    onChange={(e) => updateField("title", e.target.value)}
                  />
                ) : (
                  <p className="text-sm font-semibold text-foreground">{payload.title}</p>
                )}
              </div>

              {/* Description */}
              {(payload.description || isEditing) && (
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">
                    Description
                  </Label>
                  {isEditing ? (
                    <Textarea
                      id="description"
                      value={payload.description}
                      onChange={(e) => updateField("description", e.target.value)}
                      rows={2}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">{payload.description}</p>
                  )}
                </div>
              )}

              {/* Date/Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Start
                  </Label>
                  {isEditing ? (
                    <Input
                      type="datetime-local"
                      value={formatDateTimeInput(payload.startISO)}
                      onChange={(e) => updateField("startISO", new Date(e.target.value).toISOString())}
                    />
                  ) : (
                    <p className="text-sm text-foreground">{formatDateTime(payload.startISO)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    End
                  </Label>
                  {isEditing ? (
                    <Input
                      type="datetime-local"
                      value={formatDateTimeInput(payload.endISO)}
                      onChange={(e) => updateField("endISO", new Date(e.target.value).toISOString())}
                    />
                  ) : (
                    <p className="text-sm text-foreground">{formatDateTime(payload.endISO)}</p>
                  )}
                </div>
              </div>

              {/* Attendees */}
              {((payload.attendees && payload.attendees.length > 0) || isEditing) && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Attendees
                  </Label>
                  {isEditing ? (
                    <Input
                      placeholder="Comma-separated emails"
                      value={payload.attendees ? payload.attendees.join(", ") : ""}
                      onChange={(e) =>
                        updateField(
                          "attendees",
                          e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        )
                      }
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {payload.attendees && payload.attendees.length > 0
                        ? payload.attendees.join(", ")
                        : "No attendees specified"}
                    </p>
                  )}
                </div>
              )}

              {/* Rejection reason input */}
              {showRejectInput && (
                <div className="space-y-2">
                  <Label htmlFor="rejection-reason" className="text-sm font-medium">
                    Reason for rejection (optional)
                  </Label>
                  <Input
                    id="rejection-reason"
                    placeholder="E.g., wrong time, need to reschedule..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              {!isEditing && !showRejectInput && (
                <Button variant="outline" size="sm" onClick={handleStartEdit}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
              {showRejectInput && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRejectInput(false)}
                >
                  Cancel
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleReject}
                >
                  <X className="h-4 w-4 mr-1" />
                  {showRejectInput ? "Confirm Reject" : "Reject"}
                </Button>
                {!showRejectInput && (
                  <Button size="sm" onClick={handleApprove}>
                    <Check className="h-4 w-4 mr-1" />
                    {isEditing ? "Save & Approve" : "Approve"}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}