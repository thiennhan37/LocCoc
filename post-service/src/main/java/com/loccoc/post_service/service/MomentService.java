package com.loccoc.post_service.service;
import com.loccoc.post_service.dto.*;
import com.loccoc.post_service.entity.Post;
import com.loccoc.post_service.exception.*;
import com.loccoc.post_service.repository.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
@Service
public class MomentService {
  private final PostRepository posts;
  private final MomentRepository gallery;
  private final MomentTextSearch textSearch;
  private final PhotoStorage storage;
  private final MomentImages images;
  private final UserIdentityClient identity;
  private final MomentAiClient ai;
  private final MediaJobs jobs;
  private final PostAccounts accounts;
  private final TransactionTemplate tx;
  private final JsonMapper json=JsonMapper.builder().build();
  public MomentService(PostRepository posts,MomentRepository gallery,MomentTextSearch textSearch,PhotoStorage storage,MomentImages images,UserIdentityClient identity,MomentAiClient ai,MediaJobs jobs,PostAccounts accounts,PlatformTransactionManager manager) {
    this.textSearch=textSearch;
    this.posts=posts;this.gallery=gallery;this.storage=storage;this.images=images;this.identity=identity;this.ai=ai;this.jobs=jobs;this.accounts=accounts;tx=new TransactionTemplate(manager);
  }
  public Map<String,Object> view(Post p) {
    var row=new LinkedHashMap<String,Object>();row.put("id",p.getId());row.put("caption",p.getCaption());
    row.put("tags",json.readTree(p.getTagsJson()==null?"[]":p.getTagsJson()));row.put("capturedAt",p.captured());row.put("albumId",p.getAlbumId());row.put("place",p.getPlace());
    row.put("state",p.getState());row.put("visibility",p.getVisibility());row.put("indexStatus",p.getIndexStatus());row.put("imagePath","active".equals(p.getState())?"/moments/"+p.getId()+"/image":null);return row;
  }
  private Post owned(UUID owner,UUID id,boolean active) {
    var p=posts.findById(id).orElseThrow(()->new AppException(ErrorCode.ROUTE_NOT_FOUND));
    if(!p.getOwnerId().equals(owner) || p.getDeletedAt()!=null || (active && !"active".equals(p.getState()))) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);return p;
  }
  public Map<String,Object> create(String token,MomentRequest input) {
    UUID owner=identity.resolve(token),id=UUID.randomUUID();accounts.ensure(owner);
    return tx.execute(status->{
      accounts.reserve(owner);
      var p=Post.create(id,new CreatePostRequest(owner,PhotoPostService.mediaKey(id),0,null,input.caption()==null?"":input.caption().trim(),null,null));
      p.draft("PRIVATE",input.capturedAt()==null?Instant.now():input.capturedAt(),input.albumId(),input.place()==null?null:input.place().trim(),json.writeValueAsString(input.tags()==null?List.of():input.tags()));
      return view(posts.saveAndFlush(p));
    });
  }
  public Map<String,Object> get(String token,UUID id) { return view(owned(identity.resolve(token),id,false)); }
  public Map<String,Object> upload(String token,UUID id,byte[] raw,String mime) {
    UUID owner=identity.resolve(token);owned(owner,id,false);accounts.ensure(owner);
    var photo=images.normalize(raw,mime);String hash=PhotoPostService.digest(photo.bytes());
    // Commit immutable upload intent independently of storage/activation.
    tx.executeWithoutResult(status->{
      accounts.lock(owner);
      var p=posts.lockById(id).orElseThrow(()->new AppException(ErrorCode.ROUTE_NOT_FOUND));
      if(!p.getOwnerId().equals(owner) || p.getDeletedAt()!=null) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
      if(!"PRIVATE".equals(p.getVisibility()) || (p.getUploadHash()!=null && !p.getUploadHash().equals(hash))) throw new AppException(ErrorCode.CONFLICT);
      p.reserve(hash);
    });
    return tx.execute(status->{
      accounts.lock(owner);
      var p=posts.lockById(id).orElseThrow(()->new AppException(ErrorCode.ROUTE_NOT_FOUND));
      if(p.getDeletedAt()!=null) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
      if("active".equals(p.getState())) return view(p);
      storage.save(id,photo.bytes(),owner,p.getCaption());p.activate(photo.width(),photo.height());jobs.enqueue(p,"index");posts.flush();return view(p);
    });
  }
  public byte[] image(String token,UUID id) {
    UUID owner=identity.resolve(token);owned(owner,id,true);var result=storage.read(id);owned(identity.resolve(token),id,true);return result;
  }
  public Map<String,Object> list(String token,int limit,String cursor) {
    UUID owner=identity.resolve(token);if(limit<1 || limit>50) throw new AppException(ErrorCode.INVALID_PARAMETER);
    Instant before=null;UUID id=null;
    if(cursor!=null) { try {
      if(cursor.length()>256) throw new IllegalArgumentException();
      String[] parts=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split("\\|",-1);
      if(parts.length!=2) throw new IllegalArgumentException();before=Instant.parse(parts[0]);id=UUID.fromString(parts[1]);
    } catch(RuntimeException e) { throw new AppException(ErrorCode.INVALID_PARAMETER); } }
    var rows=gallery.list(owner,before,id,limit+1);String next=null;
    if(rows.size()>limit) { var last=rows.get(limit-1);next=Base64.getUrlEncoder().withoutPadding().encodeToString((last.captured()+"|"+last.getId()).getBytes(StandardCharsets.UTF_8)); }
    var result=new LinkedHashMap<String,Object>();result.put("items",rows.stream().limit(limit).map(this::view).toList());result.put("nextCursor",next);return result;
  }
  public void remove(String token,UUID id) {
    UUID owner=identity.resolve(token);accounts.ensure(owner);tx.executeWithoutResult(status->{
      accounts.lock(owner);
      var p=posts.lockById(id).orElseThrow(()->new AppException(ErrorCode.ROUTE_NOT_FOUND));
      if(!p.getOwnerId().equals(owner)) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
      if(p.getDeletedAt()==null) { p.tombstone();jobs.erase(p); }
    });
  }
  public void retry(String token,UUID id) {
    UUID owner=identity.resolve(token);accounts.ensure(owner);tx.executeWithoutResult(status->{
      accounts.lock(owner);
      var p=posts.lockById(id).orElseThrow(()->new AppException(ErrorCode.ROUTE_NOT_FOUND));
      if(!p.getOwnerId().equals(owner) || p.getDeletedAt()!=null || !"active".equals(p.getState())) throw new AppException(ErrorCode.ROUTE_NOT_FOUND);
      p.indexStatus("pending");jobs.enqueue(p,"index");
    });
  }
  public Map<String,Object> search(String token,MomentSearch input) {
    UUID owner=identity.resolve(token);var query=MomentQuery.resolve(input,Instant.now());
    List<MomentAiClient.Hit> semantic=List.of();boolean available=false;String unavailableReason="SEMANTIC_UNAVAILABLE";
    try { semantic=ai.search(owner,query);available=true; } catch(RuntimeException e) {
      if(e instanceof MomentAiClient.Unavailable failure) unavailableReason=failure.reason();
      if(Boolean.TRUE.equals(input.requireSemantic())) throw new AppException(ErrorCode.SERVICE_UNAVAILABLE);
    }
    var metadata=textSearch.find(owner,query);
    var scores=new HashMap<UUID,Double>();var versions=new HashMap<UUID,Integer>();var meta=new HashSet<UUID>();
    for(int i=0;i<metadata.size();i++) { UUID asset=metadata.get(i).asset();meta.add(asset);scores.merge(asset,1.0/(61+i),Double::sum); }
    for(int i=0;i<semantic.size();i++) { var hit=semantic.get(i);if(versions.putIfAbsent(hit.assetId(),hit.assetVersion())==null) scores.merge(hit.assetId(),1.0/(61+i),Double::sum); }
    // Rehydrate after AI call: vectors can never grant access or revive a deletion.
    var fresh=gallery.search(identity.resolve(token),query,scores.keySet());
    var byAsset=new HashMap<UUID,Post>();for(var p:fresh) byAsset.put(p.asset(),p);
    var items=scores.keySet().stream().sorted(Comparator.<UUID>comparingDouble(scores::get).reversed().thenComparing(UUID::toString)).map(byAsset::get)
      .filter(Objects::nonNull).filter(p->meta.contains(p.asset()) || ("ready".equals(p.getIndexStatus()) && Objects.equals(versions.get(p.asset()),p.getAssetVersion())))
      .limit(query.size()).map(this::view).toList();
    var result=new LinkedHashMap<String,Object>();result.put("items",items);result.put("mode",available?"hybrid":"metadata_only");result.put("semanticStatus",available?"available":"unavailable");
    if(!available) result.put("reason",unavailableReason);
    var filters=new LinkedHashMap<String,Object>();filters.put("albumId",query.albumId());filters.put("place",query.place());filters.put("dateFrom",query.dateFrom());filters.put("dateTo",query.dateTo());
    result.put("appliedFilters",filters);result.put("nextCursor",null);result.put("requestId",UUID.randomUUID());return result;
  }
}
