package com.loccoc.post_service;
import com.loccoc.post_service.dto.MomentSearch;
import com.loccoc.post_service.service.*;
import com.loccoc.post_service.exception.AppException;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;
class MomentQueryTests {
  private static final Instant NOW=Instant.parse("2026-11-17T08:00:00Z");
  @ParameterizedTest @CsvSource({
    "hôm nay,2026-11-16T17:00:00Z,2026-11-17T16:59:59.999Z",
    "hôm qua,2026-11-15T17:00:00Z,2026-11-16T16:59:59.999Z",
    "tuần trước,2026-11-08T17:00:00Z,2026-11-15T16:59:59.999Z",
    "tuần này,2026-11-15T17:00:00Z,2026-11-22T16:59:59.999Z",
    "tháng trước,2026-09-30T17:00:00Z,2026-10-31T16:59:59.999Z",
    "tháng này,2026-10-31T17:00:00Z,2026-11-30T16:59:59.999Z",
    "tháng 10/2026,2026-09-30T17:00:00Z,2026-10-31T16:59:59.999Z",
    "tháng 10 năm 2026,2026-09-30T17:00:00Z,2026-10-31T16:59:59.999Z",
    "ngày 15/10/2026,2026-10-14T17:00:00Z,2026-10-15T16:59:59.999Z",
    "từ ngày 01/10/2026 đến ngày 31/10/2026,2026-09-30T17:00:00Z,2026-10-31T16:59:59.999Z",
    "năm ngoái,2024-12-31T17:00:00Z,2025-12-31T16:59:59.999Z",
    "năm 2025,2024-12-31T17:00:00Z,2025-12-31T16:59:59.999Z"
  })
  void extractsCalendarRangeAndPreservesSemanticQuery(String phrase,String from,String to) {
    var result=MomentQuery.resolve(new MomentSearch("xe đạp "+phrase,20,null,null,null,null,true),NOW);
    assertThat(result.query()).isEqualTo("xe đạp");assertThat(result.dateFrom()).isEqualTo(Instant.parse(from));assertThat(result.dateTo()).isEqualTo(Instant.parse(to));
  }
  @ParameterizedTest @CsvSource({"ngày 31/02/2026","tháng 13/2026","từ 20/10/2026 đến 01/10/2026","hôm nay tháng trước"})
  void invalidOrAmbiguousDatesAreRejected(String query) {
    assertThatThrownBy(()->MomentQuery.resolve(new MomentSearch(query,20,null,null,null,null,false),NOW)).isInstanceOf(AppException.class);
  }
  @Test void explicitFiltersRetainPrecedence() {
    var from=Instant.parse("2026-09-30T17:00:00Z");var to=Instant.parse("2026-10-31T16:59:59.999Z");
    var input=new MomentSearch("xe hôm nay",20,null,null,from,to,false);
    assertThat(MomentQuery.resolve(input,NOW)).isEqualTo(input);
  }
  @Test void selectedDimensionDeterminesProtocolProfile() {
    for(int dim:new int[]{768,1536,3072}) assertThat(new MomentAiClient(new MockEnvironment().withProperty("post.embedding-dim",""+dim)).profile()).isEqualTo("gemini2-d"+dim+"-imgv1-queryv1");
    assertThatThrownBy(()->new MomentAiClient(new MockEnvironment().withProperty("post.embedding-dim","1024"))).isInstanceOf(IllegalArgumentException.class);
  }
}
