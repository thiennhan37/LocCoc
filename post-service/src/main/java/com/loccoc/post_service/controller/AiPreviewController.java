package com.loccoc.post_service.controller;
import com.loccoc.post_service.dto.AiPreviewRequest;
import com.loccoc.post_service.service.*;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/posts/photos/enhance")
public class AiPreviewController {
  private final AiPreviewService service;
  public AiPreviewController(AiPreviewService service) { this.service=service; }
  @PostMapping
  public ResponseEntity<AiImageClient.Result> enhance(@Valid @RequestBody AiPreviewRequest request,
      @RequestHeader(value="Authorization",required=false) String authorization) {
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.enhance(request,authorization));
  }
}
