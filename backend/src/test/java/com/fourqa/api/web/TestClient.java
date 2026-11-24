package com.fourqa.api.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import com.fourqa.api.util.PyJson;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Minimal Starlette-TestClient look-alike: JSON bodies, persistent cookie jar, no redirect following. */
public final class TestClient {
  private final MockMvc mvc;
  public final Map<String, String> cookies = new LinkedHashMap<>();

  TestClient(MockMvc mvc) {
    this.mvc = mvc;
  }

  public record Resp(int status, String text, MockHttpServletResponse raw) {
    @SuppressWarnings("unchecked")
    public Map<String, Object> json() {
      return (Map<String, Object>) PyJson.loads(text);
    }

    public String header(String name) {
      return raw.getHeader(name);
    }

    public List<String> headers(String name) {
      return raw.getHeaders(name);
    }
  }

  public Resp send(String method, String uri, Object body, String... headers) {
    try {
      MockHttpServletRequestBuilder req = request(HttpMethod.valueOf(method), java.net.URI.create(uri));
      if (body != null) req.contentType("application/json").content(PyJson.dumpsCompact(body).getBytes(StandardCharsets.UTF_8));
      for (int i = 0; i + 1 < headers.length; i += 2) req.header(headers[i], headers[i + 1]);
      if (!cookies.isEmpty())
        req.cookie(cookies.entrySet().stream().map(e -> new Cookie(e.getKey(), e.getValue())).toArray(Cookie[]::new));
      MockHttpServletResponse res = mvc.perform(req).andReturn().getResponse();
      for (String setCookie : res.getHeaders("Set-Cookie")) {
        String pair = setCookie.split(";", 2)[0];
        int eq = pair.indexOf('=');
        String name = pair.substring(0, eq).strip();
        String value = pair.substring(eq + 1);
        if (setCookie.toLowerCase().contains("max-age=0")) cookies.remove(name);
        else cookies.put(name, value);
      }
      return new Resp(res.getStatus(), res.getContentAsString(StandardCharsets.UTF_8), res);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  public Resp get(String uri, String... headers) {
    return send("GET", uri, null, headers);
  }

  public Resp post(String uri, Object body, String... headers) {
    return send("POST", uri, body, headers);
  }

  public Resp put(String uri, Object body, String... headers) {
    return send("PUT", uri, body, headers);
  }

  public Resp delete(String uri, String... headers) {
    return send("DELETE", uri, null, headers);
  }
}
