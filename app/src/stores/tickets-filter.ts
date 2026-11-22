import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { TicketStatus } from "../validation";
export type { TicketStatus } from "../validation";
export type Filters = { search: string; status: TicketStatus | "" };
type Store = {
    filters: Filters;
    page: number;
    applyFilters: (filters: Filters) => void;
    setPage: (page: number) => void;
};

export const useTicketsFilter = create<Store>()(persist(
    (set) => ({
        filters: { search: "", status: "" },
        page: 1,
        applyFilters: (filters) => set({
            filters: { ...filters, search: filters.search.trim() }, page: 1,
        }),
        setPage: (page) => set({ page: Math.max(1, Math.trunc(page)) }),
    }),
    {
        name: "tickets-filters",
        storage: createJSONStorage(() => localStorage),
        partialize: ({ filters }) => ({ filters }),
    },
));
