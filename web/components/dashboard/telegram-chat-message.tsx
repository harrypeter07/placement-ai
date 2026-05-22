"use client";

import { useState } from "react";
import { FileText, Image as ImageIcon, Mic, Film, Sticker } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface ChatMessageView {
  _id: string;
  groupId: string;
  messageId: string;
  text: string;
  senderName?: string;
  sentAt: string;
  mediaType?: string;
  hasMedia?: boolean;
}

function MediaIcon({ type }: { type?: string }) {
  if (type === "photo") return <ImageIcon className="h-3.5 w-3.5" />;
  if (type === "video") return <Film className="h-3.5 w-3.5" />;
  if (type === "voice") return <Mic className="h-3.5 w-3.5" />;
  if (type === "sticker") return <Sticker className="h-3.5 w-3.5" />;
  if (type === "document") return <FileText className="h-3.5 w-3.5" />;
  return null;
}

export function TelegramChatMessage({ message }: { message: ChatMessageView }) {
  const [imgError, setImgError] = useState(false);
  const isPhoto = message.mediaType === "photo" && message.hasMedia;
  const mediaUrl =
    isPhoto && !imgError
      ? `/api/telegram/messages/media?groupId=${encodeURIComponent(message.groupId)}&messageId=${encodeURIComponent(message.messageId)}`
      : null;

  return (
    <div className="rounded-xl border border-white/5 bg-muted/30 p-3 max-w-[95%]">
      {message.senderName && (
        <p className="text-xs font-medium text-primary mb-1.5">{message.senderName}</p>
      )}
      {mediaUrl && (
        <div className="mb-2 rounded-lg overflow-hidden bg-black/20 max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt=""
            className="max-h-64 w-full object-contain"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </div>
      )}
      {message.hasMedia && message.mediaType !== "photo" && (
        <p
          className={cn(
            "text-xs flex items-center gap-1 text-muted-foreground mb-1",
            !message.text.startsWith("[") && "mb-2"
          )}
        >
          <MediaIcon type={message.mediaType} />
          <span className="capitalize">{message.mediaType}</span>
        </p>
      )}
      <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
      <p className="text-[10px] text-muted-foreground mt-2 text-right">{formatDate(message.sentAt)}</p>
    </div>
  );
}
