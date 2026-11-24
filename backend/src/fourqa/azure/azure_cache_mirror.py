"""Azure cache mirror flag (mirrors azureCacheMirror.ts)."""

from fourqa.azure.config import env_value


def is_azure_cache_mirror_enabled() -> bool:
    return env_value("AZURE_CACHE_MIRROR") == "1"
