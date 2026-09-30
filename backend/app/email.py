import hashlib
import json
import logging
import os
import secrets
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AdminSetting, EmailCode, User
from .security import SECRET


def configured() -> bool:
    return bool(os.getenv("BREVO_API_KEY") and os.getenv("BREVO_SENDER_EMAIL"))


def code_digest(code: str) -> str:
    return hashlib.sha256(f"{SECRET}:{code}".encode()).hexdigest()


def send_email(to: str, subject: str, body: str) -> None:
    api_key = os.getenv("BREVO_API_KEY")
    sender = os.getenv("BREVO_SENDER_EMAIL")
    if not api_key or not sender:
        raise HTTPException(503, "Email service is not configured")
    data = json.dumps(
        {
            "sender": {"email": sender, "name": "NearBites"},
            "to": [{"email": to}],
            "subject": subject,
            "textContent": body,
        }
    ).encode()
    request = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=data,
        headers={
            "api-key": api_key,
            "content-type": "application/json",
            "accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            if response.status != 201:
                raise HTTPException(503, "Email delivery was not accepted")
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(503, "Email delivery is unavailable") from exc


def create_and_send_code(db: Session, user: User, purpose: str) -> None:
    now = datetime.now(timezone.utc)
    latest = db.scalar(
        select(EmailCode)
        .where(EmailCode.user_id == user.id, EmailCode.purpose == purpose)
        .order_by(EmailCode.created_at.desc())
        .limit(1)
    )
    if latest and latest.created_at.replace(tzinfo=timezone.utc) > now - timedelta(seconds=30):
        raise HTTPException(429, "Please wait before requesting another code")
    code = f"{secrets.randbelow(1_000_000):06d}"
    row = EmailCode(
        user_id=user.id,
        purpose=purpose,
        code_hash=code_digest(code),
        expires_at=now + timedelta(minutes=10),
    )
    db.add(row)
    db.flush()
    subjects = {
        "verify": "Verify your NearBites email",
        "reset": "Reset your NearBites password",
        "admin_invite": "Your NearBites admin invitation",
    }
    if purpose not in subjects:
        raise ValueError("Unknown email code purpose")
    next_step = ""
    if purpose == "admin_invite":
        next_step = f" Open {os.getenv('FRONTEND_ORIGIN', 'http://127.0.0.1:8080')}/admin-invite to accept it."
    send_email(
        user.email,
        subjects[purpose],
        f"Your NearBites code is {code}. It expires in 10 minutes.{next_step}",
    )


def consume_code(db: Session, user: User, purpose: str, code: str) -> None:
    now = datetime.now(timezone.utc)
    row = db.scalar(
        select(EmailCode)
        .where(
            EmailCode.user_id == user.id,
            EmailCode.purpose == purpose,
            EmailCode.consumed.is_(False),
        )
        .order_by(EmailCode.created_at.desc())
        .limit(1)
    )
    if row is None or row.expires_at.replace(tzinfo=timezone.utc) < now or row.attempts >= 5:
        raise HTTPException(400, "Invalid or expired code")
    if not secrets.compare_digest(row.code_hash, code_digest(code)):
        row.attempts += 1
        db.commit()
        raise HTTPException(400, "Invalid or expired code")
    row.consumed = True


def notify(db: Session, recipient: User, subject: str, body: str) -> None:
    if recipient.email.endswith("@demo.nearbites.invalid"):
        return
    setting = db.get(AdminSetting, "notifications_enabled")
    if setting and setting.value == "false":
        return
    if not configured():
        return
    try:
        send_email(recipient.email, subject, body)
    except HTTPException:
        logging.exception("Could not deliver transactional notification")
