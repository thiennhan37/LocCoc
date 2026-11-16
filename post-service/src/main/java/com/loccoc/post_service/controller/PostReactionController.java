package com.loccoc.post_service.controller;

import com.loccoc.post_service.dto.*;
import com.loccoc.post_service.service.PostReactionService;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/posts")
public class PostReactionController {
  private final PostReactionService service;
  public PostReactionController(PostReactionService service) { this.service=service; }
  @GetMapping("/{id}/reactions")
  public ResponseEntity<PostReactionSummary> get(@RequestHeader(value="Authorization",required=false) String token, @PathVariable UUID id) {
    return response(service.get(token,id));
  }
  @PutMapping("/{id}/reaction")
  public ResponseEntity<PostReactionSummary> set(@RequestHeader(value="Authorization",required=false) String token, @PathVariable UUID id,
      @RequestBody SetPostReactionRequest request) {
    return response(service.set(token,id,request.emoji()));
  }
  @DeleteMapping("/{id}/reaction")
  public ResponseEntity<PostReactionSummary> remove(@RequestHeader(value="Authorization",required=false) String token, @PathVariable UUID id) {
    return response(service.remove(token,id));
  }
  private ResponseEntity<PostReactionSummary> response(PostReactionSummary summary) {
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(summary);
  }
}
