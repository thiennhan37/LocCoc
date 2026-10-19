package com.loccoc.api_gateway.controller;

import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
public class HealthController {
  @GetMapping({"/", "/health"})
  public Map<String, String> health() {
    return Map.of("status", "ok", "service", "api-gateway-spring");
  }
}
