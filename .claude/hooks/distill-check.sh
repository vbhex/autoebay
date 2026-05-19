#!/bin/bash
# Stop-hook: block session-end if platform knowledge was edited but /distill never ran.
# Receives JSON on stdin with .transcript_path pointing to the session's JSONL transcript.

set -e

input=$(cat)
transcript=$(echo "$input" | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin).get("transcript_path",""))' 2>/dev/null)

if [ -z "$transcript" ] || [ ! -f "$transcript" ]; then
  exit 0  # no transcript → don't block
fi

# Was /distill invoked in this session?
if grep -q '"skill"[[:space:]]*:[[:space:]]*"distill"' "$transcript" 2>/dev/null; then
  exit 0  # distill ran → allow stop
fi

# Did this session touch any platform-knowledge files?
# We look in the transcript JSONL for Edit/Write tool_use events whose `file_path` matches
# any of the platform-affecting code paths.
touched=$(grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*(polish-products\.ts|1688Scraper\.ts|blue-ocean-search-terms\.json|attribute-mapper\.ts|column-mapping\.ts|excel-generator\.ts|upload-and-check\.ts|PlatformKnowledge\.swift|LocalLLMService\.swift)"' "$transcript" 2>/dev/null | head -1)

if [ -z "$touched" ]; then
  exit 0  # no platform edits → allow stop
fi

# Platform code touched but no /distill → block stop and remind
cat <<JSON
{"decision":"block","reason":"You edited platform-knowledge code this session (polish-products / 1688Scraper / blue-ocean-search-terms / etc.) but did NOT invoke /distill. Before ending the session, run the distill skill so this learning ships in the next AutoStore release. See rules/CONTRIBUTING_PLATFORM_KNOWLEDGE.md."}
JSON
