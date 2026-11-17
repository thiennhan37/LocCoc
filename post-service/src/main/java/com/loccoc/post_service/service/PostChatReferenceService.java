package com.loccoc.post_service.service;

import com.loccoc.post_service.dto.ChatPostReference;
import com.loccoc.post_service.exception.AppException;
import com.loccoc.post_service.exception.ErrorCode;
import com.loccoc.post_service.repository.PostRepository;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class PostChatReferenceService {
  private static final Pattern MEDIA = Pattern.compile("^/posts/media/[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$");
  private final PostRepository posts;
  private final FeedAudienceClient audienceClient;

  public PostChatReferenceService(PostRepository posts, FeedAudienceClient audienceClient) {
    this.posts = posts;
    this.audienceClient = audienceClient;
  }

  public ChatPostReference get(String authorization, UUID id) {
    var audience = audienceClient.resolve(authorization);
    var post = posts.findById(id).orElseThrow(() -> new AppException(ErrorCode.ROUTE_NOT_FOUND));
    if (post.getDeletedAt() != null || !audience.authors().containsKey(post.getOwnerId())
        || !MEDIA.matcher(post.getMediaKey()).matches()) {
      throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
    }
    if (post.getOwnerId().equals(audience.viewerId())) throw new AppException(ErrorCode.ACCESS_DENIED);
    return new ChatPostReference(post.getId(), post.getOwnerId(), post.getMediaKey());
  }
}
