package com.fourqa.api;

import com.fourqa.api.azure.AzureCacheRead;
import com.fourqa.api.config.Env;
import com.fourqa.api.persistence.OperationalProvider;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class FourQaApplication {

  public static void main(String[] args) {
    OperationalProvider.assertOperationalProvider(Env.value("DB_PROVIDER"));
    AzureCacheRead.assertHostedCacheMode();
    SpringApplication.run(FourQaApplication.class, args);
  }
}
