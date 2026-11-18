package com.loccoc.post_service;
import com.loccoc.post_service.dto.*;
import com.loccoc.post_service.entity.Post;
import com.loccoc.post_service.service.*;
import java.util.*;
import org.springframework.mock.env.MockEnvironment;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.assertj.core.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="POST_AI_TEST_URL",matches=".+")
class AiProtocolIntegrationTests {
 @Test void javaCapabilityIndexesSearchesAndDeletesThroughPythonWithOwnerIsolation() throws Exception {
   var env=new MockEnvironment().withProperty("post.semantic-enabled","true")
     .withProperty("post.ai-url",System.getenv("POST_AI_TEST_URL"))
     .withProperty("post.ai-token",System.getenv("AI_SERVICE_TOKEN"))
     .withProperty("post.ai-actor-secret",System.getenv("AI_ACTOR_SECRET"));
   var ai=new MomentAiClient(env);UUID owner=UUID.randomUUID(),id=UUID.randomUUID();
   var post=Post.create(id,new CreatePostRequest(owner,PhotoPostService.mediaKey(id),0,null,"fixture",8,8));
   ai.index(post,new MomentImages().jpeg(PhotoPostApiTests.png(8)));
   var query=new MomentSearch("xanh",20,null,null,null,null,false);
   assertThat(ai.search(owner,query)).extracting(MomentAiClient.Hit::assetId).contains(id);
   assertThat(ai.search(UUID.randomUUID(),query)).isEmpty();
   ai.delete(post);assertThat(ai.search(owner,query)).isEmpty();
 }
}
