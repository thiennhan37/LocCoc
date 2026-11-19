package com.loccoc.post_service.configuration;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.assertj.core.api.Assertions.assertThat;

class PhotoBodyLimitFilterTests {
  @Test void previewAcceptsImageSizedBodiesAndRejectsOversizedBodies() throws Exception {
    for (int size : new int[]{128 * 1024, 8 * 1024 * 1024 + 1}) {
      var request = new MockHttpServletRequest("POST", "/posts/photos/enhance");
      request.setContent(new byte[size]);
      var response = new MockHttpServletResponse();
      var forwarded = new AtomicBoolean();
      new PhotoBodyLimitFilter().doFilter(request, response, (req, res) -> {
        assertThat(req.getInputStream().readAllBytes()).hasSize(size);
        forwarded.set(true);
      });
      assertThat(forwarded.get()).isEqualTo(size <= 8 * 1024 * 1024);
      assertThat(response.getStatus()).isEqualTo(size <= 8 * 1024 * 1024 ? 200 : 413);
    }
  }
}
