package com.loccoc.api_gateway.controller;

import com.loccoc.api_gateway.service.*;
import jakarta.servlet.http.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class GatewayController {
  private final ProxyService proxy;
  private final RateLimitService limiter;

  public GatewayController(ProxyService proxy, RateLimitService limiter) {
    this.proxy = proxy;
    this.limiter = limiter;
  }

  @RequestMapping({
    "/auth",
    "/auth/**",
    "/users",
    "/users/**",
    "/admin",
    "/admin/**",
    "/payments",
    "/payments/**",
    "/subscriptions",
    "/subscriptions/**"
  })
  public ResponseEntity<?> forward(HttpServletRequest request, HttpServletResponse response) {
    limiter.check(request, response);
    return proxy.forward(request);
  }
}
