package com.loccoc.api_gateway.filter;

import com.loccoc.api_gateway.service.AccountAuthorityService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component("gatewayRequestContextFilter")
public class RequestContextFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String id = request.getHeader("x-request-id");
    if (id == null || !id.matches("[a-zA-Z0-9_-]{1,100}"))
      id = UUID.randomUUID().toString();
    request.setAttribute("requestId", id);
    response.setHeader("x-request-id", id);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    response.setHeader("X-Download-Options", "noopen");
    if (AccountAuthorityService.isAmbiguousPath(request.getRequestURI())) {
      response.setStatus(HttpServletResponse.SC_NOT_FOUND);
      response.setContentType("application/json");
      response
          .getWriter()
          .write("{\"code\":1100,\"message\":\"Requested resource not found\",\"result\":null}");
      return;
    }
    chain.doFilter(request, response);
  }
}
