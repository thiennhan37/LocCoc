package com.loccoc.post_service.controller;
import com.loccoc.post_service.dto.*;
import com.loccoc.post_service.service.MomentService;
import jakarta.validation.Valid;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/moments")
public class MomentController {
  private final MomentService service;
  public MomentController(MomentService service) { this.service=service; }
  @PostMapping @ResponseStatus(HttpStatus.CREATED)
  public Object create(@RequestHeader(value="Authorization",required=false) String token,@Valid @RequestBody MomentRequest body) { return service.create(token,body); }
  @GetMapping public Object list(@RequestHeader(value="Authorization",required=false) String token,@RequestParam(defaultValue="20") int limit,@RequestParam(required=false) String cursor) { return service.list(token,limit,cursor); }
  @GetMapping("/{id}") public Object get(@RequestHeader(value="Authorization",required=false) String token,@PathVariable UUID id) { return service.get(token,id); }
  @PutMapping("/{id}/image") public Object upload(@RequestHeader(value="Authorization",required=false) String token,@PathVariable UUID id,@RequestHeader("Content-Type") String mime,@RequestBody byte[] bytes) { return service.upload(token,id,bytes,mime); }
  @GetMapping(value="/{id}/image",produces="image/png") public ResponseEntity<byte[]> image(@RequestHeader(value="Authorization",required=false) String token,@PathVariable UUID id) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body(service.image(token,id)); }
  @DeleteMapping("/{id}") public Object remove(@RequestHeader(value="Authorization",required=false) String token,@PathVariable UUID id) { service.remove(token,id);return Map.of("deleted",true); }
  @PostMapping("/{id}/retry-index") public Object retry(@RequestHeader(value="Authorization",required=false) String token,@PathVariable UUID id) { service.retry(token,id);return Map.of("indexStatus","pending"); }
  @PostMapping("/search") public Object search(@RequestHeader(value="Authorization",required=false) String token,@Valid @RequestBody MomentSearch body) { return service.search(token,body); }
}
