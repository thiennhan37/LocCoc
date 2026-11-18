package com.loccoc.post_service.service;
import com.loccoc.post_service.dto.MomentSearch;
import com.loccoc.post_service.entity.Post;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
@Component
public class MomentAiClient {
  private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(MomentAiClient.class);
  public static class Unavailable extends IllegalStateException {
    private final String reason;
    public Unavailable(String reason) { super(reason);this.reason=reason; }
    public String reason() { return reason; }
  }
  public record Hit(UUID assetId,int assetVersion) {}
  private static final Set<String> SAFE_REASONS=Set.of("SEMANTIC_DISABLED","SEMANTIC_UNAVAILABLE","SEMANTIC_CONFIGURATION_ERROR","QUERY_TRANSLATION_UNAVAILABLE","QUERY_TRANSLATION_CONFIGURATION_ERROR","PROVIDER_QUOTA_EXHAUSTED","PROVIDER_RATE_LIMITED","PROVIDER_TIMEOUT","PROVIDER_UNAVAILABLE","PROVIDER_CONFIGURATION_ERROR","QUOTA_UNAVAILABLE","OWNER_RATE_LIMITED","INDEX_UNAVAILABLE","INDEX_SCHEMA_MISMATCH");
  private final Environment env;
  private final JsonMapper json=JsonMapper.builder().build();
  private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
  public MomentAiClient(Environment env) {
    this.env=env;
    if(!Set.of(768,1536,3072).contains(env.getProperty("post.embedding-dim",Integer.class,768))) throw new IllegalArgumentException("Unsupported embedding dimension");
    LOG.info("Semantic search enabled={} profile={} credentialsConfigured={}",enabled(),profile(),env.getProperty("post.ai-token","").length()>=32 && env.getProperty("post.ai-actor-secret","").length()>=32);
  }
  public String profile() { return "gemini2-d"+env.getProperty("post.embedding-dim",Integer.class,768)+"-imgv1-queryv1"; }
  public boolean enabled() { return env.getProperty("post.semantic-enabled",Boolean.class,false); }
  public String capability(UUID owner,String operation,String secret) {
    try {
      long now=Instant.now().getEpochSecond();
      String head=encode(json.writeValueAsBytes(Map.of("alg","HS256","typ","JWT")));
      String body=encode(json.writeValueAsBytes(Map.of("sub",owner.toString(),"op",operation,"iat",now,"exp",now+45,"iss","post-service","aud","loccoc-ai","jti",UUID.randomUUID().toString())));
      var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
      return head+"."+body+"."+encode(mac.doFinal((head+"."+body).getBytes(StandardCharsets.US_ASCII)));
    } catch(Exception e) { throw unavailable(); }
  }
  private String encode(byte[] bytes) { return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
  private JsonNode call(UUID owner,String op,String method,String path,byte[] body,Map<String,Object> metadata) {
    if(!enabled()) throw new Unavailable("SEMANTIC_DISABLED");
    String token=env.getProperty("post.ai-token",""),secret=env.getProperty("post.ai-actor-secret","");
    if(token.length()<32 || secret.length()<32 || token.equals(secret)) throw new Unavailable("SEMANTIC_CONFIGURATION_ERROR");
    try {
      URI origin=URI.create(env.getProperty("post.ai-url","http://127.0.0.1:8087"));
      if(!Set.of("http","https").contains(origin.getScheme()) || origin.getHost()==null || origin.getUserInfo()!=null || origin.getQuery()!=null || origin.getFragment()!=null || !(origin.getPath().isEmpty() || origin.getPath().equals("/"))) throw unavailable();
      var builder=HttpRequest.newBuilder(origin.resolve(path)).timeout(Duration.ofSeconds(op.equals("search")?10:12))
        .header("x-service-token",token).header("x-ai-actor",capability(owner,op,secret))
        .header("Content-Type",metadata==null?"application/json":"image/jpeg");
      if(metadata!=null) builder.header("x-ai-metadata",encode(json.writeValueAsBytes(metadata)));
      var response=http.send(builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofByteArray(body)).build(),boundedBody());
      if(response.body().length>128*1024) throw unavailable();
      if(response.statusCode()!=200) {
        String code=json.readTree(response.body()).path("code").asText();
        throw new Unavailable(SAFE_REASONS.contains(code)?code:"SEMANTIC_UNAVAILABLE");
      }
      return json.readTree(response.body());
    } catch(Unavailable e) { throw e; }
    catch(InterruptedException e) { Thread.currentThread().interrupt();throw unavailable(); }
    catch(Exception e) { throw unavailable(); }
  }
  public List<Hit> search(UUID owner,MomentSearch query) {
    var body=new HashMap<String,Object>();body.put("query",query.query().isBlank()?"ảnh":query.query());body.put("limit",200);
    body.put("album_id",query.albumId());body.put("place",query.place());body.put("date_from",query.dateFrom());body.put("date_to",query.dateTo());
    var result=call(owner,"search","POST","/internal/search",json.writeValueAsBytes(body),null);
    if(!profile().equals(result.path("profileId").asText()) || !result.path("items").isArray() || result.path("items").size()>200) throw unavailable();
    var hits=new ArrayList<Hit>();
    for(var item:result.path("items")) {
      try { int version=item.path("assetVersion").asInt();if(version>0) hits.add(new Hit(UUID.fromString(item.path("assetId").asText()),version)); }
      catch(IllegalArgumentException ignored) { }
    }
    return hits;
  }
  public void index(Post post,byte[] jpeg) {
    var metadata=new HashMap<String,Object>();metadata.put("capturedAt",post.captured().toString());metadata.put("albumId",post.getAlbumId());metadata.put("place",post.getPlace());
    String asset=post.asset().toString();
    var result=call(post.getOwnerId(),"index:"+asset+":"+post.getAssetVersion(),"PUT","/internal/assets/"+asset+"/"+post.getAssetVersion(),jpeg,metadata);
    if(!profile().equals(result.path("profileId").asText()) || !"ready".equals(result.path("status").asText())) throw unavailable();
  }
  public void delete(Post post) {
    var result=call(post.getOwnerId(),"delete:"+post.asset(),"DELETE","/internal/assets/"+post.asset(),null,null);
    if(!"deleted".equals(result.path("status").asText())) throw unavailable();
  }
  private HttpResponse.BodyHandler<byte[]> boundedBody() {
    return info -> new HttpResponse.BodySubscriber<byte[]>() {
      private final HttpResponse.BodySubscriber<byte[]> body=HttpResponse.BodySubscribers.ofByteArray();
      private java.util.concurrent.Flow.Subscription subscription;
      private long size;
      private boolean ended;
      public java.util.concurrent.CompletionStage<byte[]> getBody() { return body.getBody(); }
      public void onSubscribe(java.util.concurrent.Flow.Subscription value) { subscription=value;body.onSubscribe(value); }
      public void onNext(List<java.nio.ByteBuffer> chunks) {
        if(ended) return;
        for(var chunk:chunks) size+=chunk.remaining();
        if(size>128*1024) { ended=true;subscription.cancel();body.onError(new java.io.IOException("AI response too large"));return; }
        body.onNext(chunks);
      }
      public void onError(Throwable error) { if(!ended) { ended=true;body.onError(error); } }
      public void onComplete() { if(!ended) { ended=true;body.onComplete(); } }
    };
  }
  private IllegalStateException unavailable() { return new IllegalStateException("SEMANTIC_UNAVAILABLE"); }
}
