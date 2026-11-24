package com.fourqa.api.azure;

import com.fourqa.api.util.Py;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.BiConsumer;
import java.util.function.Function;

/** Port of {@code fourqa.azure.util}. */
public final class AzureUtil {
  private AzureUtil() {}

  public static String normalize(Object value) {
    String text = Py.truthy(value) ? Py.str(value) : "";
    text = Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("[\\u0300-\\u036f]", "");
    return text.strip().toLowerCase();
  }

  public static String emptyToNull(String value) {
    return value == null || value.isEmpty() ? null : value;
  }

  /** Runs {@code worker} over {@code items}, {@code limit} at a time on virtual threads, keeping input order. */
  public static <T, R> List<R> mapInBatches(List<T> items, int limit, Function<T, R> worker, BiConsumer<Integer, Integer> onBatchDone) {
    List<R> out = new ArrayList<>(items.size());
    Context ctx = Context.capture();
    try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
      for (int start = 0; start < items.size(); start += limit) {
        List<T> batch = items.subList(start, Math.min(items.size(), start + limit));
        List<Future<R>> futures = new ArrayList<>(batch.size());
        for (T item : batch) futures.add(pool.submit(() -> ctx.call(() -> worker.apply(item))));
        for (Future<R> f : futures) out.add(join(f));
        if (onBatchDone != null) onBatchDone.accept(Math.min(start + limit, items.size()), items.size());
      }
    }
    return out;
  }

  private static <R> R join(Future<R> f) {
    try {
      return f.get();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    } catch (ExecutionException e) {
      if (e.getCause() instanceof RuntimeException re) throw re;
      if (e.getCause() instanceof Error err) throw err;
      throw new IllegalStateException(e.getCause());
    }
  }

  /** Request-scoped values (meta scope, identity) copied to worker threads, like asyncio contextvars. */
  public record Context(Object scope, Object identity) {
    public static Context capture() {
      return new Context(com.fourqa.api.persistence.MetaScope.snapshot(), com.fourqa.api.auth.RequestIdentity.snapshot());
    }

    public <R> R call(java.util.function.Supplier<R> body) {
      Object prevScope = com.fourqa.api.persistence.MetaScope.snapshot();
      Object prevIdentity = com.fourqa.api.auth.RequestIdentity.snapshot();
      com.fourqa.api.persistence.MetaScope.restore(scope);
      com.fourqa.api.auth.RequestIdentity.restore(identity);
      try {
        return body.get();
      } finally {
        com.fourqa.api.persistence.MetaScope.restore(prevScope);
        com.fourqa.api.auth.RequestIdentity.restore(prevIdentity);
      }
    }

    public void run(Runnable body) {
      call(() -> {
        body.run();
        return null;
      });
    }
  }
}
