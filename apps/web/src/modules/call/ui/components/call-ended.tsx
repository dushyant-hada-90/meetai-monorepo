import { Button } from "@/components/ui/button"
import { CheckCircle, Clock, Home, Calendar } from "lucide-react"
import Link from "next/link"
import { useState, useEffect } from "react"

interface CallEndedProps {
    duration?: number
    participants?: number
}

export const CallEnded = ({ duration = 0, participants = 0 }: CallEndedProps) => {
    const [callDuration, setCallDuration] = useState("")

    useEffect(() => {
        if (duration > 0) {
            const hours = Math.floor(duration / 3600)
            const minutes = Math.floor((duration % 3600) / 60)
            const seconds = duration % 60

            if (hours > 0) {
                setCallDuration(`${hours}h ${minutes}m ${seconds}s`)
            } else if (minutes > 0) {
                setCallDuration(`${minutes}m ${seconds}s`)
            } else {
                setCallDuration(`${seconds}s`)
            }
        }
    }, [duration])

    return (
        <div className="flex flex-col items-center justify-center h-full bg-radial from-sidebar-accent to-sidebar">
            <div className="py-4 px-8 flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center justify-center gap-y-6 bg-background rounded-lg p-10 shadow-sm max-w-md w-full">
                    {/* Success Icon */}
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    
                    <div className="flex flex-col gap-y-2 text-center">
                        <h6 className="text-xl font-semibold">Call ended</h6>
                        <p className="text-sm text-muted-foreground">
                            Thanks for joining! Your meeting summary will be available shortly.
                        </p>
                    </div>

                    {/* Call Statistics */}
                    {(duration > 0 || participants > 0) && (
                        <div className="w-full bg-muted/20 rounded-lg p-4">
                            <div className="flex justify-center gap-8 text-sm">
                                {duration > 0 && (
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-muted-foreground" />
                                        <span>{callDuration}</span>
                                    </div>
                                )}
                                {participants > 0 && (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                            <span className="text-xs text-white font-medium">{participants}</span>
                                        </div>
                                        <span>{participants} participant{participants > 1 ? 's' : ''}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    
                    <div className="flex flex-col gap-3 w-full">
                        <Button asChild className="w-full">
                            <Link href="/meetings">
                                <Calendar className="w-4 h-4 mr-2" />
                                View all meetings
                            </Link>
                        </Button>
                        <Button asChild variant="outline" className="w-full">
                            <Link href="/dashboard">
                                <Home className="w-4 h-4 mr-2" />
                                Back to dashboard
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}