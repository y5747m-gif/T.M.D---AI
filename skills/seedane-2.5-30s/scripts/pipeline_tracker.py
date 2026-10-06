#!/usr/bin/env python3
"""Pipeline bookkeeping for the Seedane 2.5 30s skill.

Keeps a small JSON ledger of video jobs so a multi-video request never drops a
pending generation, and so retries are bounded.

State file: /tmp/seedane_2_5_30s_pipeline.json (override with SEEDANE_STATE).

Commands
--------
  init     [--force]                       create / reset the ledger
  enqueue  --prompt P [--duration 30] [--ratio 16:9] [--mode text]
           [--reference "image=https://... : role"]... [--label L]
  dispatch [--id ID]                       mark the next queued job as dispatched
  mark     --id ID --status STATUS [--url U] [--error E]
  status   [--id ID]                       show one job or the whole ledger
  summary                                  one-line counts + delivery list
  next                                     print the next job to dispatch (JSON)

Statuses: queued, dispatched, running, succeeded, failed, cancelled.

Exit codes: 0 ok, 1 usage/state error, 2 nothing to do.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid

STATE_PATH = os.environ.get("SEEDANE_STATE", "/tmp/seedane_2_5_30s_pipeline.json")

MODEL_VERSION = "seedance_2.5"
MIN_DURATION = 4
MAX_DURATION = 30
DEFAULT_DURATION = 30
MAX_RETRIES = 3
DISPATCH_GAP_SECONDS = 5

TERMINAL = {"succeeded", "failed", "cancelled"}
STATUSES = {"queued", "dispatched", "running"} | TERMINAL


# --------------------------------------------------------------------------- state


def empty_state() -> dict:
    return {
        "version": 1,
        "model_version": MODEL_VERSION,
        "created_at": time.time(),
        "last_dispatch_at": 0.0,
        "jobs": [],
    }


def load_state() -> dict:
    if not os.path.exists(STATE_PATH):
        return empty_state()
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as handle:
            state = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return empty_state()
    if not isinstance(state, dict) or not isinstance(state.get("jobs"), list):
        return empty_state()
    state.setdefault("model_version", MODEL_VERSION)
    state.setdefault("last_dispatch_at", 0.0)
    return state


def save_state(state: dict) -> None:
    tmp = f"{STATE_PATH}.tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(state, handle, ensure_ascii=False, indent=2)
    os.replace(tmp, STATE_PATH)


def find_job(state: dict, job_id: str) -> dict | None:
    for job in state["jobs"]:
        if job["id"] == job_id:
            return job
    return None


# --------------------------------------------------------------------------- helpers


def clamp_duration(raw) -> tuple[int, str]:
    """Honour the true model range [4, 30]; never the legacy 15s cap."""
    if raw is None or raw == "":
        return DEFAULT_DURATION, ""
    try:
        value = round(float(raw))
    except (TypeError, ValueError):
        return DEFAULT_DURATION, f"Unparsable duration {raw!r}; using {DEFAULT_DURATION}s."
    if value > MAX_DURATION:
        return MAX_DURATION, f"Requested {value}s; true model maximum is {MAX_DURATION}s."
    if value < MIN_DURATION:
        return MIN_DURATION, f"Requested {value}s; true model minimum is {MIN_DURATION}s."
    return value, ""


def parse_reference(raw: str) -> dict:
    """Parse 'image=https://example.com/a.png : character identity'.

    The role separator is ' : ' (spaced) or '|', so that the ':' inside an
    https:// URL is never mistaken for the separator.
    """
    kind, sep, rest = raw.partition("=")
    kind = kind.strip().lower()
    if not sep or kind not in {"image", "video", "audio"}:
        raise ValueError(f"reference must start with image=|video=|audio=, got {raw!r}")

    rest = rest.strip()
    for separator in (" : ", "|"):
        if separator in rest:
            source, _, role = rest.partition(separator)
            break
    else:
        source, role = rest, ""

    source, role = source.strip(), role.strip()
    if not source:
        raise ValueError(f"reference {raw!r} has no source URL")
    return {"type": kind, "source": source, "role": role}


def ratio_for(text: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    lowered = text.lower()
    vertical = ("tiktok", "reels", "reel", "shorts", "story", "vertical", "mobile", "phone")
    wide = ("youtube", "landscape", "cinema", "cinematic", "wide", "tv", "presentation")
    if any(word in lowered for word in vertical):
        return "9:16"
    if "square" in lowered or "instagram post" in lowered:
        return "1:1"
    if any(word in lowered for word in wide):
        return "16:9"
    return "16:9"


# --------------------------------------------------------------------------- commands


def cmd_init(args) -> int:
    if os.path.exists(STATE_PATH) and not args.force:
        print(f"Ledger already exists at {STATE_PATH}; pass --force to reset.", file=sys.stderr)
        return 1
    save_state(empty_state())
    print(json.dumps({"ok": True, "state": STATE_PATH}, ensure_ascii=False))
    return 0


def cmd_enqueue(args) -> int:
    state = load_state()
    duration, note = clamp_duration(args.duration)
    try:
        references = [parse_reference(item) for item in (args.reference or [])]
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    mode = args.mode or ("reference" if references else "text")
    job = {
        "id": args.id or f"job-{uuid.uuid4().hex[:8]}",
        "label": args.label or "",
        "prompt": args.prompt,
        "mode": mode,
        "model_version": MODEL_VERSION,
        "duration": duration,
        "ratio": ratio_for(args.prompt, args.ratio),
        "references": references,
        "status": "queued",
        "retries": 0,
        "video_url": "",
        "error": "",
        "notes": [note] if note else [],
        "enqueued_at": time.time(),
        "dispatched_at": 0.0,
        "finished_at": 0.0,
    }
    state["jobs"].append(job)
    save_state(state)
    print(json.dumps(job, ensure_ascii=False, indent=2))
    return 0


def cmd_next(_args) -> int:
    state = load_state()
    for job in state["jobs"]:
        if job["status"] == "queued":
            wait = max(0.0, DISPATCH_GAP_SECONDS - (time.time() - state["last_dispatch_at"]))
            print(json.dumps({"job": job, "wait_seconds": round(wait, 2)}, ensure_ascii=False, indent=2))
            return 0
    print(json.dumps({"job": None, "wait_seconds": 0}, ensure_ascii=False))
    return 2


def cmd_dispatch(args) -> int:
    state = load_state()
    job = find_job(state, args.id) if args.id else next(
        (item for item in state["jobs"] if item["status"] == "queued"), None
    )
    if job is None:
        print("No queued job to dispatch.", file=sys.stderr)
        return 2

    job["status"] = "dispatched"
    job["dispatched_at"] = time.time()
    state["last_dispatch_at"] = job["dispatched_at"]
    save_state(state)
    print(json.dumps(job, ensure_ascii=False, indent=2))
    return 0


def cmd_mark(args) -> int:
    state = load_state()
    job = find_job(state, args.id)
    if job is None:
        print(f"Unknown job id {args.id!r}.", file=sys.stderr)
        return 1
    if args.status not in STATUSES:
        print(f"Status must be one of: {', '.join(sorted(STATUSES))}.", file=sys.stderr)
        return 1

    status = args.status
    if status == "succeeded" and not (args.url or job["video_url"]):
        # An empty URL is a failure, not a success — retry it.
        status = "failed"
        args.error = args.error or "Provider returned an empty video URL."

    if status == "failed" and job["retries"] < MAX_RETRIES:
        job["retries"] += 1
        job["status"] = "queued"
        job["error"] = args.error or "unknown error"
        job["notes"].append(f"Retry {job['retries']}/{MAX_RETRIES}: {job['error']}")
    else:
        job["status"] = status
        if args.url:
            job["video_url"] = args.url
        if args.error:
            job["error"] = args.error
        if status in TERMINAL:
            job["finished_at"] = time.time()

    save_state(state)
    print(json.dumps(job, ensure_ascii=False, indent=2))
    return 0


def cmd_status(args) -> int:
    state = load_state()
    if args.id:
        job = find_job(state, args.id)
        if job is None:
            print(f"Unknown job id {args.id!r}.", file=sys.stderr)
            return 1
        print(json.dumps(job, ensure_ascii=False, indent=2))
        return 0
    print(json.dumps(state, ensure_ascii=False, indent=2))
    return 0


def cmd_summary(_args) -> int:
    state = load_state()
    counts: dict[str, int] = {}
    for job in state["jobs"]:
        counts[job["status"]] = counts.get(job["status"], 0) + 1

    delivered = [
        {"id": job["id"], "label": job["label"], "url": job["video_url"]}
        for job in state["jobs"]
        if job["status"] == "succeeded" and job["video_url"]
    ]
    pending = [job["id"] for job in state["jobs"] if job["status"] not in TERMINAL]
    failed = [
        {"id": job["id"], "error": job["error"]}
        for job in state["jobs"]
        if job["status"] == "failed"
    ]

    print(json.dumps(
        {
            "model_version": state.get("model_version", MODEL_VERSION),
            "counts": counts,
            "delivered": delivered,
            "pending": pending,
            "failed": failed,
        },
        ensure_ascii=False,
        indent=2,
    ))
    return 0


# --------------------------------------------------------------------------- cli


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="create or reset the ledger")
    p_init.add_argument("--force", action="store_true")
    p_init.set_defaults(func=cmd_init)

    p_enqueue = sub.add_parser("enqueue", help="add a job to the pipeline")
    p_enqueue.add_argument("--prompt", required=True, help="English prompt")
    p_enqueue.add_argument("--duration", default=DEFAULT_DURATION)
    p_enqueue.add_argument("--ratio")
    p_enqueue.add_argument("--mode", choices=["text", "first-frame", "first-last", "reference", "edit", "extend"])
    p_enqueue.add_argument("--reference", action="append", metavar="TYPE=URL : ROLE")
    p_enqueue.add_argument("--label")
    p_enqueue.add_argument("--id")
    p_enqueue.set_defaults(func=cmd_enqueue)

    p_next = sub.add_parser("next", help="show the next job to dispatch")
    p_next.set_defaults(func=cmd_next)

    p_dispatch = sub.add_parser("dispatch", help="mark a job as dispatched")
    p_dispatch.add_argument("--id")
    p_dispatch.set_defaults(func=cmd_dispatch)

    p_mark = sub.add_parser("mark", help="record a job outcome")
    p_mark.add_argument("--id", required=True)
    p_mark.add_argument("--status", required=True)
    p_mark.add_argument("--url", default="")
    p_mark.add_argument("--error", default="")
    p_mark.set_defaults(func=cmd_mark)

    p_status = sub.add_parser("status", help="dump a job or the whole ledger")
    p_status.add_argument("--id")
    p_status.set_defaults(func=cmd_status)

    p_summary = sub.add_parser("summary", help="counts plus the delivery list")
    p_summary.set_defaults(func=cmd_summary)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
