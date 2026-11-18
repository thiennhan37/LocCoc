package com.loccoc.post_service.service;

import com.loccoc.post_service.dto.FeedItem;
import com.loccoc.post_service.entity.PostView;
import com.loccoc.post_service.repository.*;
import com.loccoc.post_service.exception.*;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Service
public class FeedService {
  public record Page(List<FeedItem> data, String nextCursor) {}
  private final FeedAudienceClient audienceClient;
  private final FeedRepository feed;
  private final PostRepository posts;
  private final PostViewRepository views;
  private final TransactionTemplate transactions;
  private final long priorityHours;
  public FeedService(FeedAudienceClient audienceClient, FeedRepository feed, PostRepository posts, PostViewRepository views,
      PlatformTransactionManager manager, @Value("${post.feed-own-priority-hours:24}") long hours) {
    if(hours<1 || hours>8760) throw new IllegalArgumentException("post.feed-own-priority-hours must be 1..8760");
    this.audienceClient=audienceClient; this.feed=feed; this.posts=posts; this.views=views;
    priorityHours=hours; transactions=new TransactionTemplate(manager);
  }
  public Page page(String token,int limit,String value,UUID ownerId) {
    if(limit<1 || limit>50) throw new AppException(ErrorCode.INVALID_PARAMETER);
    Instant now=Instant.now().truncatedTo(ChronoUnit.MILLIS);
    String cursorValue=value;
    if(ownerId!=null && value!=null) {
      String prefix=ownerId+":";
      if(!value.startsWith(prefix)) throw new AppException(ErrorCode.INVALID_PARAMETER);
      cursorValue=value.substring(prefix.length());
    }
    FeedCursor cursor=cursorValue==null ? null : FeedCursor.decode(cursorValue,now);
    var audience=audienceClient.resolve(token);
    if(ownerId!=null && !audience.authors().containsKey(ownerId)) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
    Instant snapshot=cursor==null ? now : cursor.snapshot();
    var rows=ownerId==null ? feed.page(audience,snapshot,priorityHours,cursor,limit+1)
        : feed.authorPage(audience,ownerId,snapshot,cursor,limit+1);
    var data=List.copyOf(rows.subList(0,Math.min(limit,rows.size())));
    String next=null;
    if(rows.size()>limit) {
      var last=data.getLast(); next=new FeedCursor(snapshot,last.priority(),last.createdAt(),last.id()).encode();
      if(ownerId!=null) next=ownerId+":"+next;
    }
    return new Page(data,next);
  }
  public void seen(String token,UUID id) {
    var audience=audienceClient.resolve(token);
    transactions.executeWithoutResult(status->{
      var post=posts.lockById(id).orElseThrow(()->new AppException(ErrorCode.ROUTE_NOT_FOUND));
      if(post.getDeletedAt()!=null || !audience.authors().containsKey(post.getOwnerId())) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
      if(!views.existsById(PostView.key(audience.viewerId(),id))) views.save(new PostView(audience.viewerId(),id,Instant.now()));
    });
  }
}
