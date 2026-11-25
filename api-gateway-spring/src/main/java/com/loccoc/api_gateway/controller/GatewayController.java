package com.loccoc.api_gateway.controller;

import com.loccoc.api_gateway.service.AccountAuthorityService;
import com.loccoc.api_gateway.service.ProxyService;
import com.loccoc.api_gateway.service.RateLimitService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class GatewayController {
  private final ProxyService proxy;
  private final RateLimitService limiter;
  private final AccountAuthorityService authority;

  public GatewayController(
      ProxyService proxy, RateLimitService limiter, AccountAuthorityService authority) {
    this.proxy = proxy;
    this.limiter = limiter;
    this.authority = authority;
  }

  @RequestMapping({
      "/chat",
      "/chat/**",
      "/posts",
      "/posts/**",
      "/auth",
      "/auth/**",
      "/users",
      "/users/**",
      "/notifications",
      "/notifications/**",
      "/moments",
      "/moments/**",
      "/ai",
      "/ai/**",
      "/admin",
      "/admin/**",
      "/payments",
      "/payments/**",
      "/subscriptions",
      "/subscriptions/**"
  })
  public ResponseEntity<?> forward(HttpServletRequest request, HttpServletResponse response) {
    limiter.checkGlobal(request, response);
    authority.verify(request);
    limiter.checkRoute(request, response);
    return proxy.forward(request, response);
  }
}
