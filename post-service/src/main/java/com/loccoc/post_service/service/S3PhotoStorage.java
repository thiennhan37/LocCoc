package com.loccoc.post_service.service;
import com.loccoc.post_service.exception.*;
import java.io.IOException;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.exception.SdkException;
public class S3PhotoStorage implements PhotoStorage {
  private final S3Client client;
  private final String bucket;
  private final LegacyPhotoReader legacy;
  public S3PhotoStorage(S3Client client,String bucket,LegacyPhotoReader legacy) {
    if(bucket==null || bucket.isBlank()) throw new IllegalArgumentException("Post S3 bucket is required");
    this.client=client; this.bucket=bucket; this.legacy=legacy;
  }
  private String key(UUID id) { return "posts/"+id+".png"; }
  public boolean save(UUID id,byte[] bytes,UUID ownerId,String caption) {
    if(bytes.length>MAX_BYTES) throw new AppException(ErrorCode.REQUEST_TOO_LARGE);
    var metadata=Map.of("owner-id",ownerId.toString(),"photo-sha256",digest(bytes),
        "caption-sha256",digest((caption==null?"null":"text:"+caption).getBytes(StandardCharsets.UTF_8)));
    try {
      client.putObject(PutObjectRequest.builder().bucket(bucket).key(key(id)).contentType("image/png")
          .metadata(metadata).cacheControl("private, no-store").ifNoneMatch("*").build(),RequestBody.fromBytes(bytes));
      return true;
    } catch(S3Exception e) {
      if(e.statusCode()==412) return reconcile(id,bytes,metadata);
      if(e.statusCode()==409) throw new AppException(ErrorCode.CONFLICT);
      throw unavailable();
    } catch(SdkException e) { throw unavailable(); }
  }
  private boolean reconcile(UUID id,byte[] bytes,Map<String,String> expected) {
    try {
      var stored=client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key(id)).build());
      if(stored==null || !stored.metadata().entrySet().containsAll(expected.entrySet()) || !Arrays.equals(readRemote(id),bytes))
        throw new AppException(ErrorCode.CONFLICT);
      // A prior successful PUT lost its acknowledgment; never delete this object on rollback.
      return false;
    } catch(SdkException | IOException e) { throw unavailable(); }
  }
  private String digest(byte[] bytes) {
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    catch(NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
  }
  private byte[] readRemote(UUID id) throws IOException {
    try(var input=client.getObject(GetObjectRequest.builder().bucket(bucket).key(key(id)).build())) {
      byte[] bytes=input.readNBytes(MAX_BYTES+1);
      if(bytes.length>MAX_BYTES) { input.abort(); throw unavailable(); }
      return bytes;
    }
  }
  public byte[] read(UUID id) {
    try { return readRemote(id); }
    catch(NoSuchKeyException e) { return legacy.read(id); }
    catch(S3Exception e) {
      if(e.statusCode()==404 && e.awsErrorDetails()!=null && "NoSuchKey".equals(e.awsErrorDetails().errorCode())) return legacy.read(id);
      throw unavailable();
    } catch(SdkException | IOException e) { throw unavailable(); }
  }
  public void discard(UUID id) {
    try { client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key(id)).build()); }
    catch(SdkException e) { throw unavailable(); }
  }
  private AppException unavailable() { return new AppException(ErrorCode.SERVICE_UNAVAILABLE); }
}
