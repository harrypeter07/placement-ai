import { create } from "zustand";
import type { NotificationItem } from "@/types";

interface AppState {
  sidebarOpen: boolean;
  commandOpen: boolean;
  notifications: NotificationItem[];
  setSidebarOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  setNotifications: (notifications: NotificationItem[]) => void;
  markNotificationRead: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: false,
  commandOpen: false,
  notifications: [],
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setCommandOpen: (open) => set({ commandOpen: open }),
  setNotifications: (notifications) => set({ notifications }),
  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),
}));
