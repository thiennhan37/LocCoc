package com.loccoc.post_service.service;

import com.loccoc.post_service.dto.MomentSearch;
import com.loccoc.post_service.entity.Post;
import com.loccoc.post_service.repository.MomentRepository;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class MomentTextSearch {
  private final MomentRepository gallery;
  public MomentTextSearch(MomentRepository gallery) { this.gallery=gallery; }
  private record Match(Post post,double score) {}
  public List<Post> find(UUID owner,MomentSearch query) {
    var order=Comparator.comparingDouble(Match::score).reversed()
      .thenComparing(m->m.post().captured(),Comparator.reverseOrder())
      .thenComparing(m->m.post().getId(),Comparator.reverseOrder());
    var best=new PriorityQueue<Match>(order.reversed());
    for(int offset=0;;offset+=200) {
      var page=gallery.textPage(owner,query,offset);
      for(var post:page) {
        double score=Math.max(MomentTextMatcher.score(query.query(),post.getCaption()),
          Math.max(MomentTextMatcher.score(query.query(),post.getTagsJson()),MomentTextMatcher.score(query.query(),post.getPlace())));
        if(score>0) {
          best.add(new Match(post,score));if(best.size()>200) best.poll();
        }
      }
      if(page.size()<200) break;
    }
    return best.stream().sorted(order).map(Match::post).toList();
  }
}
