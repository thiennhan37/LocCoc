package com.loccoc.post_service;
import com.loccoc.post_service.dto.MomentSearch;
import com.loccoc.post_service.service.*;
import java.time.Instant;
import java.io.*;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class MomentConversionTests {
  @Test void vietnameseCalendarUsesUtcPlusSevenAndExplicitFiltersWin() {
    var now=Instant.parse("2026-11-16T04:00:00Z");
    var q=MomentQuery.resolve(new MomentSearch("cà phê hôm qua",null,null,null,null,null,false),now);
    assertThat(q.query()).isEqualTo("cà phê");assertThat(q.dateFrom()).isEqualTo(Instant.parse("2026-11-14T17:00:00Z"));
    var month=MomentQuery.resolve(new MomentSearch("tháng 2 năm 2024",null,null,null,null,null,false),now);
    assertThat(month.dateTo()).isEqualTo(Instant.parse("2024-02-29T16:59:59.999Z"));
    var explicit=new MomentSearch("hôm qua",null,null,null,now,null,false);assertThat(MomentQuery.resolve(explicit,now)).isEqualTo(explicit);
  }
  @Test void jpegUploadsBecomePngAndEmbeddingDerivativeIsJpeg() throws Exception {
    var buffer=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(2200,1100,BufferedImage.TYPE_INT_RGB),"jpeg",buffer);
    var images=new MomentImages();var photo=images.normalize(buffer.toByteArray(),"image/jpeg");
    assertThat(photo.width()).isEqualTo(1536);assertThat(photo.height()).isEqualTo(768);
    assertThat(photo.bytes()[0]).isEqualTo((byte)137);assertThat(images.jpeg(photo.bytes())[0]).isEqualTo((byte)255);
    assertThatThrownBy(()->images.normalize(buffer.toByteArray(),"image/png")).isInstanceOf(RuntimeException.class);
  }  @Test void rotatesExifBeforeStrippingMetadata() throws Exception {
    var original=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(32,16,BufferedImage.TYPE_INT_RGB),"jpeg",original);
    byte[] jpeg=original.toByteArray();var tagged=new ByteArrayOutputStream();tagged.write(jpeg,0,2);
    tagged.write(java.util.HexFormat.of().parseHex("ffe1002245786966000049492a0008000000010012010300010000000600000000000000"));
    tagged.write(jpeg,2,jpeg.length-2);
    var photo=new MomentImages().normalize(tagged.toByteArray(),"image/jpeg");
    assertThat(photo.width()).isEqualTo(16);assertThat(photo.height()).isEqualTo(32);
  }

}
