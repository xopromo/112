# USE Optimizer v6

> Читай этот файл первым. Полная документация — в MANIFEST.md.

## Файлы проекта
```
shell.html      — HTML + CSS (~1756 строк)
ui.js           — UI JavaScript (~4722 строк)  ← основной файл
core.js         — индикаторы + бэктест (~754 строк)
opt.js          — оптимизатор + OOS (~2290 строк)
pine_export.js  — Pine Script генератор (~1081 строк)
```

## Главное правило
**Никогда не трогай `USE_Optimizer_v6_built.html`** — это артефакт сборки.

## Сборка и проверка
```bash
bash check.sh          # сборка + синтаксис JS (обязательно после каждой правки)
python3 refresh_manifest.py   # обновить номера строк в MANIFEST.md
```

## Навигация по ui.js
Секции помечены маркерами `##UI_*##`. Найти список:
```bash
grep -n "##UI_" ui.js
```
Маркеры: `##UI_INIT##` `##UI_TABLE##` `##UI_ROBUST##` `##UI_HC##` `##UI_EQUITY##` `##UI_EXPORT##` `##UI_OOS##` `##UI_HELPERS##`

## Агенты (используй вместо прямого чтения файлов)
- `navigator` — найти функцию, прочитать секцию, проверить существование
- `checker` — запустить check.sh, проверить MANIFEST

## Нельзя трогать без явной просьбы
`_attachOOS`, `runRobustness`, `yieldToUI`, `_calcIndicators`, `buildBtCfg`
