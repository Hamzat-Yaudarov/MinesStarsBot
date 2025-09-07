#!/usr/bin/env python3
import os
import sys

# Wrapper to start the Node.js bot when platform calls `python /app/bot.py`.
# This allows platforms that mistakenly invoke python to still run the Node app.
NODE_CMD = os.environ.get('NODE_CMD', 'node')
SCRIPT = os.environ.get('BOT_ENTRY', 'src/bot.js')

args = [NODE_CMD, SCRIPT] + sys.argv[1:]

# Replace current process with node process
os.execvp(NODE_CMD, args)
