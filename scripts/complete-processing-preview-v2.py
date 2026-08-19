from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
base_path=ROOT/'scripts/complete-processing-preview-v2-base.py'
source=base_path.read_text(encoding='utf-8')
# The original completion script assumed every registry entry ended with `}),`.
# Densify is the final entry and ends with `})`, so make that matcher accept either.
old="pattern=rf\"  layerTool\\(\\{{id:'{re.escape(tool_id)}'[^\\n]*\\}}\\),\""
new="pattern=rf\"  layerTool\\(\\{{id:'{re.escape(tool_id)}'[^\\n]*\\}}\\),?\""
if old not in source:
    raise RuntimeError('completion base: registry tool matcher anchor was not found')
source=source.replace(old,new,1)
exec(compile(source,str(base_path),'exec'),globals(),globals())
