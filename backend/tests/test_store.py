from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]  # Reach the repo root from backend/tests.
sys.path.insert(0, str(PROJECT_ROOT / "backend" / "src"))  # Import the backend package without installing it.

from volcengine_service.models import JobState
from volcengine_service.store import JobStore


def build_job_state(**overrides: object) -> JobState:
    payload = {
        "id": "job-1",
        "model_id": "doubao-seedance-2-0-260128",
        "model_label": "Seedance 2",
        "variant": "smart",
        "prompt": "test prompt",
        "status": "IN_QUEUE",
        "created_at": 1,
        "updated_at": 1,
        "logs": [],
    }
    payload.update(overrides)
    return JobState(**payload)  # Keep store tests focused on subscription behavior instead of job shape setup.


class JobStoreTests(unittest.TestCase):
    def test_subscribers_receive_update_and_log_snapshots(self) -> None:
        store = JobStore()
        store.create(build_job_state())
        snapshots: list[JobState] = []

        subscription = store.subscribe("job-1", snapshots.append)
        self.assertIsNotNone(subscription)
        _, unsubscribe = subscription or (None, lambda: None)

        store.update("job-1", status="IN_PROGRESS", updated_at=2)
        store.append_log("job-1", "Preparing Volcengine request", updated_at=3)
        unsubscribe()
        store.update("job-1", status="COMPLETED", updated_at=4)

        self.assertEqual([snapshot.status for snapshot in snapshots], ["IN_PROGRESS", "IN_PROGRESS"])
        self.assertEqual(snapshots[-1].logs, ["Preparing Volcengine request"])


if __name__ == "__main__":
    unittest.main()
