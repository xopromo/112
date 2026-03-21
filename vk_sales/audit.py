"""
Website audit via Google PageSpeed Insights API.
Free tier: 100 req/day without key, 25 000 req/day with free Google Cloud key.
"""
import json
import logging
import urllib.request
import urllib.parse
import urllib.error
from typing import Optional

logger = logging.getLogger(__name__)

PAGESPEED_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"


def _score_emoji(score: Optional[float]) -> str:
    if score is None:
        return "⚪"
    if score >= 0.9:
        return "🟢"
    if score >= 0.5:
        return "🟡"
    return "🔴"


def fetch_pagespeed(url: str, api_key: str = None) -> Optional[dict]:
    """Call PageSpeed Insights API. Returns parsed JSON or None on error."""
    qs_parts = [
        ("url",      url),
        ("strategy", "mobile"),
        ("category", "performance"),
        ("category", "seo"),
        ("category", "accessibility"),
        ("category", "best-practices"),
    ]
    if api_key:
        qs_parts.append(("key", api_key))

    full_url = f"{PAGESPEED_URL}?{urllib.parse.urlencode(qs_parts)}"
    req = urllib.request.Request(
        full_url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; VKSalesBot/1.0)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        logger.error("[pagespeed] HTTP %s: %s", e.code, body[:200])
    except Exception as ex:
        logger.error("[pagespeed] error: %s", ex)
    return None


def format_audit_report(data: dict, url: str) -> str:
    """Format PageSpeed API response into a concise VK message."""
    cats   = data.get("lighthouseResult", {}).get("categories", {})
    audits = data.get("lighthouseResult", {}).get("audits", {})

    def cat_score(key) -> Optional[float]:
        return cats.get(key, {}).get("score")

    def pct(s) -> str:
        return f"{int(s * 100)}/100" if s is not None else "—"

    perf = cat_score("performance")
    seo  = cat_score("seo")
    acc  = cat_score("accessibility")
    bp   = cat_score("best-practices")

    lcp = audits.get("largest-contentful-paint", {})
    cls = audits.get("cumulative-layout-shift", {})

    lcp_val   = lcp.get("displayValue", "")
    cls_val   = cls.get("displayValue", "")
    lcp_score = lcp.get("score")
    cls_score = cls.get("score")

    # Top failed audits with actionable titles
    problems = []
    for audit in audits.values():
        if (audit.get("score") is not None
                and audit.get("score") < 0.9
                and audit.get("title")
                and audit.get("details", {}).get("type") in ("opportunity", "table")):
            problems.append(audit["title"])
    problems = problems[:3]

    # Shorten URL for display
    display_url = url.replace("https://", "").replace("http://", "").rstrip("/")
    if len(display_url) > 35:
        display_url = display_url[:35] + "…"

    lines = [
        f"🔍 Аудит сайта: {display_url}",
        "",
        "📊 Оценки (мобильная версия):",
        f"• Производительность: {pct(perf)} {_score_emoji(perf)}",
        f"• SEO: {pct(seo)} {_score_emoji(seo)}",
        f"• Доступность: {pct(acc)} {_score_emoji(acc)}",
        f"• Практики: {pct(bp)} {_score_emoji(bp)}",
    ]

    if lcp_val or cls_val:
        lines += ["", "⚡ Скорость загрузки:"]
        if lcp_val:
            lines.append(f"• Главный контент (LCP): {lcp_val} {_score_emoji(lcp_score)}")
        if cls_val:
            lines.append(f"• Стабильность страницы (CLS): {cls_val} {_score_emoji(cls_score)}")

    if problems:
        lines += ["", "⚠️ Что можно улучшить:"]
        for p in problems:
            lines.append(f"• {p}")

    lines += ["", "💡 Разберём подробнее и расскажем как это исправить?"]

    return "\n".join(lines)


def run_audit(url: str, api_key: str = None) -> Optional[str]:
    """
    Full audit pipeline: fetch PageSpeed data → format report.
    Returns formatted string or None if API call failed.
    """
    data = fetch_pagespeed(url, api_key)
    if not data:
        return None
    try:
        return format_audit_report(data, url)
    except Exception as e:
        logger.error("[pagespeed] format error: %s", e)
        return None
