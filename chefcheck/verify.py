#!/usr/bin/env python3
"""Business logic: turn raw detections into a hygiene-compliance verdict.

Deliberately separate from the model so thresholds can be retuned, and the rules
unit-tested, without touching inference.

    python verify.py        # runs the self-check
"""
import os
from dataclasses import dataclass, asdict

HAIRNET, GLOVE = 0, 1


@dataclass
class Policy:
    hairnet_confidence: float = 0.60
    glove_confidence: float = 0.60
    required_gloves: int = 2
    require_hairnet: bool = True

    @classmethod
    def from_env(cls):
        """Env overrides so deployments retune without a redeploy."""
        return cls(
            hairnet_confidence=float(os.getenv("HAIRNET_CONFIDENCE", cls.hairnet_confidence)),
            glove_confidence=float(os.getenv("GLOVE_CONFIDENCE", cls.glove_confidence)),
            required_gloves=int(os.getenv("REQUIRED_GLOVES", cls.required_gloves)),
            require_hairnet=os.getenv("REQUIRE_HAIRNET", "1") not in ("0", "false", "False"),
        )


def verify(detections, policy=None):
    """detections: iterable of (class_id, confidence). Returns the API response dict.

    LIMITATION (see README): a detected glove is a glove that is *visible*, not one that
    is provably *worn*. A glove on the prep bench counts here. Same for a hairnet hanging
    on a hook. v1 verifies presence of the hygiene kit, nothing stronger.
    """
    p = policy or Policy.from_env()

    hn = sorted((c for k, c in detections if k == HAIRNET and c >= p.hairnet_confidence), reverse=True)
    gl = sorted((c for k, c in detections if k == GLOVE and c >= p.glove_confidence), reverse=True)

    hairnet_ok = bool(hn) if p.require_hairnet else True
    gloves_ok = len(gl) >= p.required_gloves

    reasons = []
    if not hairnet_ok:
        reasons.append(f"no hairnet at confidence >= {p.hairnet_confidence}")
    if not gloves_ok:
        reasons.append(f"found {len(gl)} glove(s), need {p.required_gloves} at confidence >= {p.glove_confidence}")

    return {
        "verified": hairnet_ok and gloves_ok,
        "hairnet": {"detected": bool(hn), "confidence": round(hn[0], 4) if hn else 0.0},
        "gloves": {"detected": gloves_ok, "count": len(gl), "confidences": [round(c, 4) for c in gl]},
        "reasons": reasons,
        "policy": asdict(p),
    }


def _selfcheck():
    p = Policy()
    r = verify([(HAIRNET, 0.94), (GLOVE, 0.91), (GLOVE, 0.88)], p)
    assert r["verified"] and r["gloves"]["count"] == 2 and r["hairnet"]["confidence"] == 0.94, r

    r = verify([(HAIRNET, 0.91)], p)
    assert not r["verified"] and r["gloves"] == {"detected": False, "count": 0, "confidences": []}, r

    # one glove is not two
    assert not verify([(HAIRNET, 0.9), (GLOVE, 0.9)], p)["verified"]
    # low-confidence detections are filtered out, not counted
    r = verify([(HAIRNET, 0.59), (GLOVE, 0.99), (GLOVE, 0.59)], p)
    assert not r["verified"] and not r["hairnet"]["detected"] and r["gloves"]["count"] == 1, r
    # thresholds are configurable, not hard-coded
    assert verify([(HAIRNET, 0.59), (GLOVE, 0.59), (GLOVE, 0.59)],
                  Policy(0.5, 0.5, 2))["verified"]
    # a site that only requires gloves
    assert verify([(GLOVE, 0.9), (GLOVE, 0.9)], Policy(require_hairnet=False))["verified"]
    # confidences come back sorted, highest first
    assert verify([(GLOVE, 0.7), (GLOVE, 0.95)], p)["gloves"]["confidences"] == [0.95, 0.7]
    print("verify.py self-check passed")


if __name__ == "__main__":
    _selfcheck()
