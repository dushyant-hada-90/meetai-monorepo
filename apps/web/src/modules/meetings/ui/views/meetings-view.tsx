"use client"

import { DataTable } from "@/components/data-table";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { columns } from "../components/columns";
import { EmptyState } from "@/components/empty-state";
import { useRouter } from "next/navigation";
import { useMeetingsFilters } from "../../hooks/use-meetings-filters";
import { DataPagination } from "@/components/data-pagination";

export const MeetingsView = () => {
  const trpc = useTRPC();
  const router = useRouter()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useMeetingsFilters()
  // console.log(filters,"---")
  const { data } = useSuspenseQuery(trpc.meetings.getMany.queryOptions({
    ...filters
  },
    {
      refetchInterval: (query) => {
        // In v5, the callback receives the 'query' object
        const currentData = query.state.data;

        const isAnyProcessing = currentData?.items?.some(item => item.status === "active" || item.status === "processing") ?? false;

        if (isAnyProcessing) {
          return 5000; // Poll every 2s
        }

        // 2. Otherwise, stop polling
        return false;
      },

      // Resource Saving: This is false by default, but good to be explicit.
      // It ensures polling STOPS when the user switches tabs.
      refetchIntervalInBackground: false,
    }
  ));

  // Keep individual meeting cache entries in sync with the polled list
  React.useEffect(() => {
    if (!data?.items) return;

    data.items.forEach((item) => {
      const opts = trpc.meetings.getOne.queryOptions({ id: item.id });
      // Update the cached meeting detail so navigation shows the latest status
      queryClient.setQueryData(opts.queryKey, item);
    });
  }, [data, queryClient, trpc]);

  return (
    <div className="flex-1 pb-4 px-4 md:px-8 flex flex-col gap-y-4">
      <DataTable data={data.items} columns={columns} onRowClick={(row) => router.push(`/meetings/${row.id}`)} />
      <DataPagination
        page={filters.page}
        totalPages={data.totalPages}
        onPageChange={(page) => setFilters({ page })} />
      {data.items.length === 0 && (
        <EmptyState
          title="Create your first meeting"
          description="Schedule a meeting to connect with others. Each meeting lets you collaborate, share ideas, and interact with participants in real time."
        />
      )}
    </div>
  )
}
export const MeetingsViewLoading = () => {
  return (
    <LoadingState
      title="Loading Meetings"
      description="This may take a few seconds" />
  )
}

export const MeetingsViewError = () => {
  return (
    <ErrorState
      title="Error Loading Meetings"
      description="Something went wrong"
    />
  );
}

