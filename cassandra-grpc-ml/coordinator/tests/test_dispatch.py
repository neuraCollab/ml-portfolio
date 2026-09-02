import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
import threading
from collections import Counter

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


def test_pick_thread_safe_concurrent_access():
    """Verify that concurrent calls to pick() from multiple threads are thread-safe.

    This test ensures that the read-modify-write sequence in pick() (reading
    _counter, computing index, and incrementing) is atomic via locking.
    With multiple threads calling pick() concurrently, each endpoint should be
    selected exactly the expected number of times (no duplicates, no skips).
    """
    dispatcher = RoundRobinDispatcher()
    endpoints = ["10.0.0.1:50061", "10.0.0.2:50061", "10.0.0.3:50061"]
    num_threads = 6
    picks_per_thread = 10
    results = []
    results_lock = threading.Lock()

    def worker():
        for _ in range(picks_per_thread):
            endpoint = dispatcher.pick(endpoints)
            with results_lock:
                results.append(endpoint)

    threads = []
    for _ in range(num_threads):
        t = threading.Thread(target=worker)
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    # Total picks should be num_threads * picks_per_thread = 60
    assert len(results) == num_threads * picks_per_thread

    # Each of 3 endpoints should be picked exactly 20 times (60 / 3)
    pick_counts = Counter(results)
    assert len(pick_counts) == 3  # All 3 endpoints were picked
    for endpoint in endpoints:
        assert endpoint in pick_counts
        assert pick_counts[endpoint] == 20  # Each exactly 20 times
