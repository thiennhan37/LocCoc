import { isUUID } from 'class-validator';
export interface SocialEvent {
  eventId: string;
  eventType: 'FRIEND_REQUEST_RECEIVED' | 'FRIEND_REQUEST_ACCEPTED';
  aggregateId: string;
  timestamp: string;
  version: 1;
  data: {
    recipientId: string;
    friendRequestId: string;
    actor: { id: string; displayName: string | null; avatarUrl: string | null };
  };
}
export function parseEvent(raw: unknown): SocialEvent {
  const e = raw as SocialEvent | undefined,
    a = e?.data?.actor;
  if (
    !e ||
    !isUUID(e.eventId) ||
    !isUUID(e.aggregateId) ||
    e.version !== 1 ||
    !['FRIEND_REQUEST_RECEIVED', 'FRIEND_REQUEST_ACCEPTED'].includes(
      e.eventType,
    ) ||
    !isUUID(e.data?.recipientId) ||
    e.aggregateId !== e.data.friendRequestId ||
    !a ||
    !isUUID(a.id) ||
    a.id === e.data.recipientId ||
    (a.displayName !== null &&
      (typeof a.displayName !== 'string' || a.displayName.length > 255)) ||
    (a.avatarUrl !== null &&
      (typeof a.avatarUrl !== 'string' ||
        a.avatarUrl.length > 2048 ||
        !/^https?:\/\//.test(a.avatarUrl))) ||
    typeof e.timestamp !== 'string' ||
    !Number.isFinite(Date.parse(e.timestamp)) ||
    Date.parse(e.timestamp) > Date.now() + 300000
  )
    throw new Error('Invalid social notification event');
  return {
    eventId: e.eventId,
    eventType: e.eventType,
    aggregateId: e.aggregateId,
    timestamp: e.timestamp,
    version: 1,
    data: {
      recipientId: e.data.recipientId,
      friendRequestId: e.aggregateId,
      actor: { id: a.id, displayName: a.displayName, avatarUrl: a.avatarUrl },
    },
  };
}
