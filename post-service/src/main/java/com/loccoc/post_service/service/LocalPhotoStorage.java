package com.loccoc.post_service.service;

import com.loccoc.post_service.exception.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class LocalPhotoStorage {
  private final Path root;
  public LocalPhotoStorage(@Value("${post.media-dir}") String directory) {
    root=Path.of(directory).toAbsolutePath().normalize();
  }
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
  public Path path(UUID id) { return root.resolve(id+".png"); }
  public void save(UUID id, Photo photo) {
    try {
      Files.createDirectories(root);
      // CREATE_NEW prevents overwriting files from another request or a prior crash.
      try(var output=Files.newOutputStream(path(id), StandardOpenOption.CREATE_NEW)) {
        try { output.write(photo.bytes()); }
        catch(IOException e) { Files.deleteIfExists(path(id)); throw e; }
      }
    } catch(FileAlreadyExistsException e) { throw new AppException(ErrorCode.CONFLICT); }
    catch(IOException e) { throw new AppException(ErrorCode.SERVICE_UNAVAILABLE); }
  }
  public byte[] read(UUID id) {
    try { return Files.readAllBytes(path(id)); }
    catch(NoSuchFileException e) { throw new AppException(ErrorCode.ROUTE_NOT_FOUND); }
    catch(IOException e) { throw new AppException(ErrorCode.SERVICE_UNAVAILABLE); }
  }
  public void discard(UUID id) {
    try { Files.deleteIfExists(path(id)); }
    catch(IOException e) { throw new AppException(ErrorCode.SERVICE_UNAVAILABLE); }
  }
  private AppException invalid() { return new AppException(ErrorCode.INVALID_PARAMETER); }
}
