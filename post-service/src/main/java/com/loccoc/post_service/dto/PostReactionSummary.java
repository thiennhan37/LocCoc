package com.loccoc.post_service.dto;

import java.util.Map;

public record PostReactionSummary(Map<String,Long> counts, String myReaction) {}
