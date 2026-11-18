package com.loccoc.post_service.controller;

import com.loccoc.post_service.dto.*;
import com.loccoc.post_service.service.PostService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/posts")
public class PostController {
  private final PostService service;

  public PostController(PostService service) { this.service = service; }

  @PostMapping
  public ResponseEntity<PostResponse> create(@Valid @RequestBody CreatePostRequest request, @RequestHeader(value="Authorization",required=false) String token) {
    PostResponse post = service.create(request,token);
    return ResponseEntity.created(URI.create("/posts/" + post.id())).body(post);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable UUID id, @RequestParam(required=false) UUID ownerId, @RequestHeader(value="Authorization",required=false) String token) {
    service.delete(id, ownerId, token);
    return ResponseEntity.noContent().build();
  }
}
