package com.fourqa.api.web;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Error with the exact JSON body of the Python API: FastAPI {@code HTTPException} answers {@code {"detail": ...}}; the
 * middleware and exception handlers answer {@code {"error": ...}}.
 */
public class HttpError extends RuntimeException {
  public final int status;
  public final Map<String, Object> body;

  public HttpError(int status, Map<String, Object> body, String message) {
    super(message);
    this.status = status;
    this.body = body;
  }

  public static HttpError detail(int status, Object detail) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("detail", detail);
    return new HttpError(status, body, String.valueOf(detail));
  }

  public static HttpError error(int status, String message) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("error", message);
    return new HttpError(status, body, message);
  }
}
