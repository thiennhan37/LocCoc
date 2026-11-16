package com.loccoc.post_service.service;
import com.loccoc.post_service.exception.*;
import java.io.*;
import java.nio.file.*;
import java.util.UUID;
/** Transitional read-only access. Never writes or deletes legacy files. */
public class LegacyPhotoReader {
  private final Path root;
  private final boolean enabled;
  public LegacyPhotoReader(String directory, boolean enabled) {
    this.enabled=enabled;
    this.root=directory.isBlank()?null:Path.of(directory).toAbsolutePath().normalize();
    if(enabled && root==null) throw new IllegalArgumentException("Legacy directory is required when fallback is enabled");
  }
  public byte[] read(UUID id) {
    if(!enabled) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
    try {
      Path file=root.resolve(id+".png");
      if(!Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS)) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
      // Resolve the configured root, but never follow the individual photo as a symlink.
      try(var input=Files.newInputStream(file,LinkOption.NOFOLLOW_LINKS)) {
        byte[] bytes=input.readNBytes(PhotoStorage.MAX_BYTES+1);
        if(bytes.length>PhotoStorage.MAX_BYTES) throw new AppException(ErrorCode.SERVICE_UNAVAILABLE);
        return bytes;
      }
    } catch(NoSuchFileException e) { throw new AppException(ErrorCode.ROUTE_NOT_FOUND); }
    catch(IOException e) { throw new AppException(ErrorCode.SERVICE_UNAVAILABLE); }
  }
}
