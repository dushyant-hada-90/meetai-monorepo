"use client"
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  console.error(error);

  return (
    <div className="flex flex-col items-center gap-4">
      <ErrorState
        title="Error Loading Meetings"
        description="Something went wrong"
      />
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
