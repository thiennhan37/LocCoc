package com.loccoc.post_service.service;
import com.loccoc.post_service.exception.*;
import java.io.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Component;
@Component
public class PhotoDecoder {
  public record Photo(byte[] bytes, int width, int height) {}

  public Photo decode(String base64) {
    try {
      byte[] bytes=Base64.getDecoder().decode(base64);
      if(bytes.length>5*1024*1024) throw new AppException(ErrorCode.REQUEST_TOO_LARGE);
      try(var input=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
        var readers=ImageIO.getImageReaders(input);
        if(!readers.hasNext()) throw invalid();
        var reader=readers.next();
        try {
          reader.setInput(input);
          int width=reader.getWidth(0), height=reader.getHeight(0);
          if(!reader.getFormatName().equalsIgnoreCase("png") || width<1 || height<1 || width>2048 || height>2048) throw invalid();
          var image=reader.read(0);
          var output=new ByteArrayOutputStream();
          ImageIO.write(image,"png",output); // Strip metadata and reject arbitrary payloads.
          byte[] sanitized=output.toByteArray();
          if(sanitized.length>5*1024*1024) throw new AppException(ErrorCode.REQUEST_TOO_LARGE);
          return new Photo(sanitized,width,height);
        } finally { reader.dispose(); }
      }
    } catch(IOException | IllegalArgumentException e) { throw invalid(); }
  }
  private AppException invalid() { return new AppException(ErrorCode.INVALID_PARAMETER); }
}
