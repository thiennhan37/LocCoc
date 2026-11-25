package com.loccoc.api_gateway;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.loccoc.api_gateway.configuration.GatewayProperties;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class GatewayPropertiesTests {
  private static final String VALID_TOKEN = "token-with-at-least-32-characters-long";

  private Map<String, URI> validRoutes() {
    var map = new HashMap<String, URI>();
    for (String route : GatewayProperties.REQUIRED_ROUTES) {
      map.put(route, URI.create("http://127.0.0.1:8080"));
    }
    return map;
  }

  @Test
  void acceptsAllRequiredRoutesBlankAiTokenAndExplicitCorsOrigins() {
    assertDoesNotThrow(
        () ->
            new GatewayProperties(
                validRoutes(),
                60000,
                100,
                5,
                60000,
                "",
                true,
                VALID_TOKEN,
                3000,
                10000,
                8388608,
                new String[] {"http://localhost:3000", "https://app.loccoc.test"}));
  }

  @Test
  void rejectsMissingRequiredRoute() {
    for (String missing : GatewayProperties.REQUIRED_ROUTES) {
      var routes = validRoutes();
      routes.remove(missing);
      assertThrows(
          IllegalArgumentException.class,
          () ->
              new GatewayProperties(
                  routes,
                  60000,
                  100,
                  5,
                  60000,
                  "",
                  true,
                  VALID_TOKEN,
                  3000,
                  10000,
                  8388608,
                  new String[] {"http://localhost:3000"}));
    }
  }

  @Test
  void rejectsWildcardOrPathCorsOrigins() {
    for (String badOrigin :
        new String[] {"*", "http://localhost:3000/", "http://localhost:3000/app", "ftp://bad"}) {
      assertThrows(
          IllegalArgumentException.class,
          () ->
              new GatewayProperties(
                  validRoutes(),
                  60000,
                  100,
                  5,
                  60000,
                  "",
                  true,
                  VALID_TOKEN,
                  3000,
                  10000,
                  8388608,
                  new String[] {badOrigin}));
    }
  }

  @Test
  void rejectsShortAiTokenOrMissingInternalTokenWhenAccountAccessEnabled() {
    assertThrows(
        IllegalArgumentException.class,
        () ->
            new GatewayProperties(
                validRoutes(),
                60000,
                100,
                5,
                60000,
                "short-token",
                true,
                VALID_TOKEN,
                3000,
                10000,
                8388608,
                new String[] {"http://localhost:3000"}));

    assertThrows(
        IllegalArgumentException.class,
        () ->
            new GatewayProperties(
                validRoutes(),
                60000,
                100,
                5,
                60000,
                "",
                true,
                "short",
                3000,
                10000,
                8388608,
                new String[] {"http://localhost:3000"}));
  }
}
