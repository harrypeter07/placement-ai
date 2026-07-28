"use client";

import { TelegramConnectCard } from "@/components/dashboard/telegram-connect";

export function TelegramSetupCard({ hideConnect = false }: { hideConnect?: boolean }) {
  if (hideConnect) return null;
  return <TelegramConnectCard />;
}
