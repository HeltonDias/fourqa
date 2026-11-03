"""Criptografia simétrica dos PATs guardados no banco."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from fourqa.azure.config import env_value

KEY_ENV = "FOURQA_PAT_ENCRYPTION_KEY"


class CredentialKeyError(Exception):
    pass


def _fernet() -> Fernet:
    secret = env_value(KEY_ENV)
    if not secret:
        raise CredentialKeyError(f"Login desabilitado. Configure {KEY_ENV} neste ambiente.")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def encryption_configured() -> bool:
    return bool(env_value(KEY_ENV))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken as err:
        raise CredentialKeyError("PAT salvo não pode ser lido. Entre novamente.") from err
