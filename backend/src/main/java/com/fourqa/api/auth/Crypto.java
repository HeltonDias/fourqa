package com.fourqa.api.auth;

import com.fourqa.api.config.Env;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Fernet (AES-128-CBC + HMAC-SHA256) with key {@code urlsafe_b64(sha256(FOURQA_PAT_ENCRYPTION_KEY))}: reads and writes
 * the same tokens as Python {@code cryptography.fernet}.
 */
public final class Crypto {
  public static final String KEY_ENV = "FOURQA_PAT_ENCRYPTION_KEY";
  private static final SecureRandom RANDOM = new SecureRandom();

  private Crypto() {}

  public static class CredentialKeyError extends RuntimeException {
    public CredentialKeyError(String message) {
      super(message);
    }
  }

  public static boolean encryptionConfigured() {
    return !Env.value(KEY_ENV).isEmpty();
  }

  private static byte[] key() {
    String secret = Env.value(KEY_ENV);
    if (secret.isEmpty()) throw new CredentialKeyError("Login desabilitado. Configure " + KEY_ENV + " neste ambiente.");
    try {
      return MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public static String encryptSecret(String value) {
    return encrypt(key(), value.getBytes(StandardCharsets.UTF_8), System.currentTimeMillis() / 1000);
  }

  public static String decryptSecret(String token) {
    try {
      return new String(decrypt(key(), token), StandardCharsets.UTF_8);
    } catch (CredentialKeyError e) {
      throw e;
    } catch (RuntimeException e) {
      throw new CredentialKeyError("PAT salvo não pode ser lido. Entre novamente.");
    }
  }

  static String encrypt(byte[] key, byte[] plain, long timestamp) {
    try {
      byte[] iv = new byte[16];
      RANDOM.nextBytes(iv);
      Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
      cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(Arrays.copyOfRange(key, 16, 32), "AES"), new IvParameterSpec(iv));
      byte[] ct = cipher.doFinal(plain);
      ByteBuffer buf = ByteBuffer.allocate(1 + 8 + 16 + ct.length);
      buf.put((byte) 0x80).putLong(timestamp).put(iv).put(ct);
      byte[] body = buf.array();
      byte[] mac = hmac(Arrays.copyOfRange(key, 0, 16), body);
      byte[] token = Arrays.copyOf(body, body.length + 32);
      System.arraycopy(mac, 0, token, body.length, 32);
      return Base64.getUrlEncoder().encodeToString(token);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  static byte[] decrypt(byte[] key, String token) {
    byte[] data;
    try {
      data = Base64.getUrlDecoder().decode(token.strip());
    } catch (IllegalArgumentException e) {
      throw new IllegalArgumentException("invalid token");
    }
    if (data.length < 1 + 8 + 16 + 16 + 32 || data[0] != (byte) 0x80) throw new IllegalArgumentException("invalid token");
    byte[] body = Arrays.copyOfRange(data, 0, data.length - 32);
    byte[] mac = Arrays.copyOfRange(data, data.length - 32, data.length);
    if (!MessageDigest.isEqual(hmac(Arrays.copyOfRange(key, 0, 16), body), mac)) throw new IllegalArgumentException("invalid token");
    try {
      byte[] iv = Arrays.copyOfRange(body, 9, 25);
      Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
      cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(Arrays.copyOfRange(key, 16, 32), "AES"), new IvParameterSpec(iv));
      return cipher.doFinal(Arrays.copyOfRange(body, 25, body.length));
    } catch (Exception e) {
      throw new IllegalArgumentException("invalid token");
    }
  }

  private static byte[] hmac(byte[] key, byte[] data) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(key, "HmacSHA256"));
      return mac.doFinal(data);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
