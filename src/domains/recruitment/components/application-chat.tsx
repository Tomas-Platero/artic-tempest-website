"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  IconLoader2,
  IconMessageCircle,
  IconPhoto,
  IconSend,
  IconUpload,
  IconUser,
  IconX,
} from "@/shared/ui/tabler-icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import { EmojiSuggestionList } from "@/shared/ui/emoji-suggestion-list";
import { EMOJI_LIST, getEmojiSearchTerms } from "@/shared/lib/emojis";
import { EmojiPicker } from "@/shared/components/emoji-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  DELIVERY_TONE_CLASSES,
  describeDelivery,
  type RecruitmentDelivery,
} from "@/shared/lib/recruitment/delivery-status";

type Props = {
  applicationId: string;
  otherPartyName?: string;
  readOnly?: boolean;
};

type ChatAuthor = {
  discord_username: string | null;
  discord_avatar: string | null;
  role_level: string | null;
};

type ChatMessage = {
  id: string;
  application_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: ChatAuthor | null;
  /** Only present for staff viewers: it is internal delivery information. */
  delivery?: RecruitmentDelivery | null;
  attachments?: Array<{
    url: string;
    name?: string;
    contentType?: string;
  }> | null;
};

type ComposerState = {
  newMessage: string;
  sending: boolean;
  showEmojis: boolean;
  emojiFilter: string;
  emojiCursorPos: number;
};

type ComposerAction =
  | { type: "set_message"; value: string }
  | { type: "set_sending"; value: boolean }
  | { type: "show_emojis"; value: boolean; filter?: string; cursorPos?: number }
  | { type: "set_emoji_filter"; value: string }
  | { type: "set_emoji_cursor"; value: number }
  | { type: "reset"; value?: string };

const initialComposerState: ComposerState = {
  newMessage: "",
  sending: false,
  showEmojis: false,
  emojiFilter: "",
  emojiCursorPos: 0,
};

function composerReducer(
  state: ComposerState,
  action: ComposerAction,
): ComposerState {
  switch (action.type) {
    case "set_message":
      return { ...state, newMessage: action.value };
    case "set_sending":
      return { ...state, sending: action.value };
    case "show_emojis":
      return {
        ...state,
        showEmojis: action.value,
        emojiFilter: action.filter ?? state.emojiFilter,
        emojiCursorPos: action.cursorPos ?? state.emojiCursorPos,
      };
    case "set_emoji_filter":
      return { ...state, emojiFilter: action.value };
    case "set_emoji_cursor":
      return { ...state, emojiCursorPos: action.value };
    case "reset":
      return { ...initialComposerState, newMessage: action.value ?? "" };
    default:
      return state;
  }
}

async function fetchChatMessages(
  applicationId: string,
): Promise<ChatMessage[]> {
  const res = await fetch(
    `/api/recruitment/chat?applicationId=${applicationId}`,
  );
  if (!res.ok) throw new Error("HTTP " + res.status);
  if (!res.ok) return [];
  return (await res.json()) as ChatMessage[];
}

async function fetchApplicantHint(
  applicationId: string,
): Promise<{ seen?: boolean }> {
  const res = await fetch(
    `/api/recruitment/chat/hint?applicationId=${applicationId}`,
  );
  if (!res.ok) throw new Error("HTTP " + res.status);
  if (!res.ok) return { seen: true };
  const data = (await res.json()) as { seen?: boolean };

  if (!data.seen) {
    void fetch("/api/recruitment/chat/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId }),
    }).catch((error) => {
      console.error("Error marking applicant hint as seen:", error);
    });
  }

  return data;
}

async function doSendChatMessage(
  applicationId: string,
  content: string,
  attachments: Array<{ url: string; name?: string; contentType?: string }>,
): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
  try {
    const res = await fetch("/api/recruitment/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, content, attachments }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || "Error al enviar mensaje" };
    }

    const json = await res.json();
    const createdMessage = json?.message as ChatMessage | undefined;
    if (!createdMessage) {
      return {
        success: false,
        error: "No se recibió el mensaje creado",
      };
    }

    return {
      success: true,
      message: {
        ...createdMessage,
        delivery: (json?.delivery as RecruitmentDelivery | null) ?? null,
      },
    };
  } catch (err: any) {
    console.error("Error sending message:", err);
    return {
      success: false,
      error: err.message || "Error al enviar mensaje",
    };
  }
}

async function doUploadFile(
  file: File,
  applicationId: string,
): Promise<{ url: string; name?: string; contentType?: string } | null> {
  const form = new FormData();
  form.append("file", file);
  form.append("applicationId", applicationId);

  try {
    const up = await fetch("/api/uploads/recruitment", {
      method: "POST",
      body: form,
    });
    if (!up.ok) return null;
    const json = await up.json();
    if (json?.url) {
      return {
        url: json.url,
        name: json.name,
        contentType: json.contentType,
      };
    }
  } catch (err) {
    console.error("Upload failed", err);
  }
  return null;
}

const messageTimeFormatter = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
});

const MESSAGE_ALLOWED_URL_PROTOCOLS = ["https:"] as const;

/**
 * Returns the URL if its protocol is safe for use in anchor href attributes.
 * Returns "#" (inert fallback) for javascript:, data:, or other unsafe protocols.
 */
function safeAnchorUrl(url: string | undefined | null): string {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    return (MESSAGE_ALLOWED_URL_PROTOCOLS as readonly string[]).includes(
      parsed.protocol,
    )
      ? url
      : "#";
  } catch {
    // If URL parsing fails (relative or malformed), return inert fallback
    return "#";
  }
}

function MessageTimestamp({ iso }: { iso: string }) {
  return (
    <span suppressHydrationWarning>
      {messageTimeFormatter.format(new Date(iso))}
    </span>
  );
}

/**
 * Shows whether Discord accepted this staff message. "Sin confirmar" means the bot
 * has not reported back yet, which is deliberately not the same as "Enviado".
 */
function DeliveryBadge({
  delivery,
  onRetry,
  retryingId,
}: {
  delivery?: RecruitmentDelivery | null;
  onRetry: (deliveryId: string) => void;
  retryingId: string | null;
}) {
  const info = describeDelivery(delivery ?? null);
  const canRetry =
    delivery?.status === "failed" || delivery?.status === "queued";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${DELIVERY_TONE_CLASSES[info.tone]}`}
        title={info.detail}
      >
        {info.label}
      </span>
      {canRetry && delivery && (
        <button
          type="button"
          onClick={() => onRetry(delivery.id)}
          disabled={retryingId === delivery.id}
          className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-300 underline underline-offset-2 transition-colors hover:text-blue-200 disabled:opacity-40"
        >
          Reintentar
        </button>
      )}
    </span>
  );
}

function useApplicationChat(applicationId: string) {
  const { data: session } = useSession();
  const [composer, dispatchComposer] = useReducer(
    composerReducer,
    initialComposerState,
  );
  const [attachments, setAttachments] = useState<
    Array<{ url: string; name?: string; contentType?: string }>
  >([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const authorCacheRef = useRef<Map<string, ChatAuthor>>(new Map());
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    data: messages = [],
    isLoading,
    mutate: mutateMessages,
  } = useSWR(
    applicationId ? ["recruitment-chat", applicationId] : null,
    () => fetchChatMessages(applicationId),
    { refreshInterval: 5000 },
  );

  const filteredEmojis = (() => {
    if (!composer.emojiFilter)
      return EMOJI_LIST.slice(0, 15).map((e) => e.char);

    const query = composer.emojiFilter.toLowerCase();
    return EMOJI_LIST.filter((e) =>
      getEmojiSearchTerms(e.name).some((term) =>
        term.toLowerCase().includes(query),
      ),
    )
      .slice(0, 15)
      .map((e) => e.char);
  })();

  const viewerRoleLevel = session?.user?.roleLevel?.toLowerCase?.();
  const viewerIsStaff =
    viewerRoleLevel === "gm" || viewerRoleLevel === "officer";
  const viewerIsApplicant = Boolean(session?.user?.id) && !viewerIsStaff;
  const applicantReplyHintEligible =
    viewerIsApplicant &&
    messages.some((msg) => {
      const roleLevel = msg.author?.role_level?.toLowerCase?.();
      return roleLevel === "gm" || roleLevel === "officer";
    }) &&
    !messages.some((msg) => msg.author_id === session?.user?.id);

  const { data: applicantHint } = useSWR(
    viewerIsApplicant && session?.user?.id && applicantReplyHintEligible
      ? ["recruitment-chat-hint", applicationId]
      : null,
    () => fetchApplicantHint(applicationId),
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    dispatchComposer({ type: "set_message", value });

    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/:(\w*)$/);

    if (match) {
      dispatchComposer({
        type: "show_emojis",
        value: true,
        filter: match[1],
        cursorPos: cursorPos - match[0].length,
      });
    } else {
      dispatchComposer({ type: "show_emojis", value: false });
    }
  };

  const onSelectEmoji = (emoji: any) => {
    const char = typeof emoji === "string" ? emoji : emoji.name;
    const textBefore = composer.newMessage.slice(0, composer.emojiCursorPos);
    const textAfter = composer.newMessage.slice(
      inputRef.current?.selectionStart || 0,
    );

    const updated = textBefore + char + " " + textAfter;
    dispatchComposer({ type: "set_message", value: updated });
    dispatchComposer({ type: "show_emojis", value: false });

    setTimeout(() => inputRef.current?.focus(), 10);
  };

  useEffect(() => {
    const nextCache = new Map<string, ChatAuthor>();
    messages.forEach((message) => {
      if (message.author && message.author_id) {
        nextCache.set(message.author_id, message.author);
      }
    });

    authorCacheRef.current = nextCache;
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composer.newMessage.trim() || !session?.user?.id || composer.sending)
      return;

    dispatchComposer({ type: "set_sending", value: true });
    const content = composer.newMessage.trim();
    dispatchComposer({ type: "reset" });

    const tempId = `temp-${Date.now()}`;
    const tempMsg: ChatMessage = {
      id: tempId,
      application_id: applicationId,
      author_id: session.user.id,
      content,
      created_at: new Date().toISOString(),
      author: {
        discord_username: session.user.username,
        discord_avatar: session.user.avatarUrl,
        role_level: session.user.roleLevel,
      },
    };
    const previousMessages = messages;
    void mutateMessages([...messages, tempMsg], { revalidate: false });

    const result = await doSendChatMessage(applicationId, content, attachments);
    dispatchComposer({ type: "set_sending", value: false });

    if (result.success && result.message) {
      const createdMessage = result.message;

      if (createdMessage.author) {
        authorCacheRef.current.set(
          createdMessage.author_id,
          createdMessage.author,
        );
      }

      void mutateMessages(
        (current = []) => {
          const withoutTemp = current.filter((m) => m.id !== tempId);
          if (withoutTemp.some((m) => m.id === createdMessage.id)) {
            return withoutTemp;
          }

          return [...withoutTemp, createdMessage];
        },
        { revalidate: false },
      );
    } else {
      toast.error("Error al enviar mensaje", {
        description: result.error || "Error al enviar mensaje",
      });
      dispatchComposer({ type: "set_message", value: content });
      void mutateMessages(previousMessages, { revalidate: false });
    }
  };

  const handleRetryDelivery = async (deliveryId: string) => {
    setRetryingId(deliveryId);

    // No `finally`: React Compiler cannot lower a TryStatement with a finalizer.
    try {
      const res = await fetch("/api/recruitment/deliveries/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("No se pudo reintentar el aviso", {
          description: (err as { error?: string })?.error,
        });
      } else {
        toast.success("Aviso reencolado");
        void mutateMessages();
      }
    } catch (err: any) {
      toast.error("No se pudo reintentar el aviso", {
        description: err?.message,
      });
    }

    setRetryingId(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const uploadTasks = Array.from(files).map((f) =>
      doUploadFile(f, applicationId),
    );

    const results = await Promise.all(uploadTasks);
    const uploaded: Array<{
      url: string;
      name?: string;
      contentType?: string;
    }> = results.filter((r): r is NonNullable<typeof r> => r !== null);

    if (uploaded.length > 0) {
      setAttachments((prev) => [...prev, ...uploaded]);
    }

    // reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const applicantChatHref =
    "https://artictempest.es/reclutamiento/apply-en-curso/chat";
  const applicantReplyHintVisible = Boolean(
    applicantHint && !applicantHint.seen,
  );

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const getMessageAuthorLabel = (msg: ChatMessage, isMe: boolean) => {
    const roleLevel = msg.author?.role_level?.toLowerCase?.();
    const authorRoleLabel =
      roleLevel === "gm"
        ? "GM"
        : roleLevel === "officer"
          ? "Oficial"
          : "Aplicante";

    if (isMe) return `Yo (${authorRoleLabel})`;

    if (authorRoleLabel === "Aplicante") {
      return viewerIsStaff
        ? "Aplicante"
        : (msg.author?.discord_username ?? "Aplicante");
    }

    return `${msg.author?.discord_username ?? "Staff"} (${authorRoleLabel})`;
  };

  return {
    applicantChatHref,
    applicantReplyHintVisible,
    attachments,
    fileInputRef,
    handleFileChange,
    removeAttachment,
    filteredEmojis,
    formRef,
    getMessageAuthorLabel,
    handleComposerKeyDown,
    handleInputChange,
    handleRetryDelivery,
    handleSendMessage,
    inputRef,
    isLoading,
    messages,
    onSelectEmoji,
    retryingDeliveryId: retryingId,
    scrollRef,
    sessionUserId: session?.user?.id,
    setNewMessage: (value: string) =>
      dispatchComposer({ type: "set_message", value }),
    showEmojis: composer.showEmojis,
    newMessage: composer.newMessage,
    sending: composer.sending,
    viewerIsStaff,
  };
}

export function ApplicationChat({
  applicationId,
  otherPartyName,
  readOnly = false,
}: Props) {
  const chat = useApplicationChat(applicationId);

  if (chat.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-[400px] gap-4">
        <IconLoader2 className="size-8 animate-spin text-blue-500" />
        <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest">
          Cargando chat…
        </p>
      </div>
    );
  }

  return (
    <Card
      className="bg-zinc-950/60 border-white/10 backdrop-blur-xl flex flex-col h-full overflow-hidden shadow-2xl"
      suppressHydrationWarning
    >
      <CardHeader className="py-4 border-b border-white/5 bg-white/[0.02]">
        <div className="space-y-1">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-blue-400 flex items-center gap-3">
            <IconMessageCircle className="size-4" />
            {readOnly ? "Historial de mensajes" : "Chat de Solicitud"}
            {otherPartyName && ` con ${otherPartyName}`}
          </CardTitle>
          {readOnly && (
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Vista de solo lectura
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
        <ChatMessageList
          scrollRef={chat.scrollRef}
          messages={chat.messages}
          currentUserId={chat.sessionUserId}
          getMessageAuthorLabel={chat.getMessageAuthorLabel}
          isStaffViewer={chat.viewerIsStaff}
          onRetryDelivery={(deliveryId) =>
            void chat.handleRetryDelivery(deliveryId)
          }
          retryingId={chat.retryingDeliveryId}
        />

        {!readOnly && (
          <div className="px-4 pt-4">
            {chat.applicantReplyHintVisible && (
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-xs text-blue-100">
                Si quieres responder, hazlo desde:{" "}
                <Link
                  href={chat.applicantChatHref}
                  className="font-bold underline underline-offset-4 text-blue-50 break-all"
                >
                  {chat.applicantChatHref}
                </Link>
              </div>
            )}
            {chat.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center mt-2">
                {chat.attachments.map((a, idx) => (
                  <div
                    key={a.url}
                    className="flex items-center gap-2 bg-zinc-900/60 p-2 rounded-lg border border-white/5"
                  >
                    {a.contentType?.startsWith("image/") ? (
                      <Image
                        src={a.url}
                        alt={a.name ?? "adjunto"}
                        width={40}
                        height={40}
                        className="object-cover rounded"
                      />
                    ) : (
                      <div className="w-10 h-10 flex items-center justify-center bg-zinc-800 rounded text-[9px] text-zinc-400 font-semibold uppercase">
                        {a.name?.endsWith(".pdf") ? "PDF" : "FILE"}
                      </div>
                    )}
                    <span className="text-[10px] text-zinc-400 max-w-[100px] truncate">
                      {a.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => chat.removeAttachment(idx)}
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                      aria-label="Eliminar adjunto"
                    >
                      <IconX className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!readOnly && (
          <ChatComposer
            formRef={chat.formRef}
            inputRef={chat.inputRef}
            sessionUserId={chat.sessionUserId}
            showEmojis={chat.showEmojis}
            filteredEmojis={chat.filteredEmojis}
            onSelectEmoji={chat.onSelectEmoji}
            onSubmit={chat.handleSendMessage}
            newMessage={chat.newMessage}
            onChangeInput={chat.handleInputChange}
            onKeyDown={chat.handleComposerKeyDown}
            setNewMessage={chat.setNewMessage}
            sending={chat.sending}
            fileInputRef={chat.fileInputRef}
            handleFileChange={(e) => void chat.handleFileChange(e)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ChatMessageList({
  scrollRef,
  messages,
  currentUserId,
  getMessageAuthorLabel,
  isStaffViewer,
  onRetryDelivery,
  retryingId,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  currentUserId?: string;
  getMessageAuthorLabel: (msg: ChatMessage, isMe: boolean) => string;
  isStaffViewer: boolean;
  onRetryDelivery: (deliveryId: string) => void;
  retryingId: string | null;
}) {
  return (
    <div
      className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10"
      ref={scrollRef}
    >
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-10">
          <div className="size-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
            <IconMessageCircle className="size-8 text-blue-500/50" />
          </div>
          <h3 className="text-white font-semibold mb-1 uppercase tracking-tight">
            Sin mensajes aún
          </h3>
          <p className="text-zinc-500 text-xs italic">
            Inicia la conversación para coordinar la entrevista o aclarar dudas.
          </p>
        </div>
      ) : (
        messages.map((msg) => {
          const isMe = msg.author_id === currentUserId;
          const roleLevel = msg.author?.role_level?.toLowerCase?.();
          const staffLabel =
            roleLevel === "gm"
              ? "GM"
              : roleLevel === "officer"
                ? "OFICIAL"
                : null;
          const isStaff = Boolean(staffLabel);

          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isMe ? "flex-row-reverse" : "flex-row"}`}
            >
              <div className="shrink-0 pt-1">
                {msg.author?.discord_avatar ? (
                  <div className="relative size-9 rounded-xl overflow-hidden border border-white/10 bg-white/5">
                    <Image
                      src={msg.author.discord_avatar}
                      alt="Avatar"
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="size-9 rounded-xl bg-zinc-800 flex items-center justify-center">
                    <IconUser className="size-5 text-zinc-500" />
                  </div>
                )}
              </div>
              <div
                className={`max-w-[80%] space-y-1 ${isMe ? "items-end" : "items-start"} flex flex-col`}
              >
                <div
                  className={`flex items-center gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                >
                  <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest leading-none">
                    {getMessageAuthorLabel(msg, isMe)}:
                  </span>
                  {isStaff && staffLabel && (
                    <Badge
                      variant="outline"
                      className="text-[8px] h-3.5 px-1 py-0 font-semibold border-blue-500/30 text-blue-400 bg-blue-500/5 uppercase"
                    >
                      {staffLabel}
                    </Badge>
                  )}
                </div>
                <div
                  className={`p-3.5 rounded-2xl text-[13px] leading-relaxed relative ${
                    isMe
                      ? "bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-500/10"
                      : "bg-zinc-900/80 text-zinc-100 rounded-tl-none border border-white/5"
                  }`}
                >
                  {msg.content ? <p>{msg.content}</p> : null}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.attachments.map((a, i) =>
                        a.contentType?.startsWith("image/") ? (
                          <a
                            // react-doctor-disable-line array-index-key
                            key={a.url || i} // react-doctor-disable-line no-array-index-as-key
                            href={safeAnchorUrl(a.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Image
                              src={a.url}
                              alt={a.name ?? "imagen adjunta"}
                              width={200}
                              height={150}
                              className="rounded-lg object-cover max-w-[200px] max-h-[150px]"
                            />
                          </a>
                        ) : (
                          <a
                            key={a.url || i} // react-doctor-disable-line no-array-index-as-key
                            href={safeAnchorUrl(a.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20 transition-colors"
                          >
                            📄 {a.name || "archivo adjunto"}
                          </a>
                        ),
                      )}
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-[10px] opacity-60">
                    <MessageTimestamp iso={msg.created_at} />
                    {isStaffViewer && isStaff && (
                      <DeliveryBadge
                        delivery={msg.delivery}
                        onRetry={onRetryDelivery}
                        retryingId={retryingId}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ChatComposer({
  formRef,
  inputRef,
  sessionUserId,
  showEmojis,
  filteredEmojis,
  onSelectEmoji,
  onSubmit,
  newMessage,
  onChangeInput,
  onKeyDown,
  setNewMessage,
  sending,
  fileInputRef,
  handleFileChange,
}: {
  formRef: React.RefObject<HTMLFormElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  sessionUserId?: string;
  showEmojis: boolean;
  filteredEmojis: string[];
  onSelectEmoji: (emoji: any) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  newMessage: string;
  onChangeInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  setNewMessage: (value: string) => void;
  sending: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [attachOpen, setAttachOpen] = useState(false);
  const attachTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerFileInput = () => {
    // Prevent stacking multiple timeouts from rapid clicks
    if (attachTimerRef.current) return;
    setAttachOpen(false);

    // Small delay so the popover closes before the file dialog opens.
    // Uses requestAnimationFrame as a deterministic alternative to a magic ms constant.
    const id = setTimeout(() => {
      attachTimerRef.current = null;
      fileInputRef.current?.click();
    }, 100);
    attachTimerRef.current = id;
  };

  // Cleanup timeout on unmount to avoid calling click() on a detached ref
  useEffect(() => {
    return () => {
      if (attachTimerRef.current) clearTimeout(attachTimerRef.current);
    };
  }, []);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="p-4 border-t border-white/5 bg-white/[0.01] relative"
    >
      {showEmojis && filteredEmojis.length > 0 && (
        <div className="absolute bottom-full left-4 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <EmojiSuggestionList items={filteredEmojis} command={onSelectEmoji} />
        </div>
      )}
      <div className="flex gap-2 items-end">
        <div className="relative flex-1 group">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
            <EmojiPicker
              recentScope={sessionUserId}
              onSelect={(emojiValue: string) => {
                const textBefore = newMessage.slice(
                  0,
                  inputRef.current?.selectionStart || 0,
                );
                const textAfter = newMessage.slice(
                  inputRef.current?.selectionEnd || 0,
                );
                setNewMessage(textBefore + emojiValue + textAfter);
                setTimeout(() => inputRef.current?.focus(), 10);
              }}
            />
          </div>
          <Input
            ref={inputRef}
            value={newMessage}
            onChange={onChangeInput}
            onKeyDown={onKeyDown}
            placeholder="Escribe un mensaje... (Usa : para emojis)"
            className="bg-zinc-950/40 border-white/10 h-11 pl-11 rounded-xl text-sm focus:border-blue-500/50 transition-colors group-focus-within:bg-zinc-950/60"
            autoComplete="off"
          />
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Attach button with popover */}
        <Popover open={attachOpen} onOpenChange={setAttachOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              className="h-11 w-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 shrink-0 transition-colors hover:scale-105 active:scale-95"
              aria-label="Adjuntar archivo"
            >
              <IconUpload className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="top"
            sideOffset={8}
            className="w-56 bg-zinc-900/95 backdrop-blur-xl border-white/10 text-white p-2 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 px-2 py-1.5">
              Adjuntar archivo
            </div>
            <button
              type="button"
              onClick={triggerFileInput}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-200 hover:bg-white/10 hover:text-white transition-colors"
            >
              <IconPhoto className="size-4 text-blue-400" />
              <span>Imagen o PDF</span>
            </button>
          </PopoverContent>
        </Popover>

        <Button
          type="submit"
          disabled={sending || !newMessage.trim()}
          className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 shrink-0 transition-colors hover:scale-105 active:scale-95"
        >
          {sending ? (
            <IconLoader2 className="size-5 animate-spin" />
          ) : (
            <IconSend className="size-4" />
          )}
        </Button>
      </div>
    </form>
  );
}
