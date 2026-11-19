package com.loccoc.post_service.dto;

import java.util.UUID;

public record ChatPostReference(UUID postId, UUID ownerId, String mediaKey) {}
