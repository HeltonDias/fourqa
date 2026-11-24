package com.fourqa.api.auth;

import com.fourqa.api.azure.AzureHttpError;
import com.fourqa.api.azure.Http;
import com.fourqa.api.util.Py;
import com.fourqa.api.util.PyJson;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Identity and discovery in Azure DevOps with the user's own credential (port of {@code ado_identity}). */
public final class AdoIdentity {
  static final String API_VERSION = "7.1";
  static final String VSSPS = "https://app.vssps.visualstudio.com";
  static final String DEV = "https://dev.azure.com";
  public static final String REJECTED =
      "O Azure DevOps recusou o PAT. Confira se ele está correto, não expirou e tem leitura em "
          + "Test Management, Project and Team e User Profile.";
  public static final String ORG_REQUIRED = "Informe a organização do Azure DevOps (dev.azure.com/<organização>).";
  private static final Pattern ORG_NAME = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9-]{0,49}$");
  private static final Pattern DEV_URL = Pattern.compile("^(?:https?://)?dev\\.azure\\.com/([^/?#]+)", Pattern.CASE_INSENSITIVE);
  private static final Pattern VS_URL = Pattern.compile("^(?:https?://)?([^./]+)\\.visualstudio\\.com", Pattern.CASE_INSENSITIVE);

  private AdoIdentity() {}

  static String auth(String credential) {
    if (credential.startsWith("Basic ") || credential.startsWith("Bearer ")) return credential;
    return Http.basic(credential);
  }

  private static HttpResponse<String> fetch(String url, String pat) {
    try {
      return Http.send("GET", url, Map.of("Authorization", auth(pat), "Accept", "application/json"), null, 30);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new AzureHttpError("Falha de rede ao acessar o Azure DevOps.", 0);
    } catch (Exception e) {
      throw new AzureHttpError("Falha de rede ao acessar o Azure DevOps.", 0);
    }
  }

  private static void rejectAuth(int status) {
    if (status == 203 || status == 401 || status == 403 || (status >= 300 && status < 400))
      throw new AzureHttpError(REJECTED, status == 203 ? 401 : status);
  }

  static Object getJson(String url, String pat) {
    HttpResponse<String> res = fetch(url, pat);
    int status = res.statusCode();
    rejectAuth(status);
    if (status == 404) throw new AzureHttpError("Recurso não encontrado no Azure DevOps.", 404);
    if (status >= 400) throw new AzureHttpError("Azure DevOps respondeu HTTP " + status + ".", status);
    try {
      return PyJson.loads(res.body());
    } catch (PyJson.DecodeException e) {
      throw new AzureHttpError(REJECTED, 401);
    }
  }

  static String url(String base, String path, Map<String, Object> query) {
    Map<String, Object> params = new LinkedHashMap<>();
    params.put("api-version", API_VERSION);
    if (query != null) params.putAll(query);
    return base + path + "?" + Http.urlencode(params);
  }

  public static String normalizeOrganization(Object value) {
    if (!(value instanceof String s)) return null;
    String text = s.strip().replaceAll("/+$", "");
    Matcher m = DEV_URL.matcher(text);
    if (m.find()) text = m.group(1);
    else {
      m = VS_URL.matcher(text);
      if (m.find()) text = m.group(1);
    }
    return ORG_NAME.matcher(text).matches() ? text : null;
  }

  public static Map<String, Object> fetchGlobalProfile(String authorization) {
    Map<String, Object> data = Py.map(getJson(url(VSSPS, "/_apis/profile/profiles/me", null), authorization));
    if (data == null || !Py.truthy(data.get("id"))) throw new AzureHttpError(REJECTED, 401);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", Py.str(data.get("id")));
    out.put("email", Py.truthy(data.get("emailAddress")) ? data.get("emailAddress") : null);
    out.put("displayName", Py.truthy(data.get("displayName")) ? data.get("displayName") : Py.truthy(data.get("emailAddress")) ? data.get("emailAddress") : null);
    return out;
  }

  public static Map<String, Object> fetchProfile(String pat, String organization) {
    if (!Py.truthy(organization)) throw new AzureHttpError(ORG_REQUIRED, 401);
    Map<String, Object> data = Py.map(getJson(DEV + "/" + Http.quote(organization) + "/_apis/connectionData", pat));
    Map<String, Object> user = data == null ? null : Py.map(data.get("authenticatedUser"));
    if (user == null || !Py.truthy(user.get("id"))) throw new AzureHttpError(REJECTED, 401);
    Map<String, Object> props = Py.map(user.get("properties"));
    Map<String, Object> account = props == null ? null : Py.map(props.get("Account"));
    Object rawEmail = account == null ? null : account.get("$value");
    String email = rawEmail instanceof String s ? s : null;
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", Py.str(user.get("id")));
    out.put("email", email);
    Object name = Py.or(user.get("providerDisplayName"), Py.or(user.get("customDisplayName"), email));
    out.put("displayName", name);
    return out;
  }

  public static List<String> listOrganizations(String pat, String profileId, String orgHint) {
    List<String> names = new ArrayList<>();
    try {
      Map<String, Object> data = Py.map(getJson(url(VSSPS, "/_apis/accounts", Py.obj("memberId", profileId)), pat));
      for (Object row : data == null ? List.of() : Py.rows(data.get("value"))) {
        Map<String, Object> r = Py.map(row);
        Object name = r == null ? null : r.get("accountName");
        if (name instanceof String s && !s.strip().isEmpty()) names.add(s.strip());
      }
    } catch (AzureHttpError e) {
      if (!Py.truthy(orgHint)) throw e;
    }
    if (orgHint != null && !orgHint.strip().isEmpty()
        && names.stream().noneMatch(n -> n.toLowerCase().equals(orgHint.strip().toLowerCase())))
      names.add(orgHint.strip());
    List<String> out = new ArrayList<>(new LinkedHashSet<>(names));
    out.sort(Comparator.comparing(String::toLowerCase));
    return out;
  }

  public static List<Map<String, Object>> listProjects(String pat, String organization) {
    Map<String, Object> data = Py.map(getJson(url(DEV + "/" + Http.quote(organization), "/_apis/projects", Py.obj("$top", 500L)), pat));
    List<Map<String, Object>> out = new ArrayList<>();
    for (Object row : data == null ? List.of() : Py.rows(data.get("value"))) {
      Map<String, Object> r = Py.map(row);
      if (r != null && Py.truthy(r.get("name"))) out.add(Py.obj("id", r.get("id"), "name", r.get("name")));
    }
    out.sort(Comparator.comparing(r -> Py.str(r.get("name")).toLowerCase()));
    return out;
  }

  public static List<Map<String, Object>> listTestPlans(String pat, String organization, String project) {
    String base = DEV + "/" + Http.quote(organization) + "/" + Http.quote(project);
    List<Map<String, Object>> out = new ArrayList<>();
    String token = null;
    for (int i = 0; i < 20; i++) {
      Map<String, Object> query = Py.obj("filterActivePlans", "true");
      if (Py.truthy(token)) query.put("continuationToken", token);
      HttpResponse<String> res = fetch(url(base, "/_apis/testplan/plans", query), pat);
      int status = res.statusCode();
      rejectAuth(status);
      if (status >= 400) throw new AzureHttpError("Azure DevOps respondeu HTTP " + status + ".", status);
      Map<String, Object> data = Py.map(PyJson.loads(res.body()));
      for (Object row : data == null ? List.of() : Py.rows(data.get("value"))) {
        Map<String, Object> r = Py.map(row);
        if (r != null && Py.isInt(r.get("id")))
          out.add(Py.obj("id", r.get("id"), "name", Py.or(r.get("name"), "Plano " + r.get("id"))));
      }
      token = res.headers().firstValue("x-ms-continuationtoken").orElse(null);
      if (!Py.truthy(token)) break;
    }
    out.sort(Comparator.comparing(r -> Py.str(r.get("name")).toLowerCase()));
    return out;
  }

  public static Map<String, Object> getTestPlan(String pat, String organization, String project, long planId) {
    String base = DEV + "/" + Http.quote(organization) + "/" + Http.quote(project);
    Map<String, Object> data = Py.map(getJson(url(base, "/_apis/testplan/plans/" + planId, null), pat));
    if (data == null || !Py.isInt(data.get("id"))) throw new AzureHttpError("Test Plan não encontrado.", 404);
    return Py.obj("id", data.get("id"), "name", Py.or(data.get("name"), "Plano " + data.get("id")));
  }
}
