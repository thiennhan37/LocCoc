package com.loccoc.post_service;

import com.loccoc.post_service.service.MomentTextMatcher;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class MomentTextMatcherTests {
  @Test void accentsCaseAndVietnameseDMatchTheOriginalText() {
    assertThat(MomentTextMatcher.score("CA PHE","Đi cà phê cùng bạn")).isEqualTo(2);
    assertThat(MomentTextMatcher.score("duong pho","ĐƯỜNG PHỐ")).isEqualTo(3);
    assertThat(MomentTextMatcher.score("người","Người bạn")).isEqualTo(2);
  }
  @Test void smallTyposAndTranspositionsMatchButExactPhrasesRankHigher() {
    double typo=MomentTextMatcher.score("ca phee","Đi cà phê");
    assertThat(typo).isPositive().isLessThan(MomentTextMatcher.score("cà phê","Đi cà phê"));
    assertThat(MomentTextMatcher.score("cofefe","coffee with friends")).isPositive();
    assertThat(MomentTextMatcher.score("ngươi","người đang đạp xe")).isPositive();
  }
  @Test void shortTokensAndUnrelatedOrMissingWordsDoNotFuzzilyMatch() {
    assertThat(MomentTextMatcher.score("xe","mẹ và bé")).isZero();
    assertThat(MomentTextMatcher.score("chó","choàng khăn")).isZero();
    assertThat(MomentTextMatcher.score("người xe","người đang ăn tối")).isZero();
    assertThat(MomentTextMatcher.score("mèo mèo","mèo đang ngủ")).isZero();
    assertThat(MomentTextMatcher.score("%_!","anything")).isZero();
    assertThat(MomentTextMatcher.score("a".repeat(500),"short")).isZero();
  }
}
