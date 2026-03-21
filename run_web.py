#!/usr/bin/env python3
"""Точка входа веб-интерфейса VK Sales Bot."""
import sys
import traceback

try:
    from vk_sales.web_app import run_web
    run_web(debug=True)
except Exception:
    traceback.print_exc()
    input("\nНажми Enter для выхода...")
    sys.exit(1)
