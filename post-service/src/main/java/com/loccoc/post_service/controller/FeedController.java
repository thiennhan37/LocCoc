package com.loccoc.post_service.controller;
import com.loccoc.post_service.service.FeedService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.CacheControl;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/posts")
public class FeedController {
  private final FeedService service;
  public FeedController(FeedService service) { this.service=service; }
  @GetMapping("/feed")
  public ResponseEntity<FeedService.Page> page(@RequestHeader(value="Authorization",required=false) String token,
      @RequestParam(defaultValue="20") int limit,@RequestParam(required=false) String cursor) {
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.page(token,limit,cursor));
  }
  @PutMapping("/{id}/seen") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void seen(@RequestHeader(value="Authorization",required=false) String token,@PathVariable UUID id) {
    service.seen(token,id);
  }
}
