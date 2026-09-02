"""Real round-robin pod selection over the Coordinator's currently-known
worker endpoint list -- a counter that cycles through the list in order and
resets whenever the list's size changes (e.g. after a scale event), so it
never indexes past the end of a shrunk list."""

import threading


class RoundRobinDispatcher:
    def __init__(self):
        self._counter = 0
        self._last_size: int | None = None
        self._lock = threading.Lock()

    def pick(self, endpoints: list[str]) -> str:
        if not endpoints:
            raise ValueError("no endpoints available")
        with self._lock:
            if self._last_size != len(endpoints):
                self._counter = 0
                self._last_size = len(endpoints)
            idx = self._counter % len(endpoints)
            self._counter += 1
        return endpoints[idx]
