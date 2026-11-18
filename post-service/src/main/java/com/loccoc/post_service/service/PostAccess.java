package com.loccoc.post_service.service;
import com.loccoc.post_service.entity.Post;
import com.loccoc.post_service.exception.*;
public final class PostAccess {
  private PostAccess() {}
  public static boolean readable(Post post, FeedAudienceClient.Audience audience) {
    return post.getDeletedAt()==null && "active".equals(post.getState()) &&
        (post.getOwnerId().equals(audience.viewerId()) ||
         ("FRIENDS".equals(post.getVisibility()) && audience.authors().containsKey(post.getOwnerId())));
  }
  public static void require(Post post, FeedAudienceClient.Audience audience) {
    if(!readable(post,audience)) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
  }
}
