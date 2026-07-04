"use client";

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
                if (error instanceof Error && error.message.includes("401")) {
                    return false;
                }
                return failureCount < 2;
            },
        },
    },
});

export function QueryProvider({ children }: { children: ReactNode; }) {
    return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
}
