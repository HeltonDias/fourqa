from fourqa.http.write_auth import (
    cookie_is_secure,
    decide_read_auth,
    decide_write_auth,
    open_writes_allowed,
    presented_authorization,
    token_matches,
)


def test_accepts_configured_bearer():
    assert (
        decide_write_auth(
            configured_token="segredo",
            allow_open_writes=False,
            authorization_header="Bearer segredo",
        )
        == "allow"
    )


def test_denies_missing_or_wrong_token():
    assert (
        decide_write_auth(
            configured_token="segredo",
            allow_open_writes=False,
            authorization_header=None,
        )
        == "unauthorized"
    )
    assert (
        decide_write_auth(
            configured_token="segredo",
            allow_open_writes=False,
            authorization_header="Bearer outro",
        )
        == "unauthorized"
    )


def test_unconfigured_server_closed_unless_open_writes():
    assert (
        decide_write_auth(configured_token="  ", allow_open_writes=False, authorization_header=None)
        == "unconfigured"
    )
    assert (
        decide_write_auth(configured_token="", allow_open_writes=True, authorization_header=None)
        == "allow"
    )


def test_cookie_falls_back_when_header_absent():
    assert presented_authorization("Bearer segredo", "outro") == "Bearer segredo"
    assert presented_authorization(None, "segredo") == "Bearer segredo"
    assert presented_authorization("  ", None) is None
    assert token_matches("segredo", "segredo") is True
    assert token_matches("segredo", "outro") is False
    assert cookie_is_secure(vercel=True, scheme="http") is True
    assert cookie_is_secure(vercel=False, scheme="http") is False
    assert cookie_is_secure(vercel=False, scheme="https") is True


def test_vercel_open_writes_and_read_auth():
    assert open_writes_allowed(vercel=True, allow_open_writes_flag="1") is False
    assert open_writes_allowed(vercel=False, allow_open_writes_flag="1") is True
    assert (
        decide_read_auth(protect_reads=True, configured_token="", authorization_header=None)
        == "unconfigured"
    )
    assert (
        decide_read_auth(protect_reads=False, configured_token="", authorization_header=None)
        == "allow"
    )
