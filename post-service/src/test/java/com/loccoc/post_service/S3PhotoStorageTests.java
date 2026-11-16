package com.loccoc.post_service;
import com.loccoc.post_service.service.*;
import com.loccoc.post_service.exception.*;
import java.nio.file.*;
import java.io.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.http.AbortableInputStream;
import static org.mockito.Mockito.*;
import org.mockito.ArgumentCaptor;
import software.amazon.awssdk.core.exception.SdkClientException;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;
class S3PhotoStorageTests {
 @TempDir Path directory;
 S3Client client=mock(S3Client.class);
 UUID id=UUID.randomUUID();
 S3PhotoStorage storage() { return new S3PhotoStorage(client,"private-posts",new LegacyPhotoReader(directory.toString(),true)); }
 @Test void createIsConditionalAndPrivate() {
   when(client.putObject(any(PutObjectRequest.class),any(RequestBody.class))).thenReturn(PutObjectResponse.builder().build());
   storage().save(id,new byte[]{1,2},UUID.randomUUID(),"caption");
   verify(client).putObject(argThat((PutObjectRequest r)->r.bucket().equals("private-posts") && r.key().equals("posts/"+id+".png") && "*".equals(r.ifNoneMatch()) && r.acl()==null && "image/png".equals(r.contentType())),any(RequestBody.class));
 }
 @Test void collisionNeverDeletesExistingObject() {
   when(client.putObject(any(PutObjectRequest.class),any(RequestBody.class))).thenThrow(S3Exception.builder().statusCode(412).build());
   assertThatThrownBy(()->storage().save(id,new byte[]{1},UUID.randomUUID(),"caption")).isInstanceOfSatisfying(AppException.class,e->assertThat(e.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
   verify(client,never()).deleteObject(any(DeleteObjectRequest.class));
 }
 @Test void missingObjectFallsBackWithoutModifyingLegacyFile() throws Exception {
   byte[] png=PhotoPostApiTests.png(8); Files.write(directory.resolve(id+".png"),png);
   when(client.getObject(any(GetObjectRequest.class))).thenThrow(NoSuchKeyException.builder().statusCode(404).build());
   assertThat(storage().read(id)).isEqualTo(png);
   assertThat(Files.readAllBytes(directory.resolve(id+".png"))).isEqualTo(png);
 }
 @Test void outageAndMissingBucketDoNotFallBack() throws Exception {
   Files.write(directory.resolve(id+".png"),PhotoPostApiTests.png(8));
   for(int status:List.of(403,404,500)) {
     when(client.getObject(any(GetObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(status).build());
     assertThatThrownBy(()->storage().read(id)).isInstanceOfSatisfying(AppException.class,e->assertThat(e.getErrorCode()).isEqualTo(ErrorCode.SERVICE_UNAVAILABLE));
   }
 }
 @Test void disabledFallbackAndMissingLegacyReturnNotFound() {
   when(client.getObject(any(GetObjectRequest.class))).thenThrow(NoSuchKeyException.builder().statusCode(404).build());
   assertThatThrownBy(()->storage().read(id)).isInstanceOfSatisfying(AppException.class,e->assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ROUTE_NOT_FOUND));
   var disabled=new S3PhotoStorage(client,"private-posts",new LegacyPhotoReader(directory.toString(),false));
   assertThatThrownBy(()->disabled.read(id)).isInstanceOfSatisfying(AppException.class,e->assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ROUTE_NOT_FOUND));
 }
 @Test void readLimitsRemoteObjectSize() {
   var response=new ResponseInputStream<>(GetObjectResponse.builder().build(),AbortableInputStream.create(new ByteArrayInputStream(new byte[5*1024*1024+1])));
   when(client.getObject(any(GetObjectRequest.class))).thenReturn(response);
   assertThatThrownBy(()->storage().read(id)).isInstanceOfSatisfying(AppException.class,e->assertThat(e.getErrorCode()).isEqualTo(ErrorCode.SERVICE_UNAVAILABLE));
 }
 @Test void readsS3BeforeLegacy() {
   when(client.getObject(any(GetObjectRequest.class))).thenReturn(new ResponseInputStream<>(GetObjectResponse.builder().build(),AbortableInputStream.create(new ByteArrayInputStream(new byte[]{7,8}))));
   assertThat(storage().read(id)).containsExactly((byte)7,(byte)8);
 }
 @Test void retryReconcilesOnlyAnAcknowledgmentLostForSameAuthenticatedUpload() {
   UUID owner=UUID.randomUUID(); byte[] bytes={1,2};
   when(client.putObject(any(PutObjectRequest.class),any(RequestBody.class)))
     .thenThrow(SdkClientException.create("response lost after storage"))
     .thenThrow(S3Exception.builder().statusCode(412).build());
   assertThatThrownBy(()->storage().save(id,bytes,owner,"caption")).isInstanceOf(AppException.class);
   var capture=ArgumentCaptor.forClass(PutObjectRequest.class);
   verify(client).putObject(capture.capture(),any(RequestBody.class));
   when(client.headObject(any(HeadObjectRequest.class))).thenReturn(HeadObjectResponse.builder().metadata(capture.getValue().metadata()).build());
   when(client.getObject(any(GetObjectRequest.class))).thenAnswer(c->new ResponseInputStream<>(GetObjectResponse.builder().build(),AbortableInputStream.create(new ByteArrayInputStream(bytes))));
   assertThat(storage().save(id,bytes,owner,"caption")).isFalse();
   assertThatThrownBy(()->storage().save(id,bytes,UUID.randomUUID(),"caption")).isInstanceOfSatisfying(AppException.class,e->assertThat(e.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
   assertThatThrownBy(()->storage().save(id,bytes,owner,"different caption")).isInstanceOf(AppException.class);
   verify(client,never()).deleteObject(any(DeleteObjectRequest.class));
 }
}
