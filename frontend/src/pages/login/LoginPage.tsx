import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { signIn, useSession } from "../../auth/session";
import { FoursysMark } from "../../components/FoursysMark";
import "./login.css";

const ENTRA_START = "/api/auth/entra/start";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { state, refresh } = useSession();
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pat, setPat] = useState("");
  const [organization, setOrganization] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(() => params.get("erro"));
  const from = (location.state as { from?: string } | null)?.from;
  const target = from && from !== "/login" ? from : "/";

  if (state?.authenticated) return <Navigate to={target} replace />;
  const loginDisabled = state != null && !state.loginEnabled;
  const entraEnabled = !!state?.entraEnabled;
  const patEnabled = state == null || !!state.patEnabled;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!pat.trim() || !organization.trim()) return;
    setSigningIn(true);
    setError(null);
    try {
      await signIn(pat.trim(), organization.trim());
      setPat("");
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setSigningIn(false);
    }
  };

  const patForm = (
    <form className="login-form" onSubmit={onSubmit}>
      <label className="login-field">
        Personal Access Token
        <input
          type="password"
          autoComplete="off"
          value={pat}
          onChange={(e) => setPat(e.target.value)}
          placeholder="Cole aqui o PAT"
          required
        />
      </label>
      <label className="login-field">
        Organização
        <input
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          placeholder="ex.: Delivery-Un2"
          required
        />
        <small>Nome que aparece em dev.azure.com/&lt;organização&gt;. Pode colar a URL.</small>
      </label>
      <button
        type="submit"
        className="login-ms-btn"
        disabled={loginDisabled || signingIn || !pat.trim() || !organization.trim()}
      >
        <span>{signingIn ? "Validando…" : "Entrar com PAT"}</span>
      </button>
      <p className="login-hint">
        Escopos mínimos do PAT: Test Management, Work Items, Project and Team e User Profile (leitura).
      </p>
    </form>
  );

  return (
    <div className="login-screen">
      <main className="login-card card">
        <div className="login-brand">
          <FoursysMark className="login-brand-mark" />
          <span>FourQA</span>
        </div>

        <h1>Entrar</h1>
        <p className="login-lead">
          {entraEnabled
            ? "Use sua conta institucional. Os projetos seguem as permissões da sua conta no Azure DevOps."
            : "Use seu Personal Access Token do Azure DevOps. Os projetos seguem as permissões da sua conta."}
        </p>

        {loginDisabled ? (
          <p className="login-error" role="status">
            Login desativado neste servidor: faltam FOURQA_SESSION_SECRET e FOURQA_PAT_ENCRYPTION_KEY. Para testar
            localmente, pare o <code>npm run dev</code> e rode <code>npm run dev:auth -- --head=seu.email@empresa.com</code>.
          </p>
        ) : null}

        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}

        {entraEnabled ? (
          <button
            type="button"
            className="login-ms-btn login-ms-btn--primary"
            disabled={redirecting}
            onClick={() => {
              setRedirecting(true);
              window.location.assign(ENTRA_START);
            }}
          >
            <MicrosoftLogo />
            <span>{redirecting ? "Abrindo Microsoft…" : "Entrar com Microsoft"}</span>
          </button>
        ) : null}

        {patEnabled && entraEnabled ? (
          <details className="login-scopes">
            <summary>Entrar com PAT (desenvolvimento)</summary>
            {patForm}
          </details>
        ) : null}
        {patEnabled && !entraEnabled ? patForm : null}
      </main>
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
