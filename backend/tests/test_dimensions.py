from fourqa.domain.dimensions import apply_hierarchy_overrides, detect_dimensions


def test_detects_priority_and_front_from_suite_path():
    paths = [
        {"ancestors": [{"name": "Prioridade 0"}, {"name": "GEATE"}, {"name": "Folha"}]},
        {"ancestors": [{"name": "Prioridade 1"}, {"name": "GEDEV"}, {"name": "Folha"}]},
    ]
    dims = detect_dimensions(paths, {"known_fronts": ["GEATE", "GEDEV"]})
    by_role = {dim["role"]: dim for dim in dims}
    assert by_role["priority"]["level"] == 1
    assert by_role["priority"]["values"] == ["Prioridade 0", "Prioridade 1"]
    assert by_role["front"]["values"] == ["GEATE", "GEDEV"]
    assert "generic" not in by_role or by_role.get("generic", {}).get("level") != 1


def test_override_renames_level_without_guessing_role():
    detected = detect_dimensions(
        [{"ancestors": [{"name": "Bloco A"}, {"name": "Folha"}]}],
        None,
    )
    renamed = apply_hierarchy_overrides(
        detected,
        [{"column_name": "Ciclo", "source_level": "1", "active": True}],
    )
    assert renamed[0]["label"] == "Ciclo"
    assert renamed[0]["confidence"] == 1.0
