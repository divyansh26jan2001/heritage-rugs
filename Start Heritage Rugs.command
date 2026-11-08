#!/bin/bash
cd "$(dirname "$0")"
PORT=8000
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then PORT=8001; fi
python3 -m http.server "$PORT" >/tmp/heritage-rugs-demo-server.log 2>&1 &
SERVER_PID=$!
sleep 1
open "http://localhost:$PORT"
echo "Heritage Rugs demo is running at http://localhost:$PORT"
echo "Keep this Terminal window open while you use the demo. Press Control+C to stop it."
wait "$SERVER_PID"