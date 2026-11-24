package com.fourqa.api.web;

import com.fourqa.api.auth.Access;
import com.fourqa.api.auth.RequestIdentity;
import com.fourqa.api.auth.Session;
import com.fourqa.api.persistence.MetaScope;
import com.fourqa.api.util.Py;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Security headers plus the identity/access middleware of {@code fourqa.app}. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class IdentityFilter extends OncePerRequestFilter {
  private static final Logger LOG = LoggerFactory.getLogger(IdentityFilter.class);

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    String path = request.getRequestURI();
    if (!path.startsWith("/api") || path.endsWith("/health") || "OPTIONS".equals(request.getMethod())) {
      chain.doFilter(request, response);
      return;
    }
    String userCookie = Requests.cookie(request, Session.USER_COOKIE);
    String connectionHeader = request.getHeader(RequestIdentity.CONNECTION_HEADER);
    String planKey = Requests.query(request, "planKey");
    RequestIdentity ident;
    try {
      ident = RequestIdentity.resolve(userCookie, connectionHeader, planKey);
    } catch (RequestIdentity.IdentityError err) {
      write(response, err.status, Py.obj("error", err.getMessage()));
      return;
    } catch (RuntimeException err) {
      LOG.error("Falha ao resolver identidade na rota {}: {}", path, err.toString(), err);
      if (RequestIdentity.needsIdentity(userCookie, connectionHeader, planKey) && (Py.truthy(userCookie) || Py.truthy(connectionHeader))) {
        write(response, 503, Py.obj("error", "Banco indisponível."));
        return;
      }
      ident = new RequestIdentity();
    }
    Access.Presented presented = Requests.presented(request);
    Access.AccessError denied = Access.readAccessError(request.getMethod(), path, presented, ident);
    if (denied != null) {
      write(response, denied.status(), Py.obj("error", denied.message()));
      return;
    }
    ident.serviceAccess = Access.serviceTokenOk(presented);
    Map<String, Object> user = ident.user;
    String actor = user == null ? null : Py.truthy(user.get("display_name")) ? Py.str(user.get("display_name"))
        : user.get("email") == null ? null : Py.str(user.get("email"));
    RequestIdentity.set(ident);
    MetaScope.setMetaScope(MetaScope.connectionScope(ident.connection));
    MetaScope.setActorName(actor);
    try {
      chain.doFilter(request, response);
    } finally {
      MetaScope.clear();
      RequestIdentity.set(null);
    }
  }

  static void write(HttpServletResponse response, int status, Object body) throws IOException {
    response.setStatus(status);
    response.setContentType("application/json");
    response.getOutputStream().write(Json.bytes(body));
  }
}
