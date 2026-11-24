from fourqa.http.planning_cell_base import parse_planning_cell_base


def test_parse_day_base_maps_to_expected_quantity_key() -> None:
    parsed = parse_planning_cell_base({"baseQuantity": 5}, "day")
    assert parsed is not None
    assert parsed["guard"] is True
    assert parsed["expected_quantity"] == 5.0
    assert parsed.get("expectedQuantity") is None


def test_parse_start_base_maps_to_expected_text_key() -> None:
    parsed = parse_planning_cell_base({"baseDate": "2026-10-29"}, "start")
    assert parsed is not None
    assert parsed["guard"] is True
    assert parsed["expected_text"] == "2026-10-29"
