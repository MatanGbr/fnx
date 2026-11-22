import { create } from "zustand";

type ConnectionState = "checking" | "connected" | "unavailable" | "offline";
export const useConnection = create<{
    status: ConnectionState;
    setStatus: (status: ConnectionState) => void;
}>((set) => ({
    status: navigator.onLine ? "checking" : "offline",
    setStatus: (status) => set({ status }),
}));
