package com.loccoc.post_service.service;

import com.loccoc.post_service.dto.*;
import com.loccoc.post_service.entity.Post;
import com.loccoc.post_service.repository.PostRepository;
import java.time.Instant;
import java.util.UUID;
import com.loccoc.post_service.exception.AppException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.loccoc.post_service.exception.ErrorCode;

@Service
public class    PostService {
  private final PostRepository repository;

  public PostService(PostRepository repository) { this.repository = repository; }

  @Transactional
  public PostResponse create(CreatePostRequest request) {
    return PostResponse.from(repository.save(Post.create(request)));
  }

  @Transactional
  public void delete(UUID id, UUID ownerId) {
    int changed = repository.softDelete(id, ownerId, Instant.now());
    if (changed == 0 && !repository.existsByIdAndOwnerId(id, ownerId)) {
      throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
    }
  }
}

