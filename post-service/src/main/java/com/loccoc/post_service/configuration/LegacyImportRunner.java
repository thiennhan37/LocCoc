package com.loccoc.post_service.configuration;
import com.loccoc.post_service.service.LegacyMomentImport;
import java.net.URI;
import java.sql.DriverManager;
import java.time.Duration;
import org.springframework.boot.*;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;
@Component @Profile("moment-import")
public class LegacyImportRunner implements ApplicationRunner {
  private final LegacyMomentImport importer;
  private final Environment env;
  private final ConfigurableApplicationContext context;
  public LegacyImportRunner(LegacyMomentImport importer,Environment env,ConfigurableApplicationContext context) { this.importer=importer;this.env=env;this.context=context; }
  public void run(ApplicationArguments args) throws Exception {
    String sourceUrl=env.getRequiredProperty("MOMENT_IMPORT_DB_URL");
    if(sourceUrl.equals(env.getProperty("spring.datasource.url"))) throw new IllegalArgumentException("Source and destination databases must differ");
    String bucket=env.getRequiredProperty("MOMENT_IMPORT_S3_BUCKET");
    if(bucket.equals(env.getProperty("post.s3.bucket","loccoc-posts"))) throw new IllegalArgumentException("Source and destination buckets must differ");
    URI endpoint=URI.create(env.getRequiredProperty("MOMENT_IMPORT_S3_ENDPOINT"));
    if(!java.util.Set.of("http","https").contains(endpoint.getScheme()) || endpoint.getHost()==null || endpoint.getUserInfo()!=null || endpoint.getQuery()!=null || endpoint.getFragment()!=null) throw new IllegalArgumentException("Invalid source S3 origin");
    var builder=S3Client.builder().endpointOverride(endpoint).region(Region.of(env.getProperty("MOMENT_IMPORT_S3_REGION","us-east-1")))
      .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
      .overrideConfiguration(c->c.apiCallTimeout(Duration.ofSeconds(15)).retryPolicy(r->r.numRetries(0)));
    builder.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(env.getRequiredProperty("MOMENT_IMPORT_S3_ACCESS_KEY"),env.getRequiredProperty("MOMENT_IMPORT_S3_SECRET_KEY"))));
    try(var s3=builder.build();var source=DriverManager.getConnection(sourceUrl,env.getRequiredProperty("MOMENT_IMPORT_DB_USER"),env.getRequiredProperty("MOMENT_IMPORT_DB_PASSWORD"))) {
      boolean apply=env.getProperty("post.import.apply",Boolean.class,false);
      var result=importer.run(source,key->{
        if(key==null || !key.startsWith("moments/")) throw new IllegalArgumentException("Invalid legacy object key");
        try(var stream=s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build())) {
          byte[] raw=stream.readNBytes(2*1024*1024+1);if(raw.length>2*1024*1024) { stream.abort();throw new IllegalStateException("Legacy image too large"); }return raw;
        } catch(java.io.IOException e) { throw new IllegalStateException("Cannot read legacy object"); }
      },apply);
      System.out.printf("Legacy import apply=%s checked=%d copied=%d identical=%d%n",apply,result.checked(),result.copied(),result.identical());
    } finally { context.close(); }
  }
}
