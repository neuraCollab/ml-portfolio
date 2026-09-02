import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from dispatch import RoundRobinDispatcher


def test_pick_raises_on_empty_endpoint_list():
    dispatcher = RoundRobinDispatcher()
    with pytest.raises(ValueError):
        dispatcher.pick([])


def test_pick_cycles_through_endpoints_in_order():
    dispatcher = RoundRobinDispatcher()
    endpoints = ["10.0.0.1:50061", "10.0.0.2:50061", "10.0.0.3:50061"]
    picks = [dispatcher.pick(endpoints) for _ in range(6)]
    assert picks == endpoints + endpoints


def test_pick_resets_counter_when_endpoint_list_size_changes():
    dispatcher = RoundRobinDispatcher()
    endpoints = ["10.0.0.1:50061", "10.0.0.2:50061", "10.0.0.3:50061"]
    dispatcher.pick(endpoints)
    dispatcher.pick(endpoints)  # counter now at 2, next pick would be index 2

    shrunk = ["10.0.0.1:50061", "10.0.0.2:50061"]
    # Without a reset, index 2 would be out of range for this 2-element list.
    first_after_shrink = dispatcher.pick(shrunk)
    assert first_after_shrink == "10.0.0.1:50061"


def test_pick_with_single_endpoint_always_returns_it():
    dispatcher = RoundRobinDispatcher()
    endpoints = ["10.0.0.1:50061"]
    for _ in range(3):
        assert dispatcher.pick(endpoints) == "10.0.0.1:50061"
