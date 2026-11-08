#!/usr/bin/env bash
# Download the BTC chord model LiveChord needs (not stored in git) and verify it.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data/livechord
F=data/btc_model_large_voca.pt
SHA=1673d23f8f9a55ae7f9e8b80a51da616debb22675b8d8b67ea6ce0ef37b0ab51
if [ ! -f "$F" ]; then
  curl -fL -o "$F" https://raw.githubusercontent.com/jayg996/BTC-ISMIR19/master/test/btc_model_large_voca.pt
fi
echo "$SHA  $F" | sha256sum -c -
