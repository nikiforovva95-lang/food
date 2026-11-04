#!/usr/bin/env bash
set -euo pipefail
export FOODLAB_RUNTIME=/workspace/food-runtime-staging
export FOODLAB_STACK_NAME=foodlab-supabase-staging
export FOODLAB_AUTH_PORT=54341
export FOODLAB_REST_PORT=54342
exec bash "$(dirname "$0")/start-supabase.sh"
