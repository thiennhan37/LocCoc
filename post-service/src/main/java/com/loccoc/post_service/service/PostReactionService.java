package com.loccoc.post_service.service;

import com.loccoc.post_service.dto.PostReactionSummary;
import com.loccoc.post_service.entity.PostReaction;
import com.loccoc.post_service.exception.*;
import com.loccoc.post_service.repository.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class PostReactionService {
  private static final Set<String> ALLOWED=Set.of("💛","🔥","😍","😂","👏");
  private final FeedAudienceClient audienceClient;
  private final PostRepository posts;
  private final PostReactionRepository reactions;
  private final TransactionTemplate transactions;

  public PostReactionService(FeedAudienceClient audienceClient, PostRepository posts,
      PostReactionRepository reactions, PlatformTransactionManager manager) {
    this.audienceClient=audienceClient; this.posts=posts; this.reactions=reactions;
    transactions=new TransactionTemplate(manager);
  }
  public PostReactionSummary get(String token, UUID postId) { return apply(token,postId,null,false); }
  public PostReactionSummary set(String token, UUID postId, String emoji) {
    // Resolve the authenticated viewer before accepting any state change.
    var audience=audienceClient.resolve(token);
    if(emoji==null || !ALLOWED.contains(emoji)) throw new AppException(ErrorCode.INVALID_PARAMETER);
    return apply(audience,postId,emoji,true);
  }
  public PostReactionSummary remove(String token, UUID postId) { return apply(token,postId,null,true); }
  private PostReactionSummary apply(String token, UUID postId, String emoji, boolean mutate) {
    return apply(audienceClient.resolve(token),postId,emoji,mutate);
  }
  private PostReactionSummary apply(FeedAudienceClient.Audience audience, UUID postId, String emoji, boolean mutate) {
    return transactions.execute(status->{
      // Serialize reads and mutations with deletion and other reaction writers on this post.
      var post=posts.lockById(postId).orElseThrow(()->new AppException(ErrorCode.ROUTE_NOT_FOUND));
      if(post.getDeletedAt()!=null || !audience.authors().containsKey(post.getOwnerId()))
        throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
      boolean ownPost=post.getOwnerId().equals(audience.viewerId());
      if(mutate && ownPost) throw new AppException(ErrorCode.ACCESS_DENIED);
      var existing=reactions.findById(PostReaction.key(audience.viewerId(),postId));
      if(mutate) {
        if(emoji==null) existing.ifPresent(reactions::delete);
        else if(existing.isPresent()) existing.get().setEmoji(emoji);
        else reactions.save(new PostReaction(audience.viewerId(),postId,emoji));
        reactions.flush();
      }
      var counts=new LinkedHashMap<String,Long>();
      for(var count:reactions.counts(postId,post.getOwnerId())) counts.put(count.getEmoji(),count.getTotal());
      return new PostReactionSummary(Map.copyOf(counts),ownPost?null:mutate?emoji:existing.map(PostReaction::getEmoji).orElse(null));
    });
  }
}
