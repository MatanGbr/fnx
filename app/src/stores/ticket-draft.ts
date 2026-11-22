import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type TicketDraft = {
    title: string;
    description: string;
    setTitle: (title: string) => void;
    setDescription: (description: string) => void;
    reset: () => void;
};

export const useTicketDraft = create<TicketDraft>()(persist(
    (set) => ({
        title: "",
        description: "",
        setTitle: (title) => set({ title }),
        setDescription: (description) => set({ description }),
        reset: () => set({ title: "", description: "" }),
    }),
    {
        name: "new-ticket-draft",
        storage: createJSONStorage(() => localStorage),
        partialize: ({ title, description }) => ({ title, description }),
    },
));
