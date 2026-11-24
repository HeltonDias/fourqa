package com.fourqa.api.web;

import com.fourqa.api.azure.AzureCacheRead.AzureCacheUnavailableError;
import com.fourqa.api.domain.PlanPeriod.PlanningPeriodError;
import com.fourqa.api.persistence.PlanningConflictError;
import com.fourqa.api.util.Py;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Exception handlers of {@code fourqa.app} plus FastAPI's default 404/405/500 bodies. */
@RestControllerAdvice
public class ApiExceptionHandler {
  private static final Logger LOG = LoggerFactory.getLogger(ApiExceptionHandler.class);

  @ExceptionHandler(HttpError.class)
  public ResponseEntity<byte[]> http(HttpError err) {
    return Json.status(err.status, err.body);
  }

  @ExceptionHandler(AzureCacheUnavailableError.class)
  public ResponseEntity<byte[]> cacheUnavailable(AzureCacheUnavailableError err) {
    return Json.status(503, Py.obj("error", err.getMessage(), "unavailable", true));
  }

  @ExceptionHandler(PlanningPeriodError.class)
  public ResponseEntity<byte[]> period(PlanningPeriodError err) {
    return Json.status(400, Py.obj("error", err.getMessage()));
  }

  @ExceptionHandler(PlanningConflictError.class)
  public ResponseEntity<byte[]> conflict(PlanningConflictError err) {
    return Json.status(409, Py.obj("error", err.getMessage()));
  }

  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<byte[]> notFound(NoResourceFoundException err) {
    return Json.status(404, Py.obj("detail", "Not Found"));
  }

  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  public ResponseEntity<byte[]> methodNotAllowed(HttpRequestMethodNotSupportedException err) {
    return Json.status(405, Py.obj("detail", "Method Not Allowed"));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<byte[]> unexpected(Exception err) {
    LOG.error("Unhandled API error", err);
    return ResponseEntity.status(500)
        .contentType(MediaType.TEXT_PLAIN)
        .body("Internal Server Error".getBytes(StandardCharsets.UTF_8));
  }
}
