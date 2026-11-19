package com.loccoc.post_service.service;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.*;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
@Component
public class PostAccountEvents {
  private final PostAccounts accounts;
  private final Environment env;
  private KafkaConsumer<String,String> consumer;
  public PostAccountEvents(PostAccounts accounts,Environment env) { this.accounts=accounts;this.env=env; }
  public void apply(String body) {
    if(body==null || body.length()>65536) throw new IllegalArgumentException("Invalid account event");
    var e=JsonMapper.builder().build().readTree(body);var data=e.path("data");
    UUID owner=UUID.fromString(data.path("id").asText());long version=e.path("version").asLong();
    if(!"ACCOUNT_CHANGED".equals(e.path("eventType").asText()) || !owner.toString().equals(e.path("aggregateId").asText()) || !e.path("version").isIntegralNumber() || !data.path("version").isIntegralNumber() || version<1 || version>9007199254740991L || data.path("version").asLong()!=version || !Set.of("active","deleted","suspended","pending_verification").contains(data.path("status").asText())) throw new IllegalArgumentException("Invalid account event");
    if("deleted".equals(data.path("status").asText())) accounts.delete(owner,version);
  }
  @Scheduled(fixedDelay=1000) public synchronized void poll() {
    if(!env.getProperty("post.account-events-enabled",Boolean.class,true)) return;
    try {
      if(consumer==null) {
        var config=new Properties();config.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG,env.getProperty("post.kafka-brokers","127.0.0.1:9092"));
        config.put(ConsumerConfig.GROUP_ID_CONFIG,env.getProperty("post.account-consumer-group","post-service-accounts-v1"));
        config.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG,"false");config.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG,"earliest");
        config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG,StringDeserializer.class);config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG,StringDeserializer.class);
        config.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG,"10");config.put(ConsumerConfig.DEFAULT_API_TIMEOUT_MS_CONFIG,"5000");
        consumer=new KafkaConsumer<>(config);consumer.subscribe(List.of(env.getProperty("post.account-events-topic","account.events")));
      }
      var records=consumer.poll(Duration.ofMillis(100));for(var record:records) apply(record.value());
      if(!records.isEmpty()) consumer.commitSync(Duration.ofSeconds(5));
    } catch(RuntimeException failure) {
      // Rejoin from committed offset on failure; never acknowledge unprocessed erasure.
      close();org.slf4j.LoggerFactory.getLogger(getClass()).warn("Account event processing unavailable; retrying without advancing offsets");
    }
  }
  @PreDestroy public synchronized void close() { if(consumer!=null) { try { consumer.close(Duration.ofSeconds(1)); } finally { consumer=null; } } }
}
