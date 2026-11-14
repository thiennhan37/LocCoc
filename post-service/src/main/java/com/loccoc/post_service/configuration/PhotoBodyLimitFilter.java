package com.loccoc.post_service.configuration;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class PhotoBodyLimitFilter extends OncePerRequestFilter {
  private static final int LIMIT=8*1024*1024;
  @Override protected boolean shouldNotFilter(HttpServletRequest request) {
    return !request.getRequestURI().equals("/posts/photos") || !request.getMethod().equals("POST");
  }
  @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)
      throws IOException,ServletException {
    byte[] body=request.getContentLengthLong()>LIMIT ? null : request.getInputStream().readNBytes(LIMIT+1);
    if(body==null || body.length>LIMIT) {
      response.setStatus(413); response.setContentType("application/json");
      response.getWriter().write("{\"code\":1102,\"message\":\"Request body too large\",\"result\":null}");
      return;
    }
    chain.doFilter(new HttpServletRequestWrapper(request) {
      @Override public ServletInputStream getInputStream() {
        var stream=new ByteArrayInputStream(body);
        return new ServletInputStream() {
          public int read() { return stream.read(); }
          public int read(byte[] b,int off,int len) { return stream.read(b,off,len); }
          public boolean isFinished() { return stream.available()==0; }
          public boolean isReady() { return true; }
          public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException(); }
        };
      }
      @Override public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(),java.nio.charset.StandardCharsets.UTF_8)); }
    },response);
  }
}
