package com.loccoc.post_service.controller;

import com.loccoc.post_service.dto.*;
import com.loccoc.post_service.service.PhotoPostService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/posts")
public class PhotoPostController {
  private final PhotoPostService service;
  public PhotoPostController(PhotoPostService service) { this.service=service; }
  @PostMapping("/photos")
  public ResponseEntity<PostResponse> publish(@Valid @RequestBody PhotoPostRequest request) {
    var post=service.publish(request);
    return ResponseEntity.created(URI.create("/posts/"+post.id())).body(post);
  }
  @GetMapping(value="/media/{id}",produces=MediaType.IMAGE_PNG_VALUE)
  public ResponseEntity<byte[]> read(@PathVariable UUID id) {
    return ResponseEntity.ok().cacheControl(CacheControl.noStore())
        .header("X-Content-Type-Options","nosniff").body(service.read(id));
  }
}
