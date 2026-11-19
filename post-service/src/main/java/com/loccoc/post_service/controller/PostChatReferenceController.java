package com.loccoc.post_service.controller;

import com.loccoc.post_service.dto.ChatPostReference;
import com.loccoc.post_service.service.PostChatReferenceService;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/posts")
public class PostChatReferenceController {
  private final PostChatReferenceService service;
  public PostChatReferenceController(PostChatReferenceService service) { this.service = service; }

  @GetMapping("/{id}/chat-reference")
  public ResponseEntity<ChatPostReference> get(
      @RequestHeader(value = "Authorization", required = false) String authorization,
      @PathVariable UUID id) {
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(authorization, id));
  }
}
