from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import replace
from threading import Lock

from volcengine_service.config import get_settings
from volcengine_service.models import JobState

JobSubscriber = Callable[[JobState], None]  # Subscribers receive immutable job snapshots.


class JobStore:
    TERMINAL_STATUSES = frozenset({"COMPLETED", "FAILED"})  # Only evict jobs that are done polling.

    def __init__(self) -> None:
        self._jobs: dict[str, JobState] = {}  # In-memory job registry.
        self._subscribers: dict[str, set[JobSubscriber]] = {}  # Track listeners per job id.
        self._lock = Lock()  # Guard cross-thread updates.

    def _trim_locked(self, now_ms: int | None = None) -> None:
        settings = get_settings()
        current_ms = now_ms if now_ms is not None else int(time.time() * 1000)
        ttl_ms = settings.job_ttl_seconds * 1000

        expired_ids = [
            job_id
            for job_id, job in self._jobs.items()
            if job.status in self.TERMINAL_STATUSES and current_ms - job.updated_at > ttl_ms
        ]
        for job_id in expired_ids:
            self._jobs.pop(job_id, None)
            self._subscribers.pop(job_id, None)  # Drop listeners when the backing job expires.

        terminal_jobs = sorted(
            (
                (job_id, job.updated_at)
                for job_id, job in self._jobs.items()
                if job.status in self.TERMINAL_STATUSES
            ),
            key=lambda item: item[1],
            reverse=True,
        )
        for job_id, _ in terminal_jobs[settings.max_terminal_jobs:]:
            self._jobs.pop(job_id, None)  # Prefer dropping the oldest completed/failed jobs first.
            self._subscribers.pop(job_id, None)  # Prune listeners alongside evicted terminal jobs.

    def _notify_subscribers(self, job_id: str, job: JobState, subscribers: set[JobSubscriber]) -> None:
        for subscriber in subscribers:
            subscriber(replace(job))  # Hand every listener its own snapshot copy.

    def create(self, job: JobState) -> JobState:
        subscribers: set[JobSubscriber]
        with self._lock:
            self._trim_locked(job.updated_at)
            self._jobs[job.id] = job
            subscribers = set(self._subscribers.get(job.id, set()))
            snapshot = replace(job)
        if subscribers:
            self._notify_subscribers(job.id, snapshot, subscribers)
        return replace(snapshot)

    def get(self, job_id: str) -> JobState | None:
        with self._lock:
            self._trim_locked()
            job = self._jobs.get(job_id)
            return replace(job) if job else None

    def subscribe(self, job_id: str, subscriber: JobSubscriber) -> tuple[JobState, Callable[[], None]] | None:
        with self._lock:
            self._trim_locked()
            job = self._jobs.get(job_id)
            if job is None:
                return None
            subscribers = self._subscribers.setdefault(job_id, set())
            subscribers.add(subscriber)
            snapshot = replace(job)

        def unsubscribe() -> None:
            with self._lock:
                job_subscribers = self._subscribers.get(job_id)
                if not job_subscribers:
                    return
                job_subscribers.discard(subscriber)
                if not job_subscribers:
                    self._subscribers.pop(job_id, None)  # Clean up empty listener sets eagerly.

        return snapshot, unsubscribe

    def update(self, job_id: str, **changes: object) -> JobState | None:
        subscribers: set[JobSubscriber]
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            updated = replace(job, **changes)
            self._jobs[job_id] = updated
            self._trim_locked(updated.updated_at)
            subscribers = set(self._subscribers.get(job_id, set()))
            snapshot = replace(updated)
        if subscribers:
            self._notify_subscribers(job_id, snapshot, subscribers)
        return replace(snapshot)

    def append_log(self, job_id: str, message: str, updated_at: int) -> JobState | None:
        subscribers: set[JobSubscriber]
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            settings = get_settings()
            next_logs = list(job.logs)  # Clone logs before mutation.
            if message and message not in next_logs:
                next_logs.append(message)
            if len(next_logs) > settings.max_logs_per_job:
                next_logs = next_logs[-settings.max_logs_per_job:]  # Retain the most recent useful logs only.
            updated = replace(job, logs=next_logs, updated_at=updated_at)
            self._jobs[job_id] = updated
            self._trim_locked(updated_at)
            subscribers = set(self._subscribers.get(job_id, set()))
            snapshot = replace(updated)
        if subscribers:
            self._notify_subscribers(job_id, snapshot, subscribers)
        return replace(snapshot)


job_store = JobStore()  # Shared process-local store.
