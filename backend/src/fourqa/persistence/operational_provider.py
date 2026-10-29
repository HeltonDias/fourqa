"""Provider operacional (mirrors backend/src/persistence/operationalProvider.ts)."""


def assert_operational_provider(value: str) -> None:
    if value.strip().lower() != "postgres":
        raise RuntimeError(
            "A API exige DB_PROVIDER=postgres. SQLite fica restrito aos testes e ao backup."
        )
