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
  public ResponseEntity<PostResponse> publish(@Valid @RequestBody PhotoPostRequest request, @RequestHeader(value="Authorization", required=false) String authorization) {
    var post=service.publish(request, authorization);
    return ResponseEntity.created(URI.create("/posts/"+post.id())).body(post);
  }
  @GetMapping("/media/{id}")
  public ResponseEntity<byte[]> read(@PathVariable UUID id,@RequestHeader(value="Authorization",required=false) String token,
      @RequestParam(defaultValue="false") boolean preview) {
    return ResponseEntity.ok().contentType(preview?MediaType.IMAGE_JPEG:MediaType.IMAGE_PNG).cacheControl(CacheControl.noStore())
        .header("X-Content-Type-Options","nosniff").body(preview?service.preview(id,token):service.read(id,token));
  }
}
