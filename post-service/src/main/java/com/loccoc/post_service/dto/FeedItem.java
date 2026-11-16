package com.loccoc.post_service.dto;
import java.time.Instant;
import java.util.UUID;
public record FeedItem(UUID id, UUID ownerId, String mediaKey, short mediaType, String caption,
    Instant createdAt, String authorName, boolean mine, boolean seen, int priority) {}
