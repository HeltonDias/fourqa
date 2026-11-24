package com.fourqa.api.azure;

public class AzureHttpError extends RuntimeException {
  public final int status;

  public AzureHttpError(String message, int status) {
    super(message);
    this.status = status;
  }
}
