"use client"
import { ErrorState } from "@/components/error-state";

export default function Error({
  error: _error,
  reset: _reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <ErrorState
      title="Error Loading Agents"
      description="Something went wrong"
    />
  )
}
