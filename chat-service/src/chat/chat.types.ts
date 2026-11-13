export interface ChatMessage {
  id: string; conversationId: string; senderId: string; clientMessageId: string;
  sequence: string; text: string; createdAt: string;
}
export interface SafePeer { id: string; username: string; displayName: string | null; avatarUrl: string | null }
export interface Member {
  id: string; peerId: string; lastReadSequence: string; peerLastReadSequence: string;
  unreadCount: number; lastMessage: ChatMessage | null; updatedAt: string;
}
export interface Conversation extends Omit<Member, 'peerId'> { peer: SafePeer | null; canInteract: boolean }
export interface HistoryQuery { limit: number; before?: string; after?: string }
export const CHAT_EVENTS = Symbol('CHAT_EVENTS');
export interface ChatEvents { publish(accountIds: string[], event: string, payload: unknown, conversationId: string): Promise<void> }
