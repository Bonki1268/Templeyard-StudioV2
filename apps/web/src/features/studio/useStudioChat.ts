import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessage, ToolCallSummary } from '@templeyard/shared';
import { useState } from 'react';
import { fetchChat, streamChat } from '../../api/client';
import { videoDetailKey } from '../videos/useVideoDetail';

export function chatKey(videoId: string) {
  return ['chat', videoId] as const;
}

export function questionnaireKey(videoId: string) {
  return ['questionnaire', videoId] as const;
}

/** 串流中的 Agent 回覆（還沒存下來） */
export type LiveReply = { text: string[]; toolCalls: ToolCallSummary[] };

/**
 * 創作對話：對話紀錄、送出一句話（SSE 串流）、串流中的 Agent 回覆與錯誤。
 * 串流結束後重新讀取對話、問卷與影片（Agent 可能開啟了問卷、影片換了階段）。
 */
export function useStudioChat(videoId: string) {
  const queryClient = useQueryClient();
  const chat = useQuery({ queryKey: chatKey(videoId), queryFn: () => fetchChat(videoId), enabled: Boolean(videoId) });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveUser, setLiveUser] = useState<ChatMessage | null>(null);
  const [live, setLive] = useState<LiveReply | null>(null);

  /** 送出一句話；回傳這一輪 Agent 執行的操作（失敗時為 null） */
  async function send(content: string): Promise<ToolCallSummary[] | null> {
    setSending(true);
    setError(null);
    setLive({ text: [], toolCalls: [] });
    let result: ToolCallSummary[] | null = null;
    try {
      await streamChat(videoId, content, (event) => {
        if (event.type === 'user') setLiveUser(event.message);
        else if (event.type === 'text') setLive((old) => ({ text: [...(old?.text ?? []), event.text], toolCalls: old?.toolCalls ?? [] }));
        else if (event.type === 'tool') setLive((old) => ({ text: old?.text ?? [], toolCalls: [...(old?.toolCalls ?? []), event.call] }));
        else if (event.type === 'done') result = event.message.toolCalls;
        else setError(event.message);
      });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Agent 回覆失敗，請再試一次');
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatKey(videoId) }),
        queryClient.invalidateQueries({ queryKey: questionnaireKey(videoId) }),
        queryClient.invalidateQueries({ queryKey: videoDetailKey(videoId) }),
      ]);
      setLive(null);
      setLiveUser(null);
      setSending(false);
    }
    return result;
  }

  const saved = chat.data ?? [];
  const messages = liveUser && !saved.some((m) => m.id === liveUser.id) ? [...saved, liveUser] : saved;
  return { messages, live, sending, error, loadError: chat.error, send };
}
