package com.loccoc.post_service.service;
import java.util.UUID;
public interface PhotoStorage {
  int MAX_BYTES=5*1024*1024;
  /** Returns true only when this call created the object; false means a verified retry. */
  boolean save(UUID id, byte[] bytes, UUID ownerId, String caption);
  byte[] read(UUID id);
  void discard(UUID id);
}
