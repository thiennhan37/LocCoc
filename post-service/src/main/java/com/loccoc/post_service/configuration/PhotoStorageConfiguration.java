package com.loccoc.post_service.configuration;
import com.loccoc.post_service.service.*;
import java.net.URI;
import java.time.Duration;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
@Configuration
public class PhotoStorageConfiguration {
  @Bean(destroyMethod="close") S3Client postS3Client(Environment env) {
    var builder=S3Client.builder().region(Region.of(env.getProperty("post.s3.region","us-east-1")))
      .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(env.getProperty("post.s3.path-style",Boolean.class,true)).chunkedEncodingEnabled(false).build())
      .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED).responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
      .httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(3)).socketTimeout(Duration.ofSeconds(10)))
      .overrideConfiguration(c->c.apiCallTimeout(Duration.ofSeconds(15)).apiCallAttemptTimeout(Duration.ofSeconds(10)).retryPolicy(r->r.numRetries(0)));
    String endpoint=env.getProperty("post.s3.endpoint","");
    if(!endpoint.isBlank()) {
      URI uri=URI.create(endpoint);
      if(!java.util.Set.of("http","https").contains(uri.getScheme()) || uri.getHost()==null || uri.getUserInfo()!=null || uri.getQuery()!=null || uri.getFragment()!=null) throw new IllegalArgumentException("Invalid post S3 endpoint");
      builder.endpointOverride(uri);
    }
    String access=env.getProperty("post.s3.access-key","");
    String secret=env.getProperty("post.s3.secret-key","");
    if(access.isBlank()!=secret.isBlank()) throw new IllegalArgumentException("Both post S3 credentials must be configured together");
    if(!access.isBlank()) builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(access,secret)));
    else builder.credentialsProvider(DefaultCredentialsProvider.builder().build());
    return builder.build();
  }
  @Bean PhotoStorage photoStorage(S3Client postS3Client,Environment env) {
    return new S3PhotoStorage(postS3Client,env.getProperty("post.s3.bucket","loccoc-posts"),
      new LegacyPhotoReader(env.getProperty("post.media-dir",""),env.getProperty("post.legacy-read-enabled",Boolean.class,false)));
  }
}
